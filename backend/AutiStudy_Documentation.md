# AutiStudy — Project Documentation

## What is AutiStudy?

AutiStudy is an **adaptive AI tutoring platform** for **autistic students in Pakistan** (Grades 4–7). It provides curriculum-grounded chat tutoring, multimodal explanations (text, visuals, speech), quiz practice, parent dashboards, and a browser-based computer-vision agent that monitors engagement.

The student-facing UI is a **Next.js 14 app** (`frontend/`). The intelligence layer is a **FastAPI server** (`backend/`). Both live in one monorepo: **`AutiStudy-App`**.

---

## Technologies Used

| Technology | Purpose |
|------------|---------|
| **Next.js 14 / React / TypeScript** | Student & parent web interface |
| **Python / FastAPI** | REST API, RAG, LLM, agent, quiz engine |
| **OpenAI GPT-4o-mini** | Chat answers, content generation, agent routing |
| **ChromaDB** | Vector store for textbook RAG (`OneSharedChromaDB`) |
| **MediaPipe + face-api.js** | Browser-side emotion fusion (CV never leaves device) |
| **JSON files** | Users, sessions, chats, quiz data on disk |

---

## Monorepo layout

```
AutiStudy-App/
├── frontend/                 # Next.js UI (sole student interface)
│   ├── app/                  # Pages: chat, quiz, dashboard, parent, …
│   ├── components/agent/     # Adaptive agent UI + CV hooks
│   ├── lib/                  # API client, agent logic, hooks
│   └── books_mds/            # Curriculum markdown (RAG source text)
│
└── backend/                  # FastAPI API (no Streamlit)
    ├── api_server.py         # REST endpoints
    ├── chat_engine.py        # RAG + LLM bridge
    ├── config/secrets.toml   # API keys (gitignored)
    ├── data/                 # users.json, chats.json, sessions.json
    ├── OneSharedChromaDB/    # Chroma vector store
    └── utils/                # rag.py, llm.py, media_agent.py, …
```

---

## How the application works

1. Student opens the **Next.js app** (port 3000) — landing, login, signup.
2. Student chats on `/chat`; messages go to **FastAPI** (port 8000) with a Bearer token.
3. Backend runs **hybrid RAG** (dense + BM25 + reranker) over `books_mds/`, then **GPT-4o-mini** generates an autism-friendly answer.
4. After each answer, an **understanding check** popup appears. If the student is confused, the **adaptation ladder** escalates (flowchart → TTS → image → MCQs → breathing).
5. **Webcam CV** runs in the browser; only emotion probabilities influence policy — video never uploads.

---

## Running locally

From `frontend/`:

```bash
npm install
npm run dev:all    # Next.js :3000 + FastAPI :8000
```

API keys: create `backend/config/secrets.toml` with `OPENAI_API_KEY = "sk-..."`.

---

## Key backend modules

| Module | Role |
|--------|------|
| `api_server.py` | Auth, chat, quiz, analytics, parent, agent endpoints |
| `chat_engine.py` | Connects API to RAG/LLM/visual aids/TTS |
| `utils/rag.py` | Hybrid retriever over Chroma textbooks |
| `utils/visual_aids.py` | Routes visual requests (countable / symbolic / concept) |
| `utils/media_agent.py` | ReAct teaching agent (GPT-4o tool routing) |

---

## Further reading

- `frontend/docs/AUTISTUDY WORKING - latest.md` — full system architecture
- `frontend/docs/adaptive-agent-flow.md` — comprehension popup ladder
- `frontend/docs/agent-evaluation.md` — routing accuracy & response consistency metrics
