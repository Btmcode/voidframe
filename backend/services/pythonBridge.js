const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function runPythonWorker(clips, renderDir) {
  return new Promise((resolve, reject) => {
    const workerScript = path.join(__dirname, '../../worker/worker.py');

    if (!fs.existsSync(workerScript)) {
      return resolve(buildFilelistFallback(clips, renderDir));
    }

    const proc = spawn('python3', [
      workerScript,
      '--clips', JSON.stringify(clips),
      '--dir', renderDir
    ], { env: process.env });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d; process.stdout.write(`[worker] ${d}`); });
    proc.stderr.on('data', d => { stderr += d; });

    proc.on('close', code => {
      const filelistPath = path.join(renderDir, 'filelist.txt');
      if (code === 0 && fs.existsSync(filelistPath)) {
        resolve(filelistPath);
      } else {
        console.warn('[pythonBridge] Worker exited with code', code, '— using fallback');
        resolve(buildFilelistFallback(clips, renderDir));
      }
    });

    proc.on('error', err => {
      console.warn('[pythonBridge] spawn error:', err.message, '— using fallback');
      resolve(buildFilelistFallback(clips, renderDir));
    });
  });
}

function buildFilelistFallback(clips, renderDir) {
  const filelistPath = path.join(renderDir, 'filelist.txt');
  const valid = clips.filter(c => fs.existsSync(c) && fs.statSync(c).size > 0);

  if (valid.length === 0) throw new Error('No valid clips for filelist');

  const content = valid.map(c => `file '${c}'`).join('\n');
  fs.writeFileSync(filelistPath, content);
  console.log('[pythonBridge] Fallback filelist written with', valid.length, 'clips');
  return filelistPath;
}

module.exports = { runPythonWorker };
