# AutiStudy Backend (FastAPI)

REST API for the AutiStudy Next.js frontend. **No Streamlit UI** — the student
experience lives entirely in `../frontend`.

## Run locally

From `../frontend` (recommended):

```bash
npm run dev:api
```

Or directly:

```bash
cd backend
uvicorn api_server:app --port 8000 --reload
```

## Configuration

Create `config/secrets.toml`:

```toml
OPENAI_API_KEY = "sk-..."
```

Or set the `OPENAI_API_KEY` environment variable.

## Key modules

| Module | Role |
| --- | --- |
| `api_server.py` | FastAPI routes (auth, chat, quiz, agent) |
| `chat_engine.py` | RAG + LLM bridge for chat replies |
| `utils/rag.py` | Hybrid retriever (Chroma + BM25 + reranker) |
| `utils/media_agent.py` | ReAct teaching agent (tool routing) |
| `utils/visual_aids.py` | Visual-aid router (countable / symbolic / concept) |

Curriculum markdown is read from `../frontend/books_mds/`.
