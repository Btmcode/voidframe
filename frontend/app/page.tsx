'use client';

import { useState, useEffect, useRef } from 'react';
import VideoGenerator from '@/components/VideoGenerator';

const BOOT_LINES = [
  'VOIDFRAME v1.0.0 - AI VIDEO SYNTHESIS ENGINE',
  '--------------------------------------------',
  'Initializing neural pipeline................OK',
  'Loading Playwright automation layer........OK',
  'FFmpeg codec registry.....................READY',
  'TTS synthesis module......................READY',
  'Python worker cluster.....................READY',
  '--------------------------------------------',
  'ALL SYSTEMS OPERATIONAL. Awaiting prompt.',
];

export default function Home() {
  const [bootIndex, setBootIndex] = useState(0);
  const [bootDone, setBootDone] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    const timer = setInterval(() => {
      setBootIndex(prev => {
        const next = prev + 1;
        if (next >= BOOT_LINES.length) {
          clearInterval(timer);
          setTimeout(() => {
            if (!doneRef.current) {
              doneRef.current = true;
              setBootDone(true);
            }
          }, 600);
        }
        return next;
      });
    }, 150);
    return () => clearInterval(timer);
  }, []);

  const visibleLines = BOOT_LINES.slice(0, bootIndex);

  function lineColor(line: string): string {
    if (line.startsWith('-')) return 'rgba(0,255,136,0.2)';
    if (line.includes('READY') || line.includes('OK')) return 'var(--green)';
    if (line.startsWith('VOIDFRAME')) return 'var(--green)';
    return 'rgba(0,255,136,0.65)';
  }

  function linePrefix(line: string): string {
    if (line.startsWith('-') || line.startsWith('VOIDFRAME')) return '';
    return '> ';
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="pulse-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)' }} />
            <span className="glow-text" style={{ fontFamily: 'Orbitron, monospace', fontSize: 20, fontWeight: 900, letterSpacing: '0.15em' }}>VOIDFRAME</span>
            <span style={{ fontSize: 11, opacity: 0.4, letterSpacing: '0.1em' }}>AI VIDEO ENGINE</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.4, letterSpacing: '0.08em' }}>PIKA ◆ RUNWAY ◆ FFMPEG ◆ TTS</div>
        </div>
      </header>

      {!bootDone ? (
        <div style={{ maxWidth: 720, margin: '80px auto', padding: '0 24px' }}>
          <div className="panel" style={{ padding: 32, borderRadius: 4 }}>
            {visibleLines.map((line, i) => (
              <div key={i} style={{
                fontSize: 13, marginBottom: 6,
                color: lineColor(line),
                fontFamily: 'Share Tech Mono, monospace',
              }}>
                {linePrefix(line)}{line}
              </div>
            ))}
            <div className="cursor-blink" style={{ fontSize: 13, marginTop: 4, color: 'var(--green)' }}>&nbsp;</div>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
          <VideoGenerator />
        </div>
      )}
    </main>
  );
}
