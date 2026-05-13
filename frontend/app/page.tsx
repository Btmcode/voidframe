'use client';

import { useState, useEffect } from 'react';
import VideoGenerator from '@/components/VideoGenerator';

const BOOT_LINES = [
  'VOIDFRAME v1.0.0 — AI VIDEO SYNTHESIS ENGINE',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  'Initializing neural pipeline................OK',
  'Loading Playwright automation layer........OK',
  'FFmpeg codec registry.....................READY',
  'TTS synthesis module......................READY',
  'Python worker cluster.....................READY',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  'ALL SYSTEMS OPERATIONAL. Awaiting prompt.',
];

export default function Home() {
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < BOOT_LINES.length) {
        const line = BOOT_LINES[i];
        if (line !== undefined) {
          setBootLines(prev => [...prev, line]);
        }
        i++;
      } else {
        clearInterval(interval);
        setTimeout(() => setBootDone(true), 700);
      }
    }, 160);
    return () => clearInterval(interval);
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="pulse-dot" style={{
              width: 10, height: 10, borderRadius: '50%',
              background: 'var(--green)'
            }} />
            <span className="glow-text" style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: 20, fontWeight: 900, letterSpacing: '0.15em'
            }}>VOIDFRAME</span>
            <span style={{ fontSize: 11, opacity: 0.4, letterSpacing: '0.1em' }}>AI VIDEO ENGINE</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.4, letterSpacing: '0.08em' }}>
            PIKA ◆ RUNWAY ◆ FFMPEG ◆ TTS
          </div>
        </div>
      </header>

      {!bootDone ? (
        /* Boot screen */
        <div style={{ maxWidth: 720, margin: '80px auto', padding: '0 24px' }}>
          <div className="panel" style={{ padding: 32, borderRadius: 4 }}>
            {bootLines.filter(Boolean).map((line, i) => (
              <div key={i} style={{
                fontSize: 13,
                marginBottom: 6,
                color: line.startsWith('━') ? 'rgba(0,255,136,0.2)'
                  : line.includes('READY') || line.includes('OK') ? 'var(--green)'
                  : 'rgba(0,255,136,0.65)',
                fontFamily: 'Share Tech Mono, monospace'
              }}>
                {!line.startsWith('━') && !line.startsWith('VOIDFRAME') ? '> ' : ''}{line}
              </div>
            ))}
            {bootLines.length < BOOT_LINES.length && (
              <div className="cursor-blink" style={{ fontSize: 13, marginTop: 4 }}>&nbsp;</div>
            )}
          </div>
        </div>
      ) : (
        /* Main UI */
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
          <VideoGenerator />
        </div>
      )}
    </main>
  );
}
