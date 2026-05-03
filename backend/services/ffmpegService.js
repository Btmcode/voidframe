const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function mergeVideos(filelistPath, renderDir) {
  const outputPath = path.join(renderDir, 'merged.mp4');

  if (!fs.existsSync(filelistPath)) throw new Error('filelist.txt not found');

  const content = fs.readFileSync(filelistPath, 'utf8').trim();
  if (!content) throw new Error('filelist.txt is empty');

  console.log('[FFmpeg] Merging videos...');
  console.log('[FFmpeg] filelist:\n', content);

  // Re-encode for compatibility
  try {
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${filelistPath}" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -preset fast -crf 23 -c:a aac -ar 44100 "${outputPath}"`,
      { stdio: 'pipe', timeout: 120000 }
    );
    console.log('[FFmpeg] ✅ Merge complete (re-encoded)');
    return outputPath;
  } catch (e) {
    console.warn('[FFmpeg] Re-encode failed, trying stream copy:', e.message);
  }

  // Stream copy fallback
  try {
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${filelistPath}" -c copy "${outputPath}"`,
      { stdio: 'pipe', timeout: 60000 }
    );
    console.log('[FFmpeg] ✅ Merge complete (stream copy)');
    return outputPath;
  } catch (e) {
    console.warn('[FFmpeg] Stream copy failed, using first clip:', e.message);
  }

  // Last resort: use first valid clip
  const lines = content.split('\n').filter(l => l.startsWith("file '"));
  for (const line of lines) {
    const clipPath = line.replace(/^file '/, '').replace(/'$/, '');
    if (fs.existsSync(clipPath) && fs.statSync(clipPath).size > 0) {
      fs.copyFileSync(clipPath, outputPath);
      console.log('[FFmpeg] ⚠️ Using first clip as merged output');
      return outputPath;
    }
  }

  throw new Error('FFmpeg merge failed with all strategies');
}

async function mergeAudioVideo(videoPath, audioPath, renderDir) {
  const outputPath = path.join(renderDir, 'final.mp4');

  if (!fs.existsSync(videoPath)) throw new Error('Merged video not found');

  const hasAudio = audioPath &&
    fs.existsSync(audioPath) &&
    fs.statSync(audioPath).size > 500;

  if (!hasAudio) {
    console.warn('[FFmpeg] No valid audio — copying video as final');
    fs.copyFileSync(videoPath, outputPath);
    return outputPath;
  }

  // Probe audio to confirm it's valid
  try {
    execSync(`ffprobe -v quiet -select_streams a -show_entries stream=codec_name -of csv=p=0 "${audioPath}"`, {
      stdio: 'pipe', timeout: 10000
    });
  } catch (_) {
    console.warn('[FFmpeg] Audio probe failed — video only');
    fs.copyFileSync(videoPath, outputPath);
    return outputPath;
  }

  try {
    execSync(
      `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest -map 0:v:0 -map 1:a:0 "${outputPath}"`,
      { stdio: 'pipe', timeout: 60000 }
    );
    console.log('[FFmpeg] ✅ Audio+Video merged');
    return outputPath;
  } catch (e) {
    console.warn('[FFmpeg] Audio merge failed, video-only output:', e.message);
    fs.copyFileSync(videoPath, outputPath);
    return outputPath;
  }
}

module.exports = { mergeVideos, mergeAudioVideo };
