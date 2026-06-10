# AutiStudy Frontend (Next.js 14)

Student and parent web interface for AutiStudy. This is the **sole UI** — there is no Streamlit frontend.

Part of the **`AutiStudy-App`** monorepo (`../backend` is the FastAPI API).

## Quick start

```bash
npm install
npm run dev:all    # Next.js :3000 + FastAPI :8000
```

Requires `../backend/config/secrets.toml` with your OpenAI API key.

## Key routes

| Path | Purpose |
|------|---------|
| `/` | Landing page |
| `/chat` | AI tutor + adaptive agent |
| `/quiz` | Practice quizzes |
| `/analytics` | Student progress |
| `/parent/dashboard` | Parent view |
| `/expression-lab` | CV strategy benchmark |

## Documentation

- `docs/AUTISTUDY WORKING - latest.md` — full architecture
- `docs/adaptive-agent-flow.md` — comprehension popup ladder
- `docs/agent-evaluation.md` — agent metrics (routing accuracy, consistency)
