# AutiStudy — `comprehension-production-stable-v6`

**Codename:** Comprehension Production Stable v6  
**Branched from:** `comprehension-production-stable-v5` (frozen rollback)  
**Status:** Production-ready snapshot (synced to root `frontend/` + `backend/` for deploy)

## What’s in this version

- Child / parent signup with **email OTP** verification
- **Forgot Password** (OTP → new password) for child + parent
- Family invite codes (`FAM-XXXXX`) + child approve/reject
- Contact form → support email
- Dark / Light theme in Settings → Appearance (device-wide persist)
- Calm icy UI (v5 colour language) + cuter landing kid (v5 avatar style)

## Production URLs (after deploy)

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | Vercel | https://auti-study-app.vercel.app |
| Backend | Railway | https://autistudy-app-production.up.railway.app |

## Local run

```powershell
cd releases\comprehension-production-stable-v6\frontend
npm run dev:all
```

## Rollback

```powershell
cd releases\comprehension-production-stable-v5\frontend
npm run dev:all
```

## Deploy source of truth

Railway + Vercel deploy from **repo root** folders:

- `frontend/` ← synced from this v6 frontend
- `backend/` ← synced from this v6 backend  

Never commit `backend/config/secrets.toml`.
