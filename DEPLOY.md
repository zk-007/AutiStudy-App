# AutiStudy — Deploy (Vercel + Railway)

## Architecture

| Service | Platform | Folder |
|---------|----------|--------|
| Frontend (Next.js) | **Vercel** | `frontend/` |
| Backend (FastAPI) | **Railway** | `backend/` (Dockerfile) |

---

## 1. Railway — Backend API

1. Go to [railway.app](https://railway.app) → New Project → **Deploy from GitHub repo**
2. Select this repo, set **Root Directory** = `backend`
3. Railway auto-detects `Dockerfile` + `railway.toml`
4. Add **Variables** in Railway dashboard:

| Variable | Value |
|----------|--------|
| `OPENAI_API_KEY` | your OpenAI key |
| `CORS_ORIGINS` | `https://auti-study-app.vercel.app` (and any preview URLs) |
| `AUTISTUDY_ENV` | `production` (hides OTP from API/logs) |
| `SMTP_HOST` | `smtp.gmail.com` (optional if using secrets.toml volume) |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Gmail address used to send OTP |
| `SMTP_PASSWORD` | Gmail App Password (16 chars) |
| `SMTP_FROM` | same as SMTP_USER |
| `PORT` | Railway sets this automatically |

5. Deploy → copy public URL e.g. `https://autistudy-app-production.up.railway.app`

**Note:** Prefer Railway Variables for SMTP in production — do **not** commit `backend/config/secrets.toml`.

**Health check:** `GET /api/health`

**Note:** First boot downloads ML models (~90MB) — may take 2–5 min. Use Railway plan with **≥2GB RAM**.

---

## 2. Vercel — Frontend

1. Go to [vercel.com](https://vercel.com) → Add New Project → Import Git repo
2. Set **Root Directory** = `frontend`
3. Add **Environment Variable**:

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_API_URL` | Railway URL from step 1 (no trailing slash) |

4. Deploy

5. Copy Vercel URL → add to Railway `CORS_ORIGINS` → redeploy Railway

---

## CLI deploy (optional)

```bash
# Railway (from backend/)
npx @railway/cli login
npx @railway/cli init
npx @railway/cli up

# Vercel (from frontend/)
npx vercel login
npx vercel --prod
# Set NEXT_PUBLIC_API_URL in Vercel dashboard or:
npx vercel env add NEXT_PUBLIC_API_URL production
```

---

## Local test against production API

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=https://your-railway-url.up.railway.app
```
