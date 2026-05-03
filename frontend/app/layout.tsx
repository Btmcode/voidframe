import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VOIDFRAME — AI Video Generator',
  description: 'Zero-budget AI video generation platform. Text to video using Pika, Runway, FFmpeg & Gemini TTS.',
  keywords: ['AI video', 'text to video', 'Pika', 'Runway', 'FFmpeg'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
