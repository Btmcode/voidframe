'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

const EXAMPLE_PROMPTS = [
  'A lone astronaut discovers ancient alien ruins on Mars at sunset',
  'Cyberpunk city street at night, neon signs reflected in rain puddles',
  'Ancient forest awakening with bioluminescent creatures at dawn',
  'A submarine glides through glowing deep ocean waters',
  'Time-lapse of a futuristic city being built in a desert',
];

const STYLES = ['cinematic', 'anime', 'documentary', 'fantasy', 'minimal'] as const;

interface Clip { name: string; url: string; }
interface Job {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  step: number;
  totalSteps: number;
  stepLabel: string;
  scenePrompts?: string[];
  clips?: Clip[];
  videoUrl?: string;
  audioUrl?: string;
  error?: string;
}

export default function VideoGenerator() {
  const [prompt, setPrompt] = useState('');
  const [scenes, setScenes] = useState(3);
  const [style, setStyle] = useState<string>('cinematic');
  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<{ text: string; type: 'info' | 'success' | 'warn' | 'error' }[]>([]);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const isRunning = job?.status === 'queued' || job?.status === 'running';
  const progress = job ? Math.round((job.step / job.totalSteps) * 100) : 0;

  // Health check
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(5000) });
        setBackendOnline(r.ok);
      } catch { setBackendOnline(false); }
    };
    check();
    const id = setInterval(check, 20000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = useCallback((text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const ts = new Date().toLocaleTimeString('en', { hour12: false });
    setLogs(prev => [...prev.slice(-100), { text: `[${ts}] ${text}`, type }]);
  }, []);

  async function startGeneration() {
    if (!prompt.trim() || isRunning) return;

    setJob(null);
    setLogs([]);
    addLog('Initiating pipeline...', 'info');

    try {
      const res = await fetch(`${BACKEND}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), scenes, style }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Server error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const { jobId } = await res.json();
      if (!jobId) throw new Error('No job ID returned');

      addLog(`Job created: ${jobId.slice(0, 8)}...`, 'success');

      // WebSocket connection
      socketRef.current?.disconnect();
      const socket = io(BACKEND, { transports: ['websocket', 'polling'] });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('subscribe', jobId);
        addLog('Connected to render pipeline', 'success');
      });

      socket.on('progress', (data: Job) => {
        setJob(data);
        if (data.stepLabel) {
          const type = data.status === 'failed' ? 'error'
            : data.stepLabel.includes('✅') ? 'success'
            : data.stepLabel.includes('⚠') ? 'warn' : 'info';
          addLog(data.stepLabel, type);
        }
        if (data.status === 'complete' || data.status === 'failed') {
          socket.disconnect();
        }
      });

      socket.on('log', ({ msg }: { msg: string }) => {
        const type = msg.includes('✅') ? 'success'
          : msg.includes('⚠') || msg.includes('failed') ? 'warn'
          : msg.includes('ERROR') ? 'error' : 'info';
        addLog(msg, type);
      });

      socket.on('connect_error', () => addLog('WebSocket connection error', 'warn'));

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addLog(`ERROR: ${message}`, 'error');
      setJob(prev => prev ? { ...prev, status: 'failed', error: message } : null);
    }
  }

  function handlePromptClick(p: string) {
    setPrompt(p);
  }

  const statusColor = !job ? 'var(--green)'
    : job.status === 'complete' ? 'var(--green)'
    : job.status === 'failed' ? 'var(--red)'
    : 'var(--amber)';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
      {/* ── LEFT COLUMN ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Input panel */}
        <div className="panel" style={{ padding: 24, borderRadius: 4 }}>
          <div style={{ fontSize: 11, opacity: 0.45, letterSpacing: '0.15em', marginBottom: 16 }}>
            PROMPT INPUT
          </div>

          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) startGeneration(); }}
            placeholder="Describe your video scene in detail... (Ctrl+Enter to generate)"
            disabled={isRunning}
            rows={4}
            style={{
              width: '100%', padding: '12px 16px',
              background: 'rgba(0,255,136,0.03)',
              border: '1px solid var(--border)',
              color: 'var(--green)',
              fontFamily: 'Share Tech Mono, monospace',
              fontSize: 14, lineHeight: 1.6,
              resize: 'vertical', outline: 'none',
              borderRadius: 2,
              transition: 'border-color 0.2s',
            }}
            onFocus={e => (e.target.style.borderColor = 'rgba(0,255,136,0.5)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />

          {/* Controls row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
            {/* Scene count */}
            <div>
              <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 8, letterSpacing: '0.1em' }}>SCENES</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setScenes(n)} style={{
                    width: 36, height: 36, fontSize: 13, cursor: 'pointer',
                    border: '1px solid',
                    borderColor: scenes === n ? 'var(--green)' : 'var(--border)',
                    background: scenes === n ? 'rgba(0,255,136,0.1)' : 'transparent',
                    color: scenes === n ? 'var(--green)' : 'rgba(0,255,136,0.35)',
                    boxShadow: scenes === n ? '0 0 10px rgba(0,255,136,0.25)' : 'none',
                    transition: 'all 0.2s',
                    fontFamily: 'Share Tech Mono, monospace',
                  }}>{n}</button>
                ))}
              </div>
            </div>

            {/* Style */}
            <div>
              <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 8, letterSpacing: '0.1em' }}>STYLE</div>
              <select value={style} onChange={e => setStyle(e.target.value)} style={{
                background: 'rgba(7,16,10,0.9)',
                border: '1px solid var(--border)',
                color: 'var(--green)',
                fontFamily: 'Share Tech Mono, monospace',
                fontSize: 13, padding: '0 12px', height: 36,
                outline: 'none', cursor: 'pointer',
              }}>
                {STYLES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
              </select>
            </div>

            {/* Generate button */}
            <button onClick={startGeneration} disabled={!prompt.trim() || isRunning}
              style={{
                marginLeft: 'auto',
                padding: '0 32px', height: 42,
                fontFamily: 'Orbitron, monospace',
                fontSize: 13, fontWeight: 700, letterSpacing: '0.12em',
                border: '1px solid',
                borderColor: isRunning || !prompt.trim() ? 'var(--border)' : 'var(--green)',
                background: isRunning || !prompt.trim() ? 'transparent' : 'rgba(0,255,136,0.07)',
                color: isRunning || !prompt.trim() ? 'rgba(0,255,136,0.25)' : 'var(--green)',
                boxShadow: isRunning || !prompt.trim() ? 'none' : '0 0 20px rgba(0,255,136,0.15)',
                cursor: isRunning || !prompt.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}>
              {isRunning ? '■ RENDERING...' : '▶ GENERATE VIDEO'}
            </button>
          </div>
        </div>

        {/* Progress panel */}
        {job && (
          <div className="panel" style={{ padding: 24, borderRadius: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 11, opacity: 0.45, letterSpacing: '0.15em' }}>RENDER STATUS</div>
              <div style={{ fontSize: 12, color: statusColor, letterSpacing: '0.08em' }}>
                {job.status.toUpperCase()} — STEP {job.step}/{job.totalSteps}
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
              <div className={isRunning ? 'progress-shimmer' : ''}
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: job.status === 'failed' ? 'var(--red)'
                    : job.status === 'complete' ? 'var(--green)'
                    : 'linear-gradient(90deg, var(--green-dark), var(--green))',
                  boxShadow: job.status !== 'failed' ? '0 0 8px var(--green)' : 'none',
                  transition: 'width 0.5s ease',
                  borderRadius: 2,
                }} />
            </div>

            <div style={{ fontSize: 14, color: 'var(--green)', marginBottom: 16 }}>{job.stepLabel}</div>

            {/* Scene prompts */}
            {job.scenePrompts && job.scenePrompts.length > 0 && (
              <div>
                <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 10, letterSpacing: '0.1em' }}>
                  SCENE BREAKDOWN
                </div>
                {job.scenePrompts.map((sp, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 6, fontSize: 12 }}>
                    <span style={{ color: 'var(--amber)', minWidth: 24 }}>S{i + 1}</span>
                    <span style={{ opacity: 0.65 }}>{sp}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {job.error && (
              <div style={{
                padding: 12, marginTop: 12,
                border: '1px solid rgba(255,51,85,0.4)',
                background: 'rgba(255,51,85,0.05)',
                color: 'var(--red)', fontSize: 12, borderRadius: 2,
              }}>
                ERROR: {job.error}
              </div>
            )}
          </div>
        )}

        {/* Clip previews */}
        {job?.clips && job.clips.length > 0 && (
          <div className="panel" style={{ padding: 24, borderRadius: 4 }}>
            <div style={{ fontSize: 11, opacity: 0.45, letterSpacing: '0.15em', marginBottom: 16 }}>
              SCENE CLIPS — {job.clips.length} GENERATED
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {job.clips.map((clip, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <video
                    src={`${BACKEND}${clip.url}`}
                    muted loop playsInline
                    style={{
                      width: '100%', aspectRatio: '16/9',
                      objectFit: 'cover', display: 'block',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play()}
                    onMouseLeave={e => {
                      const v = e.currentTarget as HTMLVideoElement;
                      v.pause(); v.currentTime = 0;
                    }}
                  />
                  <div style={{
                    position: 'absolute', top: 6, left: 6,
                    background: 'rgba(0,0,0,0.75)',
                    color: 'var(--amber)', fontSize: 10,
                    padding: '2px 6px',
                    border: '1px solid rgba(255,184,0,0.3)',
                  }}>S{i + 1}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, opacity: 0.3, marginTop: 10 }}>Hover clips to preview</div>
          </div>
        )}

        {/* Final video */}
        {job?.videoUrl && job.status === 'complete' && (
          <div className="panel glow-box" style={{ padding: 24, borderRadius: 4 }}>
            <div style={{ fontSize: 11, opacity: 0.45, letterSpacing: '0.15em', marginBottom: 16 }}>
              🎉 FINAL OUTPUT
            </div>
            <video controls playsInline style={{
              width: '100%', borderRadius: 2,
              border: '1px solid rgba(0,255,136,0.3)',
              background: '#000', maxHeight: 480,
            }} src={`${BACKEND}${job.videoUrl}`} />
            <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <a href={`${BACKEND}${job.videoUrl}`} download="voidframe-video.mp4"
                style={{
                  padding: '10px 24px',
                  border: '1px solid var(--green)',
                  color: 'var(--green)',
                  background: 'rgba(0,255,136,0.07)',
                  fontFamily: 'Orbitron, monospace',
                  fontSize: 12, letterSpacing: '0.1em',
                  textDecoration: 'none',
                  boxShadow: '0 0 12px rgba(0,255,136,0.15)',
                }}>
                ⬇ DOWNLOAD MP4
              </a>
              {job.audioUrl && (
                <a href={`${BACKEND}${job.audioUrl}`} download="voice.mp3"
                  style={{
                    padding: '10px 24px',
                    border: '1px solid var(--border)',
                    color: 'rgba(0,255,136,0.6)',
                    fontFamily: 'Orbitron, monospace',
                    fontSize: 12, letterSpacing: '0.1em',
                    textDecoration: 'none',
                  }}>
                  ⬇ AUDIO
                </a>
              )}
            </div>
          </div>
        )}

        {/* Terminal log */}
        {logs.length > 0 && (
          <div className="panel" style={{ padding: 20, borderRadius: 4 }}>
            <div style={{ fontSize: 11, opacity: 0.45, letterSpacing: '0.15em', marginBottom: 12 }}>
              SYSTEM LOG
            </div>
            <div style={{
              maxHeight: 220, overflowY: 'auto',
              fontFamily: 'Share Tech Mono, monospace', fontSize: 12,
            }}>
              {logs.map((log, i) => (
                <div key={i} style={{
                  marginBottom: 3, lineHeight: 1.5,
                  color: log.type === 'error' ? 'var(--red)'
                    : log.type === 'success' ? 'var(--green)'
                    : log.type === 'warn' ? 'var(--amber)'
                    : 'rgba(0,255,136,0.5)',
                }}>{log.text}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* System status */}
        <div className="panel" style={{ padding: 20, borderRadius: 4 }}>
          <div style={{ fontSize: 11, opacity: 0.45, letterSpacing: '0.15em', marginBottom: 16 }}>
            SYSTEM STATUS
          </div>
          {[
            { name: 'BACKEND API', ok: backendOnline },
            { name: 'PLAYWRIGHT', ok: true },
            { name: 'FFMPEG ENGINE', ok: true },
            { name: 'PYTHON WORKER', ok: true },
            { name: 'TTS MODULE', ok: true },
          ].map(({ name, ok }) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, opacity: 0.6 }}>{name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: ok === null ? 'var(--amber)' : ok ? 'var(--green)' : 'var(--red)',
                  boxShadow: ok ? '0 0 6px var(--green)' : 'none',
                }} />
                <span style={{
                  fontSize: 11, letterSpacing: '0.05em',
                  color: ok === null ? 'var(--amber)' : ok ? 'var(--green)' : 'var(--red)',
                }}>
                  {ok === null ? 'CHECKING' : ok ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Pipeline steps */}
        <div className="panel" style={{ padding: 20, borderRadius: 4 }}>
          <div style={{ fontSize: 11, opacity: 0.45, letterSpacing: '0.15em', marginBottom: 16 }}>
            PIPELINE
          </div>
          {[
            ['01', 'PROMPT INPUT'],
            ['02', 'SCENE DECOMPOSE'],
            ['03', 'PIKA AUTOMATION'],
            ['04', 'CLIP DOWNLOAD'],
            ['05', 'RETRY / RUNWAY'],
            ['06', 'PYTHON WORKER'],
            ['07', 'FFMPEG MERGE'],
            ['08', 'GEMINI TTS'],
            ['09', 'FINAL RENDER'],
          ].map(([num, label], idx) => {
            const stepNum = idx + 1;
            const active = job && job.step === stepNum && isRunning;
            const done = job && job.step > stepNum;
            return (
              <div key={num} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  fontSize: 10, width: 20,
                  color: done ? 'var(--green)' : active ? 'var(--amber)' : 'rgba(0,255,136,0.25)',
                }}>{done ? '✓' : num}</span>
                <div style={{
                  flex: 1, height: 1,
                  background: done ? 'rgba(0,255,136,0.4)' : 'rgba(0,255,136,0.08)',
                }} />
                <span style={{
                  fontSize: 11, letterSpacing: '0.05em',
                  color: done ? 'var(--green)' : active ? 'var(--amber)' : 'rgba(0,255,136,0.35)',
                }}>{label}</span>
              </div>
            );
          })}
        </div>

        {/* Example prompts */}
        <div className="panel" style={{ padding: 20, borderRadius: 4 }}>
          <div style={{ fontSize: 11, opacity: 0.45, letterSpacing: '0.15em', marginBottom: 16 }}>
            EXAMPLE PROMPTS
          </div>
          {EXAMPLE_PROMPTS.map((p, i) => (
            <button key={i} onClick={() => handlePromptClick(p)}
              disabled={isRunning}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 10px', marginBottom: 6,
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'rgba(0,255,136,0.55)',
                fontFamily: 'Share Tech Mono, monospace',
                fontSize: 11, lineHeight: 1.5,
                cursor: isRunning ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                if (!isRunning) {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,255,136,0.4)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--green)';
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLElement).style.color = 'rgba(0,255,136,0.55)';
              }}
            >
              ▶ {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
