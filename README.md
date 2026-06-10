# AutiStudy

Adaptive AI tutoring platform for autistic learners (grades 4–7, Pakistan
curriculum). This is a **monorepo** containing both halves of the system.

```
AutiStudy-App/
├── backend/     FastAPI + Python — persistence, LLM/RAG, agent, content generation
└── frontend/    Next.js 14 (React/TypeScript) — student UI, CV emotion fusion, adaptation flow
```

## Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- An OpenAI API key in `backend/.streamlit/secrets.toml` (`OPENAI_API_KEY = "..."`)

## Setup

```bash
# Frontend deps
cd frontend
npm install

# Backend deps
cd ../backend
pip install -r requirements.txt   # if present; otherwise install fastapi uvicorn openai chromadb python-docx etc.
```

## Run (development)

From the `frontend/` folder:

```bash
npm run dev:all   # runs the Next.js app (port 3000) + FastAPI backend (port 8000)
# or individually:
npm run dev        # frontend only
npm run dev:api    # backend only (uvicorn, served from ../backend)
```

## Agent evaluation

Routing accuracy + response consistency for the teaching agent and visual-aid
router. From `frontend/`:

```bash
python scripts/eval/router_eval.py             # deterministic router (free)
python scripts/eval/agent_eval.py --k 5         # GPT-4o ReAct agent (needs key)
python scripts/generate_agent_evaluation_docx.py
```

See `frontend/docs/agent-evaluation.md` for results and methodology.

## Notes

- The backend reads curriculum markdown from `frontend/books_mds/`
  (`backend/utils/book_parser.py :: BOOKS_DIR`).
- Cross-folder paths assume the `backend/` + `frontend/` sibling layout above.
