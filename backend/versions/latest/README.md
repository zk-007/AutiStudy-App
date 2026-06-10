# AutiStudy Backend — `latest` snapshot

| Field | Value |
|-------|-------|
| Tag | `latest` |
| Label | `v4.1-adaptive-agent` |
| Saved | May 2026 |
| Base commit | See `VERSION.json` |

This folder is a **frozen copy** of the working backend at save time.  
The live codebase is the parent directory (`AutiStudy/`).

## Contents

- `api_server.py` — FastAPI REST API
- `chat_engine.py` — RAG/LLM bridge
- `quiz_engine.py` — Quiz generation
- `utils/` — Auth, RAG, LLM, visual aids, media agent, …
- `requirements.txt`, `Dockerfile`, `app.py`

## Previous version folders

| Folder | Era |
|--------|-----|
| `versions/v1`–`v3` | Streamlit UI snapshots (legacy) |
| `versions/latest` | FastAPI + adaptive agent (current) |

Do not edit this snapshot for new features — change the live repo and re-save `latest` when needed.
