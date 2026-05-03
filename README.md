# VOIDFRAME — Zero-Budget AI Video Generator

> Text → Scenes → Pika/Runway automation → FFmpeg merge → TTS narration → Final MP4

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/voidframe&root=frontend)

---

## Architecture

```
frontend/          → Vercel (Next.js 14 + Tailwind)
backend/           → Render.com (Node.js + Playwright + Socket.io)
  services/
    promptEngine   → Anthropic API scene decomposition
    videoAutomation→ Playwright → pika.art / runwayml.com
    pythonBridge   → Calls Python worker subprocess
    ttsService     → Google TTS / gTTS / silent fallback
    ffmpegService  → FFmpeg concat + audio merge
worker/            → Python clip scorer (ffprobe)
storage/renders/   → Output directory (Render persistent disk)
```

## Pipeline

| Step | Action |
|------|--------|
| 1 | User enters prompt |
| 2 | Scene decomposition via Anthropic API (or template fallback) |
| 3–5 | Playwright opens Pika → submits prompt → downloads video (3 retries → Runway → placeholder) |
| 6 | Python worker scores clips, writes `filelist.txt` |
| 7 | FFmpeg concat merge |
| 8 | TTS narration (Google Cloud → gTrans → gTTS → silent) |
| 9 | FFmpeg audio+video final render |

---

## Quick Start (Local)

```bash
git clone https://github.com/YOUR_USERNAME/voidframe
cd voidframe

# Backend
cd backend
cp .env.example .env        # edit API keys (optional)
npm install
npx playwright install chromium --with-deps
node server.js              # runs on :4000

# Frontend (new terminal)
cd frontend
cp .env.example .env.local  # set NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
npm install
npm run dev                 # runs on :3000
```

Open http://localhost:3000

---

## Deploy

### 1. Backend → Render.com

1. New → **Web Service** → connect GitHub repo
2. Root Directory: `backend`
3. Build Command:
   ```
   npm install && apt-get install -y ffmpeg && npx playwright install chromium --with-deps && pip3 install gtts requests --break-system-packages
   ```
4. Start Command: `node server.js`
5. Plan: **Free**
6. Add **Disk**: mount path `/opt/render/project/storage/renders` (1 GB)
7. Environment Variables:
   ```
   NODE_ENV=production
   PORT=4000
   ANTHROPIC_API_KEY=sk-ant-...      (optional)
   GEMINI_API_KEY=AIza...             (optional)
   FRONTEND_URL=https://your-app.vercel.app
   ```
8. Deploy → copy the URL

> ⚠️ Free tier sleeps after 15min. Add UptimeRobot to ping `/health` every 5min.

### 2. Frontend → Vercel

1. New Project → Import from GitHub
2. Root Directory: `frontend`
3. Framework: **Next.js**
4. Environment Variable:
   ```
   NEXT_PUBLIC_BACKEND_URL=https://voidframe-backend.onrender.com
   ```
5. Deploy

### 3. Optional: Auto-deploy via GitHub Actions

Add these GitHub secrets (Settings → Secrets):
```
VERCEL_TOKEN          → vercel.com/account/tokens
VERCEL_ORG_ID         → your Vercel team/user ID
VERCEL_PROJECT_ID     → from .vercel/project.json after first deploy
NEXT_PUBLIC_BACKEND_URL → your Render backend URL
```

---

## Environment Variables

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Default: 4000 |
| `ANTHROPIC_API_KEY` | No | Better scene prompts. Free: console.anthropic.com |
| `GEMINI_API_KEY` | No | Google Cloud TTS. Free quota: aistudio.google.com |
| `FRONTEND_URL` | No | CORS origin |

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | **Yes** | Full Render backend URL |

---

## Example Prompts

```
A lone astronaut discovers ancient alien ruins on Mars at sunset
Cyberpunk city street at night, neon signs reflected in rain puddles
Ancient forest awakening with bioluminescent creatures at dawn
A submarine glides through glowing deep ocean waters
Time-lapse of a futuristic city being built in a desert
```

---

## Failsafe Chain

```
Video:  Pika (3 attempts) → Runway → FFmpeg placeholder (always works)
Audio:  Google Cloud TTS → Google Translate TTS → gTTS → Silent MP3
Merge:  Re-encode → Stream copy → First clip fallback
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Pika selectors broken | Pika updated UI — update selectors in `services/videoAutomation.js` |
| FFmpeg not found | Add `apt-get install -y ffmpeg` to Render build command |
| TTS silent | Set `GEMINI_API_KEY` or `pip3 install gtts` |
| Backend sleeping | UptimeRobot free monitor → ping `/health` every 5min |
| CORS errors | Set `FRONTEND_URL` env var on backend |

---

## License

MIT
