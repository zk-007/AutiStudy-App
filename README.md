# AutiStudy

### Adaptive AI tutoring for autistic learners — grounded in the Pakistan curriculum

AutiStudy helps students in **grades 4–7** learn Maths, General Science, and Computer through a calm, autism-friendly interface. Answers are retrieved from **PTB textbook content** (not generic web chat), then explained in short, supportive language — with optional pictures, voice, step-by-step help, and parent oversight.

**Live app:** [auti-study-app.vercel.app](https://auti-study-app.vercel.app)  
**API:** [autistudy-app-production.up.railway.app](https://autistudy-app-production.up.railway.app)

---

## Why AutiStudy?

| Challenge | How we address it |
|-----------|-------------------|
| Generic AI invents steps outside the school book | **Hybrid RAG** over curriculum vectors (ChromaDB + BM25 + reranking; RAT for maths) |
| Long walls of text overwhelm autistic learners | Short first answers, “tell me more”, bilingual EN/UR prompts |
| One explanation style does not fit everyone | **Adaptive tutor** — thumbs feedback, modality ladder (text → steps → image → voice → calm break) |
| Parents need visibility | Parent accounts, family linking, quiz analytics & progress |
| Trust & safety for children | Auth, OTP, off-topic textbook gating, calm UI (light/dark) |

---

## Features

### For students
- Curriculum-grounded AI tutor (Maths, Science, Computer · grades 4–7)
- English & Urdu tutoring
- Visual aids (educational images + maths step cards with KaTeX)
- Text-to-speech read-aloud
- Adaptive comprehension flow (Got it / Not yet → alternative formats)
- Optional camera-based engagement signals (browser-side)
- Practice quizzes with feedback
- Learning preferences onboarding & settings (voice, theme, sensory calm)

### For parents
- Parent signup / login with email OTP
- Family invite codes & child approve/reject
- Dashboard: progress, quizzes, agent memory summary

### Platform
- Child & parent **email OTP** verification and forgot-password
- Contact form → support email
- Production deploy: **Vercel** (frontend) + **Railway** (backend)

---

## Architecture

```
┌─────────────────────┐         HTTPS JSON          ┌──────────────────────────┐
│  Next.js 14 (Web)   │ ──────────────────────────► │  FastAPI (Python)         │
│  React · TypeScript │                             │  Auth · Chat · Quiz       │
│  MediaPipe / face   │ ◄────────────────────────── │  RAG · LLM · Agents       │
│  Adaptive UI flow   │                             │  TTS · Images · Memory    │
└─────────────────────┘                             └────────────┬─────────────┘
                                                                 │
                    ┌────────────────────────────────────────────┼──────────────┐
                    ▼                                            ▼              ▼
             ChromaDB (PTB)                              OpenAI APIs      JSON stores
             hybrid + BM25                               GPT · Vision     users, chats,
             + CrossEncoder                              TTS · Images     agent_memory
```

**Monorepo layout**

```
AutiStudy-App/
├── frontend/          Next.js student & parent UI
│   └── books_mds/     Curriculum markdown (source for RAG indexing)
├── backend/           FastAPI API, RAG, agents, auth
│   ├── api_server.py
│   ├── utils/         rag, llm, media_agent, visual_aids, …
│   └── OneSharedChromaDB/
├── releases/          Versioned snapshots (v5, v6, …)
└── DEPLOY.md          Production deploy guide
```

---

## Tech stack

| Layer | Technologies |
|-------|----------------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Framer Motion, KaTeX, MediaPipe |
| Backend | FastAPI, Uvicorn, Pydantic, bcrypt |
| AI / RAG | OpenAI (GPT-4o / 4o-mini), Sentence-Transformers, ChromaDB, BM25, Cross-Encoder reranker |
| Agents | Custom ReAct Media Agent (OpenAI tool calling); live Tutor comprehension flow in the browser |
| Storage | JSON file stores + Chroma persistent vectors |
| Deploy | Vercel · Railway (Docker) |

---

## Retrieval quality (design highlights)

- **Custom hybrid RAG** (subject-specific) — not a thin LangChain wrapper  
- **Maths:** dense + BM25 (65/35) → CrossEncoder rerank → optional **RAT** (retrieve-and-think)  
- **Science / Computer:** RRF fusion + keyword gate + block-type weights  
- **Off-topic guard:** if content is not in the uploaded textbook, the tutor redirects to real unit lists instead of inventing a full lesson  

Evaluation scripts (from `frontend/`):

```bash
python scripts/eval/router_eval.py          # visual router (~93% on gold set)
python scripts/eval/agent_eval.py --k 5     # Media Agent tool routing
python scripts/eval/rat_eval.py             # RAT maths checks
```

---

## Quick start (local)

### Prerequisites
- Node.js **18+** and npm  
- Python **3.11+**  
- OpenAI API key  

### 1. Clone

```bash
git clone https://github.com/zk-007/AutiStudy-App.git
cd AutiStudy-App
```

### 2. Backend secrets

```bash
cd backend
copy config\secrets.toml.example config\secrets.toml   # Windows
# or: cp config/secrets.toml.example config/secrets.toml
```

Edit `backend/config/secrets.toml`:

```toml
OPENAI_API_KEY = "sk-..."
```

Optional (email OTP in production style): configure `[smtp]` — see `secrets.toml.example`.

### 3. Install & run

```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend + both processes
cd ../frontend
npm install
npm run dev:all
```

| Service | URL |
|---------|-----|
| Web app | http://localhost:3000 |
| API | http://localhost:8000 |
| Health | http://localhost:8000/api/health |

Individual processes:

```bash
npm run dev        # Next.js only
npm run dev:api    # FastAPI only
```

---

## Environment & deploy

Production overview is in **[DEPLOY.md](./DEPLOY.md)**.

| Variable | Where | Purpose |
|----------|--------|---------|
| `OPENAI_API_KEY` | Railway / secrets.toml | LLM, TTS, images, agents |
| `CORS_ORIGINS` | Railway | Allow Vercel origin(s) |
| `NEXT_PUBLIC_API_URL` | Vercel | Backend base URL |
| `AUTISTUDY_ENV=production` | Railway | Harden OTP logging |

> Never commit `backend/config/secrets.toml`.

---

## Versioned releases

Frozen snapshots live under `releases/` (e.g. `comprehension-production-stable-v6`).  
**Deploy source of truth** for production is the repo-root `frontend/` + `backend/` folders.

---

## Project status

AutiStudy is an active FYP / research-engineering product: curriculum RAG, adaptive tutoring UX, parent linking, and production hosting are in place. Classroom validation and further agentic features continue to evolve.

---

## Team & academic context

Built for autistic learners in the **Pakistan** grades 4–7 setting, with emphasis on reduced anxiety, clear structure, and textbook-faithful explanations.

---

## License

Private / academic project repository. All rights reserved unless otherwise stated by the authors.

---

## Acknowledgements

- Pakistan Textbook Board (PTB) curriculum materials used as the grounding corpus  
- OpenAI, ChromaDB, Sentence-Transformers, and the open-source ecosystem that makes the stack possible  
