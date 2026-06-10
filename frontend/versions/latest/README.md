# AutiStudy-React Frontend — `latest` snapshot

| Field | Value |
|-------|-------|
| Tag | `latest` |
| Label | `v4.1-adaptive-agent` |
| Saved | May 2026 |
| Base commit | See `VERSION.json` |

This folder is a **frozen copy** of the working frontend at save time.  
The live codebase is the parent directory (`AutiStudy-React/`).

## Contents

- `app/` — Next.js 14 pages (chat, dashboard, expression-lab, …)
- `components/agent/` — Adaptive agent UI (popup, MCQs, breathing, panel)
- `lib/agent/`, `lib/hooks/` — Comprehension flow, hybrid CV, API hooks
- `expression-lab/` — CV strategy A/B/C benchmark
- `docs/` — Architecture + flow specs
- `public/face-api-models/` — Local CNN weights
- `package.json` and config files

## Pair with backend

Use together with `AutiStudy/versions/latest/` (FastAPI on port 8000).

Do not edit this snapshot for new features — change the live repo and re-save `latest` when needed.
