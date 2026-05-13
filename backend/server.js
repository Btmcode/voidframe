require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const { generateScenePrompts } = require('./services/promptEngine');
const { runVideoAutomation } = require('./services/videoAutomation');
const { runPythonWorker } = require('./services/pythonBridge');
const { generateTTS } = require('./services/ttsService');
const { mergeVideos, mergeAudioVideo } = require('./services/ffmpegService');

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || '*';

const io = new Server(server, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'] }
});

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// Serve rendered videos
const RENDERS_DIR = process.env.RENDERS_DIR || path.join(require('os').tmpdir(), 'voidframe-renders');
if (!fs.existsSync(RENDERS_DIR)) fs.mkdirSync(RENDERS_DIR, { recursive: true });
app.use('/renders', express.static(RENDERS_DIR));

// In-memory job store
const jobs = {};

// ── Utilities ─────────────────────────────────────────────────────────────────
function updateJob(jobId, patch) {
  if (!jobs[jobId]) return;
  Object.assign(jobs[jobId], patch);
  io.to(jobId).emit('progress', jobs[jobId]);
  console.log(`[${jobId.slice(0, 8)}] Step ${jobs[jobId].step}/${jobs[jobId].totalSteps}: ${jobs[jobId].stepLabel}`);
}

function emitLog(jobId, msg) {
  io.to(jobId).emit('log', { msg, ts: Date.now() });
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/", (_, res) => res.json({ name: "VOIDFRAME API", status: "ok", version: "1.0.0" }));

app.get('/health', (_, res) => res.json({
  status: 'ok',
  ts: Date.now(),
  ffmpeg: true,
  python: true
}));

app.get('/job/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.get('/job/:id/clips', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const dir = path.join(RENDERS_DIR, req.params.id);
  if (!fs.existsSync(dir)) return res.json({ clips: [] });
  const clips = fs.readdirSync(dir)
    .filter(f => f.match(/^scene_\d+\.mp4$/))
    .sort()
    .map(f => ({ name: f, url: `/renders/${req.params.id}/${f}` }));
  res.json({ clips });
});

app.post('/generate', async (req, res) => {
  const { prompt, scenes = 3, style = 'cinematic' } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
    return res.status(400).json({ error: 'prompt must be at least 3 characters' });
  }

  const jobId = uuidv4();
  const renderDir = path.join(RENDERS_DIR, jobId);
  fs.mkdirSync(renderDir, { recursive: true });

  jobs[jobId] = {
    id: jobId,
    prompt: prompt.trim(),
    scenes: Math.min(Math.max(parseInt(scenes) || 3, 1), 5),
    style,
    status: 'queued',
    step: 0,
    totalSteps: 9,
    stepLabel: 'Queued...',
    scenePrompts: [],
    clips: [],
    audioUrl: null,
    videoUrl: null,
    error: null,
    createdAt: Date.now()
  };

  res.json({ jobId });

  // Run async, don't await
  runPipeline(jobId, renderDir).catch(err => {
    console.error('[Pipeline fatal]', err);
    updateJob(jobId, { status: 'failed', error: err.message, stepLabel: `❌ ${err.message}` });
  });
});

// ── Pipeline ──────────────────────────────────────────────────────────────────
async function runPipeline(jobId, renderDir) {
  const job = jobs[jobId];
  const { prompt, scenes, style } = job;

  try {
    // Step 1 — Scene decomposition
    updateJob(jobId, { status: 'running', step: 1, stepLabel: '🧠 Decomposing prompt into scenes...' });
    const scenePrompts = await generateScenePrompts(prompt, scenes, style);
    updateJob(jobId, { step: 2, stepLabel: `✅ ${scenePrompts.length} scenes ready`, scenePrompts });

    // Steps 3-5 — Generate each scene video
    const clips = [];
    for (let i = 0; i < scenePrompts.length; i++) {
      updateJob(jobId, {
        step: 2 + i + 1,
        stepLabel: `🎬 Generating scene ${i + 1}/${scenePrompts.length}...`,
        currentScene: i + 1
      });

      const clipPath = await runVideoAutomation(
        scenePrompts[i], renderDir, i,
        (msg) => emitLog(jobId, `[Scene ${i + 1}] ${msg}`)
      );

      if (clipPath && fs.existsSync(clipPath) && fs.statSync(clipPath).size > 0) {
        clips.push(clipPath);
        updateJob(jobId, {
          clips: clips.map((c, idx) => ({
            name: path.basename(c),
            url: `/renders/${jobId}/${path.basename(c)}`
          })),
          stepLabel: `✅ Scene ${i + 1}/${scenePrompts.length} captured`
        });
      } else {
        emitLog(jobId, `⚠️ Scene ${i + 1} produced no output, skipping`);
      }
    }

    if (clips.length === 0) throw new Error('No clips were generated. Check automation settings.');

    // Step 6 — Python worker scores + creates filelist
    updateJob(jobId, { step: 6, stepLabel: '🐍 Python worker processing clips...' });
    const filelistPath = await runPythonWorker(clips, renderDir);
    emitLog(jobId, `filelist.txt created with ${clips.length} clips`);

    // Step 7 — FFmpeg merge
    updateJob(jobId, { step: 7, stepLabel: '🎞️ Merging video clips with FFmpeg...' });
    const mergedPath = await mergeVideos(filelistPath, renderDir);
    emitLog(jobId, `Merged video: ${path.basename(mergedPath)}`);

    // Step 8 — TTS
    updateJob(jobId, { step: 8, stepLabel: '🔊 Generating voice narration...' });
    const audioPath = await generateTTS(prompt, renderDir);
    emitLog(jobId, audioPath ? 'TTS audio generated' : 'TTS skipped (silent fallback)');

    // Step 9 — Final merge
    updateJob(jobId, { step: 9, stepLabel: '🎬 Rendering final video...' });
    const finalPath = await mergeAudioVideo(mergedPath, audioPath, renderDir);

    updateJob(jobId, {
      status: 'complete',
      step: 9,
      stepLabel: '🎉 Video ready!',
      videoUrl: `/renders/${jobId}/${path.basename(finalPath)}`,
      audioUrl: audioPath ? `/renders/${jobId}/voice.mp3` : null
    });

  } catch (err) {
    console.error('[Pipeline error]', err);
    updateJob(jobId, {
      status: 'failed',
      stepLabel: `❌ ${err.message}`,
      error: err.message
    });
  }
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  socket.on('subscribe', jobId => {
    socket.join(jobId);
    if (jobs[jobId]) socket.emit('progress', jobs[jobId]);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 VOIDFRAME backend running on port ${PORT}`);
  console.log(`   Renders dir: ${RENDERS_DIR}`);
});
