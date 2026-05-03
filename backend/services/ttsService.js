const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

async function generateTTS(text, renderDir) {
  const outputPath = path.join(renderDir, 'voice.mp3');
  const narration = text.length > 250 ? text.substring(0, 247) + '...' : text;

  // 1. Google Cloud TTS via Gemini key
  if (process.env.GEMINI_API_KEY) {
    try {
      const ok = await tryGoogleTTS(narration, outputPath);
      if (ok) return outputPath;
    } catch (e) {
      console.warn('[TTS] Google Cloud TTS failed:', e.message);
    }
  }

  // 2. Google Translate TTS (free, no key)
  try {
    const ok = await tryGTranslateTTS(narration, outputPath);
    if (ok) return outputPath;
  } catch (e) {
    console.warn('[TTS] gTranslate TTS failed:', e.message);
  }

  // 3. Python gTTS
  try {
    const ok = await tryPythonGTTS(narration, outputPath);
    if (ok) return outputPath;
  } catch (e) {
    console.warn('[TTS] Python gTTS failed:', e.message);
  }

  // 4. Silent audio fallback
  console.warn('[TTS] All methods failed, generating silent audio');
  await generateSilentAudio(outputPath, 10);
  return outputPath;
}

async function tryGoogleTTS(text, outputPath) {
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GEMINI_API_KEY}`;
  const resp = await axios.post(url, {
    input: { text },
    voice: { languageCode: 'en-US', name: 'en-US-Neural2-D', ssmlGender: 'MALE' },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95, pitch: -1.5 }
  }, { timeout: 15000 });

  if (resp.data?.audioContent) {
    fs.writeFileSync(outputPath, Buffer.from(resp.data.audioContent, 'base64'));
    console.log('[TTS] ✅ Google Cloud TTS success');
    return true;
  }
  return false;
}

async function tryGTranslateTTS(text, outputPath) {
  const encoded = encodeURIComponent(text.substring(0, 200));
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=en&client=tw-ob`;
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 12000
  });

  if (resp.data?.byteLength > 1000) {
    fs.writeFileSync(outputPath, Buffer.from(resp.data));
    console.log('[TTS] ✅ Google Translate TTS success');
    return true;
  }
  return false;
}

function tryPythonGTTS(text, outputPath) {
  return new Promise(resolve => {
    const script = `
import sys
try:
    from gtts import gTTS
    tts = gTTS(text=sys.argv[1], lang='en', slow=False)
    tts.save(sys.argv[2])
    print('OK')
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
`;
    const tmpScript = path.join(path.dirname(outputPath), '_gtts_worker.py');
    fs.writeFileSync(tmpScript, script);

    const proc = spawn('python3', [tmpScript, text.substring(0, 200), outputPath]);
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('close', code => {
      try { fs.unlinkSync(tmpScript); } catch (_) {}
      resolve(code === 0 && out.includes('OK') && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 500);
    });
    proc.on('error', () => resolve(false));
  });
}

async function generateSilentAudio(outputPath, duration = 10) {
  try {
    // Use libmp3lame for .mp3 output
    execSync(
      `ffmpeg -y -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" -t ${duration} -c:a libmp3lame -q:a 9 "${outputPath}"`,
      { stdio: 'pipe', timeout: 15000 }
    );
    // Verify output has content
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 100) {
      throw new Error('Empty output');
    }
  } catch (_) {
    // Fallback to aac in mp4 container renamed to mp3
    try {
      const tmpPath = outputPath.replace('.mp3', '_tmp.mp4');
      execSync(
        `ffmpeg -y -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" -t ${duration} -c:a aac "${tmpPath}"`,
        { stdio: 'pipe', timeout: 15000 }
      );
      fs.renameSync(tmpPath, outputPath);
    } catch (_2) {
      fs.writeFileSync(outputPath, Buffer.alloc(0));
    }
  }
}

module.exports = { generateTTS };
