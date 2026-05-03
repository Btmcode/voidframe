const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const RETRIES = 3;
const PIKA_URL = 'https://pika.art/create';
const RUNWAY_URL = 'https://runwayml.com/ai-tools/text-to-video';

async function runVideoAutomation(scenePrompt, renderDir, sceneIndex, logFn = console.log) {
  const outputPath = path.join(renderDir, `scene_${sceneIndex + 1}.mp4`);

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    logFn(`Attempt ${attempt}/${RETRIES}...`);

    // Try Pika
    try {
      const ok = await tryPika(scenePrompt, outputPath, logFn);
      if (ok && isValidVideo(outputPath)) {
        logFn('✅ Pika success');
        return outputPath;
      }
    } catch (e) {
      logFn(`Pika failed: ${e.message}`);
    }

    // Try Runway
    try {
      const ok = await tryRunway(scenePrompt, outputPath, logFn);
      if (ok && isValidVideo(outputPath)) {
        logFn('✅ Runway success');
        return outputPath;
      }
    } catch (e) {
      logFn(`Runway failed: ${e.message}`);
    }

    if (attempt < RETRIES) {
      logFn('Waiting 8s before retry...');
      await sleep(8000);
    }
  }

  // Always produce a clip via FFmpeg
  logFn('⚠️ Automation failed — generating placeholder clip');
  await generatePlaceholderClip(scenePrompt, outputPath, logFn);
  return outputPath;
}

// ── Pika ──────────────────────────────────────────────────────────────────────
async function tryPika(prompt, outputPath, logFn) {
  logFn('Launching Pika automation...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });
    const page = await ctx.newPage();

    await page.goto(PIKA_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Find prompt input
    const selectors = [
      'textarea[placeholder*="Describe"]',
      'textarea[placeholder*="prompt"]',
      'textarea[placeholder*="video"]',
      '[contenteditable="true"]',
      'textarea'
    ];

    let input = null;
    for (const sel of selectors) {
      try {
        input = await page.waitForSelector(sel, { timeout: 5000 });
        if (input) break;
      } catch (_) {}
    }

    if (!input) throw new Error('No input found on Pika');

    await input.click();
    await page.keyboard.type(prompt, { delay: 30 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');

    logFn('Prompt submitted, waiting for generation (max 3min)...');

    // Poll for video element
    let videoUrl = null;
    for (let tick = 0; tick < 18; tick++) {
      await page.waitForTimeout(10000);
      logFn(`  Waiting... ${(tick + 1) * 10}s`);

      videoUrl = await page.evaluate(() => {
        const v = document.querySelector('video');
        if (v?.src && v.src.startsWith('http')) return v.src;
        const s = document.querySelector('video source');
        if (s?.src) return s.src;
        const a = document.querySelector('a[href*=".mp4"]');
        if (a?.href) return a.href;
        return null;
      });

      if (videoUrl) break;
    }

    if (!videoUrl) throw new Error('Video not generated within timeout');

    logFn(`Downloading: ${videoUrl.substring(0, 60)}...`);
    await downloadFile(videoUrl, outputPath);
    return true;

  } finally {
    await browser.close();
  }
}

// ── Runway ────────────────────────────────────────────────────────────────────
async function tryRunway(prompt, outputPath, logFn) {
  logFn('Launching Runway automation...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await page.goto(RUNWAY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    const ta = await page.$('textarea');
    if (!ta) throw new Error('No textarea on Runway');

    await ta.fill(prompt);
    await page.keyboard.press('Enter');

    logFn('Waiting for Runway generation (60s)...');
    await page.waitForTimeout(60000);

    const videoUrl = await page.evaluate(() => {
      const v = document.querySelector('video');
      return v?.src || null;
    });

    if (!videoUrl) throw new Error('No video on Runway');

    await downloadFile(videoUrl, outputPath);
    return true;

  } finally {
    await browser.close();
  }
}

// ── Placeholder ───────────────────────────────────────────────────────────────
async function generatePlaceholderClip(prompt, outputPath, logFn) {
  const safeText = prompt.replace(/[^a-zA-Z0-9 .,!?-]/g, '').substring(0, 50);
  const colors = ['0a1628', '1a0a28', '0a2818', '28180a', '1c1c2e'];
  const color = colors[Math.floor(Math.random() * colors.length)];

  try {
    // Generate 5-second cinematic placeholder with text overlay
    const cmd = [
      'ffmpeg -y',
      `-f lavfi -i "color=c=0x${color}:size=1280x720:rate=24,format=yuv420p"`,
      `-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"`,
      '-vf', `"drawtext=text='${safeText}':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2:alpha=0.9"`,
      '-t 5',
      '-c:v libx264 -preset fast -crf 28',
      '-c:a aac -shortest',
      `"${outputPath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe', timeout: 30000 });
    logFn(`✅ Placeholder clip created (${safeText})`);
  } catch (e) {
    logFn(`⚠️ FFmpeg placeholder failed: ${e.message}`);
    // Absolute fallback: minimal valid mp4-like file for pipeline continuity
    // Write a tiny black 1-frame video
    try {
      execSync(`ffmpeg -y -f lavfi -i "color=black:size=1280x720:rate=24" -t 3 -c:v libx264 "${outputPath}"`, {
        stdio: 'pipe', timeout: 15000
      });
    } catch (_) {
      // If all else fails write empty file so pipeline doesn't crash
      fs.writeFileSync(outputPath, Buffer.alloc(0));
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidVideo(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 1000;
  } catch { return false; }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        file.close();
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { fs.unlink(dest, () => {}); reject(err); });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { runVideoAutomation };
