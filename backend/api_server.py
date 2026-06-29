"""
AutiStudy REST API
==================

A thin FastAPI sidecar that exposes the existing AutiStudy data layer
(users, sessions, quiz attempts, chat history) over HTTP for the new
React/Next.js frontend.

Key design decisions:
  * Reuses utils/session.py, utils/auth.py, utils/quiz_db.py, utils/chat_db.py
    (JSON files on disk shared with the Next.js frontend).
  * Bearer-token auth using session tokens from utils/session.py.
  * CORS allows http://localhost:3000 (React dev server).
  * Run from the AutiStudy folder so relative file paths
    (data/users.json, quiz_data/, etc.) resolve correctly:

        cd AutiStudy
        uvicorn api_server:app --port 8000 --reload

  * Or from anywhere with --app-dir:

        uvicorn api_server:app --app-dir ./AutiStudy --port 8000 --reload
"""

from __future__ import annotations

import os
import sys
import io
from pathlib import Path
from typing import Optional

# JSON stores (data/, quiz_data/, etc.) use paths relative to the AutiStudy
# project root. npm run dev:api launches uvicorn from AutiStudy-React, so
# chdir here before importing utils that read those files.
_ROOT = Path(__file__).resolve().parent
os.chdir(_ROOT)

# Windows: force UTF-8 for stdout/stderr so Unicode characters (e.g. EasyOCR
# progress bars) don't raise UnicodeEncodeError with the default cp1252 codec.
if sys.platform == "win32":
    if hasattr(sys.stdout, "buffer"):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "buffer"):
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import asyncio
import re
import threading
from concurrent.futures import ThreadPoolExecutor

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Ensure utils/ can be imported regardless of how uvicorn is launched
sys.path.insert(0, str(_ROOT))

# Shared data layer — same JSON stores the React app reads/writes.
from utils.session import create_session, delete_session, get_session  # noqa: E402
from utils.auth import (  # noqa: E402
    hash_password, load_users, save_users,
    verify_password, migrate_password_if_needed,
)
from utils.parent_db import (  # noqa: E402
    create_parent, get_parent, load_parents, parent_exists,
    save_parents, strip_password as parent_strip_pw,
)
from utils.quiz_db import get_quiz_history, get_user_analytics  # noqa: E402
from utils.chat_db import (  # noqa: E402
    create_chat_session,
    delete_chat_session,
    get_chat_session,
    get_user_chats,
    save_media_to_message,
    save_message,
)
from chat_engine import (  # noqa: E402
    generate_reply,
    generate_speech_b64 as tutor_generate_speech,
    generate_visual_aid as tutor_generate_visual_aid,
    is_configured as tutor_is_configured,
    rag_status as tutor_rag_status,
)
from utils.emotion import analyze_emotion  # noqa: E402
from utils.teaching_agent import (  # noqa: E402
    get_or_create_state,
    get_state as agent_get_state,
    reset_state as agent_reset_state,
    force_modality as agent_force_modality,
)
from utils.media_agent import run_media_agent, decide_from_emotion  # noqa: E402
from utils.agent_memory import (  # noqa: E402
    get_adaptation_ladder_order,
    get_memory_summary,
    record_adaptation_preference,
    record_session_summary as memory_record_session,
)

# Where utils/llm._save_b64_image_to_temp drops generated images. Mounted
# below so the React app can display them via /api/generated-images/<file>.
_GENERATED_IMAGES_DIR = Path(__file__).parent / "temp_generated_images"
_GENERATED_IMAGES_DIR.mkdir(exist_ok=True)


# ──────────────────────────────────────────────────────────────────────────────
# App setup
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AutiStudy API",
    description="REST endpoints for the AutiStudy React frontend.",
    version="0.1.0",
)

_default_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
]
_extra = os.getenv("CORS_ORIGINS", "")
_cors_origins = _default_origins + [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app"),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup pre-warm ─────────────────────────────────────────────────────────
#
# In Streamlit, `preload_models()` runs before the first user arrives so the
# embedder, reranker, and ChromaDB are already in memory. In FastAPI we do the
# same thing — but in a background thread so uvicorn is available immediately
# (the API responds to health-checks / config requests while models load, and
# chat messages that arrive before warmup finish just wait a few seconds rather
# than hanging forever without any progress message).

def _openai_keepalive_loop():
    """Periodically ping OpenAI to keep the TLS connection alive.

    On Windows, each new TLS handshake to OpenAI can take 60+ seconds (Windows
    trust-store loading). Once the connection is established, it must be reused
    before OpenAI's keep-alive timeout (~90 s) expires. This loop pings every
    60 seconds so the connection is always fresh when a student sends a message.
    """
    import time
    while True:
        time.sleep(60)
        try:
            from utils.llm import get_openai_client
            client = get_openai_client()
            if client:
                client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": "ping"}],
                    max_tokens=5,
                )
        except Exception:
            pass  # Non-fatal — next iteration will retry


def _background_warmup():
    """Load heavy ML resources in a daemon thread at startup."""
    try:
        print("[api_server] Background warmup started…")
        from chat_engine import _boot  # triggers key loading + llm import
        _boot()
        # Pre-load RAG stack (embedder + reranker + ChromaDB).
        from utils import rag as _rag
        _rag.preload_models()
        # Pre-warm the OpenAI HTTPS connection. On Windows, the SSL trust-store
        # is loaded lazily on the FIRST real HTTPS request, which can take 60 s+.
        # We fire a minimal API call here in the background so that cost is paid
        # before any student sends a message.
        try:
            from utils.llm import get_openai_client
            client = get_openai_client()
            if client:
                client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": "ping"}],
                    max_tokens=5,
                )
                print("[api_server] OpenAI HTTPS connection pre-warmed.")
                # Start keep-alive loop so the connection stays warm indefinitely.
                t = threading.Thread(
                    target=_openai_keepalive_loop, daemon=True, name="openai-keepalive"
                )
                t.start()
            else:
                print("[api_server] OpenAI client: no key found (skipping pre-warm).")
        except Exception as llm_exc:
            print(f"[api_server] OpenAI pre-warm warning (non-fatal): {llm_exc}")
        print("[api_server] Background warmup complete.")
    except Exception as exc:
        print(f"[api_server] Background warmup error (non-fatal): {exc}")


# Dedicated thread-pool for blocking I/O calls (OpenAI, ChromaDB, etc.).
# Using a named pool prevents these from competing with uvicorn's own
# anyio thread pool, which has a small default limit (40 threads) and can
# get exhausted when multiple concurrent chat requests each make a blocking
# httpx call to OpenAI.
_BLOCKING_POOL = ThreadPoolExecutor(max_workers=16, thread_name_prefix="autistudy-io")


async def run_in_thread(fn, *args, **kwargs):
    """Run a blocking function in the dedicated thread pool without
    blocking the uvicorn event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _BLOCKING_POOL,
        lambda: fn(*args, **kwargs),
    )


@app.on_event("startup")
async def startup_event():
    """Kick off model loading in the background as soon as uvicorn is ready."""
    t = threading.Thread(target=_background_warmup, daemon=True, name="warmup")
    t.start()


# Serve locally-saved DALL·E / GPT-Image outputs to the React client.
app.mount(
    "/api/generated-images",
    StaticFiles(directory=str(_GENERATED_IMAGES_DIR)),
    name="generated_images",
)


# Subjects available per grade. Mirrors views/dashboard.py so the React
# UI surfaces the same subjects Streamlit students already see.
GRADE_SUBJECTS = {
    4: ["Maths", "General Science"],
    5: ["Maths", "General Science"],
    6: ["Maths", "General Science", "Computer"],
    7: ["Maths", "General Science", "Computer"],
}

SUBJECT_ICONS = {"Maths": "🔢", "General Science": "🔬", "Computer": "💻"}


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ──────────────────────────────────────────────────────────────────────────────

class RegisterReq(BaseModel):
    name: str
    email: str
    password: str
    role: str = "student"
    grade: int = 4


class LoginReq(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict
    family_code: Optional[str] = None


class ChildSignupReq(BaseModel):
    name: str
    email: str
    password: str
    grade: int = 4
    cnic: str
    parent_name: str
    parent_cnic: str


class CreateChatReq(BaseModel):
    subject: str
    language: str = "en"


class SendMessageReq(BaseModel):
    content: str
    preferred_format: str = "normal"  # from agent: normal|simplified|step_by_step_flowchart|with_visual_description


class SpeechReq(BaseModel):
    text: str
    language: str = "en"


# ──────────────────────────────────────────────────────────────────────────────
# Auth dependency
# ──────────────────────────────────────────────────────────────────────────────

def _validate_password(password: str) -> str | None:
    """
    Return an error message if the password is too weak, else None.
    Rules: min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special char.
    """
    import re as _re
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    if not _re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter (A-Z)."
    if not _re.search(r"[a-z]", password):
        return "Password must contain at least one lowercase letter (a-z)."
    if not _re.search(r"\d", password):
        return "Password must contain at least one number (0-9)."
    if not _re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?`~]", password):
        return "Password must contain at least one special character (!@#$%^&* etc.)."
    return None


def _validate_email(email: str) -> None:
    from utils.email_validation import validate_email

    err = validate_email(email)
    if err:
        raise HTTPException(400, err)


def _strip_password(user: dict) -> dict:
    safe = {**user}
    safe.pop("password", None)
    return safe


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Validate the bearer token and return {email, user, token}."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()
    session = get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    # Always re-read from disk so stars/progress updates from Streamlit
    # are reflected on the next React request.
    users = load_users()
    fresh = users.get(session["email"])
    if not fresh:
        raise HTTPException(status_code=401, detail="User no longer exists")

    return {"email": session["email"], "user": fresh, "token": token}


# ──────────────────────────────────────────────────────────────────────────────
# Public endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"name": "AutiStudy API", "status": "ok", "version": "0.1.0"}


@app.get("/api/health")
def health():
    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# Auth endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register", response_model=AuthResponse)
def register(req: RegisterReq):
    email = req.email.strip().lower()
    _validate_email(email)
    pw_err = _validate_password(req.password)
    if pw_err:
        raise HTTPException(400, pw_err)
    if req.grade not in GRADE_SUBJECTS:
        raise HTTPException(400, "Grade must be between 4 and 7.")

    users = load_users()
    if email in users:
        raise HTTPException(400, "An account with this email already exists.")

    users[email] = {
        "name": req.name.strip() or "Student",
        "email": email,
        "password": hash_password(req.password),
        "role": req.role,
        "grade": req.grade,
        "stars": 0,
        "badges": [],
        "progress": {},
    }
    save_users(users)

    safe_user = _strip_password(users[email])
    token = create_session(email, safe_user, current_page="dashboard", language="en")
    return {"token": token, "user": safe_user}


@app.post("/api/auth/login", response_model=AuthResponse)
def login(req: LoginReq):
    email = req.email.strip().lower()
    users = load_users()
    user = users.get(email)
    if not user or not verify_password(req.password, user.get("password", "")):
        raise HTTPException(401, "Invalid email or password.")

    # Silently upgrade SHA-256 legacy hashes to bcrypt on login
    migrate_password_if_needed(email, req.password, users)

    safe_user = _strip_password(user)
    token = create_session(email, safe_user, current_page="dashboard", language="en")
    return {"token": token, "user": safe_user}


@app.post("/api/auth/logout")
def logout(current=Depends(get_current_user)):
    delete_session(current["token"])
    return {"ok": True}


@app.get("/api/auth/me")
def me(current=Depends(get_current_user)):
    return _strip_password(current["user"])


# ── Child signup (family code linking) ───────────────────────────────────────

@app.post("/api/auth/child/signup", response_model=AuthResponse)
def child_signup(req: ChildSignupReq):
    """Register a student account with parent details for later family linking."""
    from utils.family_link import (
        generate_family_code,
        normalize_cnic,
        validate_cnic,
    )

    email = req.email.strip().lower()
    _validate_email(email)
    pw_err = _validate_password(req.password)
    if pw_err:
        raise HTTPException(400, pw_err)
    if req.grade not in GRADE_SUBJECTS:
        raise HTTPException(400, "Grade must be between 4 and 7.")

    parent_name = req.parent_name.strip()
    if not parent_name:
        raise HTTPException(400, "Please enter your parent or guardian's name.")

    try:
        child_cnic_fmt = validate_cnic(req.cnic, "Student CNIC")
        parent_cnic_fmt = validate_cnic(req.parent_cnic, "Parent CNIC")
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    users = load_users()
    if email in users:
        raise HTTPException(400, "An account with this email already exists.")

    child_digits = normalize_cnic(child_cnic_fmt)
    for u in users.values():
        if normalize_cnic(u.get("cnic")) == child_digits:
            raise HTTPException(400, "This CNIC is already registered.")

    existing_codes = {
        u.get("family_code")
        for u in users.values()
        if u.get("family_code")
    }
    try:
        family_code = generate_family_code(existing_codes)
    except RuntimeError:
        raise HTTPException(500, "Could not generate a family code. Please try again.")

    users[email] = {
        "name": req.name.strip() or "Student",
        "email": email,
        "password": hash_password(req.password),
        "role": "student",
        "grade": req.grade,
        "stars": 0,
        "badges": [],
        "progress": {},
        "cnic": child_cnic_fmt,
        "parent_name": parent_name,
        "parent_cnic": parent_cnic_fmt,
        "family_code": family_code,
    }
    save_users(users)

    safe_user = _strip_password(users[email])
    token = create_session(email, safe_user, current_page="dashboard", language="en")
    return {"token": token, "user": safe_user, "family_code": family_code}


# ── Parent session helpers ────────────────────────────────────────────────────

import secrets as _secrets
import json as _json
from pathlib import Path as _Path

_PARENT_SESSIONS_FILE = _Path(__file__).parent / "data" / "parent_sessions.json"


def _load_parent_sessions() -> dict:
    if not _PARENT_SESSIONS_FILE.exists():
        return {}
    try:
        return _json.loads(_PARENT_SESSIONS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_parent_sessions(data: dict) -> None:
    _PARENT_SESSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    _PARENT_SESSIONS_FILE.write_text(
        _json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _create_parent_session(email: str) -> str:
    token = _secrets.token_hex(32)
    sessions = _load_parent_sessions()
    sessions[token] = {"email": email}
    _save_parent_sessions(sessions)
    return token


def _get_parent_session(token: str) -> Optional[dict]:
    return _load_parent_sessions().get(token)


def _delete_parent_session(token: str) -> None:
    sessions = _load_parent_sessions()
    sessions.pop(token, None)
    _save_parent_sessions(sessions)


def get_current_parent(authorization: Optional[str] = Header(None)) -> dict:
    """Validate parent bearer token."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    session = _get_parent_session(token)
    if not session:
        raise HTTPException(401, "Invalid or expired parent session")
    parent = get_parent(session["email"])
    if not parent:
        raise HTTPException(401, "Parent account not found")
    return {"email": session["email"], "parent": parent, "token": token}


# ── Parent signup ─────────────────────────────────────────────────────────────

class ParentSignupReq(BaseModel):
    name: str
    email: str
    password: str
    cnic: str
    child_name: str
    child_cnic: str
    family_code: str


@app.post("/api/auth/parent/signup", response_model=AuthResponse)
def parent_signup(req: ParentSignupReq):
    """Register a parent account linked to an existing student via family code."""
    from utils.family_link import cnic_match, names_match, validate_cnic

    email = req.email.strip().lower()
    _validate_email(email)
    pw_err = _validate_password(req.password)
    if pw_err:
        raise HTTPException(400, pw_err)

    try:
        cnic_fmt = validate_cnic(req.cnic, "Your CNIC")
        validate_cnic(req.child_cnic, "Child CNIC")
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    family_code = req.family_code.strip()
    if not re.fullmatch(r"\d{6}", family_code):
        raise HTTPException(400, "Family code must be exactly 6 digits.")

    if parent_exists(email):
        raise HTTPException(400, "A parent account with this email already exists.")

    users = load_users()
    matched_child = None
    for u in users.values():
        if not names_match(u.get("name"), req.child_name):
            continue
        if not cnic_match(u.get("cnic"), req.child_cnic):
            continue
        matched_child = u
        break

    if matched_child is None:
        raise HTTPException(
            404,
            f"No student named '{req.child_name.strip()}' with that CNIC found. "
            "Please check the details or ask your child to sign up first.",
        )

    stored_code = (matched_child.get("family_code") or "").strip()
    if not stored_code:
        raise HTTPException(
            400,
            "This student account was created before family linking was enabled. "
            "Ask them to contact support or re-register.",
        )
    if stored_code != family_code:
        raise HTTPException(
            403,
            "Invalid family code. Ask your child for the 6-digit code shown when they signed up.",
        )

    if not names_match(matched_child.get("parent_name"), req.name):
        raise HTTPException(
            403,
            "Your name does not match the parent name registered with this student.",
        )

    if not cnic_match(matched_child.get("parent_cnic"), req.cnic):
        raise HTTPException(
            403,
            "Your CNIC does not match the parent CNIC registered with this student.",
        )

    record = create_parent(
        email=email,
        name=req.name.strip() or "Parent",
        password_hash=hash_password(req.password),
        cnic=cnic_fmt,
        child_email=matched_child["email"],
        verified=True,
    )

    token = _create_parent_session(email)
    return {"token": token, "user": parent_strip_pw(record)}


# ── Parent login ──────────────────────────────────────────────────────────────

class ParentLoginReq(BaseModel):
    email: str
    password: str


@app.post("/api/auth/parent/login", response_model=AuthResponse)
def parent_login(req: ParentLoginReq):
    email = req.email.strip().lower()
    parent = get_parent(email)
    if not parent or not verify_password(req.password, parent.get("password", "")):
        raise HTTPException(401, "Invalid email or password.")
    token = _create_parent_session(email)
    return {"token": token, "user": parent_strip_pw(parent)}


@app.post("/api/auth/parent/logout")
def parent_logout(current=Depends(get_current_parent)):
    _delete_parent_session(current["token"])
    return {"ok": True}


@app.get("/api/auth/parent/me")
def parent_me(current=Depends(get_current_parent)):
    return parent_strip_pw(current["parent"])


# ── Parent dashboard data ─────────────────────────────────────────────────────

@app.get("/api/parent/dashboard")
def parent_dashboard(current=Depends(get_current_parent)):
    """Return enriched child analytics for the parent dashboard."""
    parent = current["parent"]
    child_email = parent.get("child_email")
    if not child_email:
        raise HTTPException(404, "No linked child found.")

    users = load_users()
    child = users.get(child_email)
    if not child:
        raise HTTPException(404, "Child account not found.")

    analytics = get_user_analytics(child_email)
    chats = get_user_chats(child_email)
    quiz_history = get_quiz_history(child_email, limit=20)

    from collections import Counter

    # Favourite subject
    subject_counts = Counter(c.get("subject") for c in chats if c.get("subject"))
    fav_subject = subject_counts.most_common(1)[0][0] if subject_counts else "N/A"

    # Total correct vs incorrect across ALL quizzes
    total_correct = sum(q.get("num_correct", 0) for q in quiz_history)
    total_wrong   = sum(q.get("num_questions", 0) - q.get("num_correct", 0) for q in quiz_history)

    # Score trend (last 10 quizzes, chronological)
    score_trend = [
        {
            "date":    q.get("timestamp", "")[:10],
            "score":   q.get("score_percent", 0),
            "subject": q.get("subject", ""),
        }
        for q in reversed(quiz_history[:10])
    ]

    # Avg time per question by subject
    speed_by_subject = {}
    for q in quiz_history:
        subj = q.get("subject", "")
        t    = q.get("avg_time_per_question", 0)
        n    = q.get("num_questions", 0)
        if subj and n:
            if subj not in speed_by_subject:
                speed_by_subject[subj] = {"total_time": 0, "total_q": 0}
            speed_by_subject[subj]["total_time"] += t * n
            speed_by_subject[subj]["total_q"]    += n

    speed_analysis = [
        {
            "subject":           s,
            "avg_sec_per_q":     round(v["total_time"] / v["total_q"], 1) if v["total_q"] else 0,
        }
        for s, v in speed_by_subject.items()
    ]

    # Consistency score: 100 - std-dev of last 10 quiz scores (higher = more consistent)
    import math
    scores = [q.get("score_percent", 0) for q in quiz_history[:10]]
    consistency = 0
    if len(scores) >= 2:
        mean = sum(scores) / len(scores)
        std  = math.sqrt(sum((s - mean) ** 2 for s in scores) / len(scores))
        consistency = max(0, round(100 - std))

    # Improvement: compare avg of first half vs second half of attempts
    improvement = None
    if len(quiz_history) >= 4:
        half = len(quiz_history) // 2
        recent_avg = sum(q.get("score_percent", 0) for q in quiz_history[:half]) / half
        older_avg  = sum(q.get("score_percent", 0) for q in quiz_history[half:]) / half
        improvement = round(recent_avg - older_avg, 1)

    return {
        "child": {
            "name":  child.get("name"),
            "grade": child.get("grade"),
            "stars": child.get("stars", 0),
            "email": child_email,
        },
        "analytics":        analytics,
        "favourite_subject": fav_subject,
        "total_chats":      len(chats),
        "quiz_history":     quiz_history[:10],
        "total_correct":    total_correct,
        "total_wrong":      total_wrong,
        "score_trend":      score_trend,
        "speed_analysis":   speed_analysis,
        "consistency":      consistency,
        "improvement":      improvement,
    }


@app.get("/api/parent/report")
async def parent_report(current=Depends(get_current_parent)):
    """Generate an AI progress report for the linked child."""
    parent = current["parent"]
    child_email = parent.get("child_email")
    if not child_email:
        raise HTTPException(404, "No linked child found.")

    users = load_users()
    child = users.get(child_email)
    if not child:
        raise HTTPException(404, "Child account not found.")

    analytics = get_user_analytics(child_email)
    chats = get_user_chats(child_email)
    quiz_history = get_quiz_history(child_email, limit=10000)  # all quizzes from day 1

    from collections import Counter
    subject_counts = Counter(c.get("subject") for c in chats if c.get("subject"))
    fav_subject = subject_counts.most_common(1)[0][0] if subject_counts else "Not determined"

    # Build context summary for the LLM
    # subject_breakdown is a dict {subject: {accuracy, attempts, ...}}
    subj_breakdown_raw = analytics.get("subject_breakdown", {})
    if isinstance(subj_breakdown_raw, dict):
        subj_items = [(subj, stats) for subj, stats in subj_breakdown_raw.items()]
    else:
        subj_items = [(s.get("subject", "?"), s) for s in subj_breakdown_raw]
    breakdown_text = "\n".join(
        f"  - {subj}: {stats.get('accuracy', 0):.0f}% accuracy, {stats.get('attempts', 0)} quizzes"
        for subj, stats in subj_items
    ) or "  No quiz data yet."

    # Show every quiz attempt chronologically (oldest first)
    quiz_history_chrono = list(reversed(quiz_history))
    quiz_text = "\n".join(
        f"  - [{q.get('timestamp','?')[:10]}] {q.get('subject','?')}: {q.get('score_percent',0):.0f}% ({q.get('num_correct',0)}/{q.get('num_questions',0)} correct, avg {q.get('avg_time_per_question',0)}s/q)"
        for q in quiz_history_chrono
    ) or "  No quiz attempts yet."

    prompt = f"""You are a compassionate educational assistant helping parents of children with autism spectrum disorder (ASD).

Generate a structured progress report for the parent of {child.get('name', 'this child')}, a Grade {child.get('grade', '?')} student using AutiStudy.

Data:
- Total quizzes taken: {analytics.get('total_attempts', 0)}
- Overall accuracy: {analytics.get('overall_accuracy', 0):.0f}%
- Active streak: {analytics.get('streak_days', 0)} days
- Stars earned: {child.get('stars', 0)}
- Favourite subject: {fav_subject}
- Total chat sessions: {len(chats)}

Subject performance:
{breakdown_text}

All quiz results (from first attempt to today, chronological):
{quiz_text}

Return ONLY a JSON object (no markdown, no prose outside JSON) with this exact structure:
{{
  "summary_headline": "Short 1-sentence overall headline (e.g. 'Making great strides in Maths!')",
  "overall_rating": "Excellent|Good|Developing|Needs Support",
  "sections": [
    {{
      "id": "overview",
      "title": "Overall Progress",
      "emoji": "🌟",
      "color": "violet",
      "points": ["point 1", "point 2", "point 3"]
    }},
    {{
      "id": "strengths",
      "title": "Strengths",
      "emoji": "💪",
      "color": "emerald",
      "points": ["strength 1", "strength 2", "strength 3"]
    }},
    {{
      "id": "improve",
      "title": "Areas to Work On",
      "emoji": "📈",
      "color": "amber",
      "points": ["area 1", "area 2", "area 3"]
    }},
    {{
      "id": "tips",
      "title": "Tips for Parents",
      "emoji": "🏠",
      "color": "sky",
      "points": ["tip 1", "tip 2", "tip 3", "tip 4"]
    }},
    {{
      "id": "next",
      "title": "Next Goals",
      "emoji": "🎯",
      "color": "rose",
      "points": ["goal 1", "goal 2", "goal 3"]
    }}
  ]
}}

Rules:
- Each section must have 3-5 concrete, specific bullet points based on the real data above.
- Tone: warm, supportive, autism-friendly, never clinical.
- Use the child's name ({child.get('name', 'the child')}) naturally in some points.
- Return ONLY valid JSON, nothing else."""

    from utils.llm import get_openai_client
    import json as _json
    client = get_openai_client()
    if not client:
        raise HTTPException(503, "AI service not available.")

    def _gen():
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1200,
            temperature=0.7,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content.strip()
        return _json.loads(raw)

    import datetime as _dt
    report_data = await run_in_thread(_gen)
    return {
        "child_name": child.get("name"),
        "grade": child.get("grade"),
        "stars": child.get("stars", 0),
        "overall_accuracy": round(analytics.get("overall_accuracy", 0)),
        "total_attempts": analytics.get("total_attempts", 0),
        "streak_days": analytics.get("streak_days", 0),
        "favourite_subject": fav_subject,
        "generated_at": _dt.datetime.utcnow().isoformat(),
        **report_data,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Password change
# ──────────────────────────────────────────────────────────────────────────────

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

@app.post("/api/users/me/password")
def change_password(body: PasswordChangeRequest, current=Depends(get_current_user)):
    """Allow a logged-in child user to change their password."""
    users = load_users()
    email = current["email"]
    user  = users.get(email)
    if not user:
        raise HTTPException(404, "User not found.")

    # Verify current password
    if not verify_password(body.current_password, user.get("password", "")):
        raise HTTPException(400, "Current password is incorrect.")

    # Validate new password strength
    err = _validate_password(body.new_password)
    if err:
        raise HTTPException(400, err)

    from utils.auth import hash_password as _hash
    user["password"] = _hash(body.new_password)
    users[email] = user
    save_users(users)
    return {"ok": True}


class DeleteAccountReq(BaseModel):
    password: str


@app.post("/api/users/me/delete")
def delete_my_account(body: DeleteAccountReq, current=Depends(get_current_user)):
    """Permanently delete the logged-in student account and all associated data."""
    from utils.user_cleanup import delete_student_account

    email = current["email"]
    users = load_users()
    user = users.get(email)
    if not user:
        raise HTTPException(404, "User not found.")

    if not verify_password(body.password, user.get("password", "")):
        raise HTTPException(400, "Password is incorrect.")

    if not delete_student_account(email, current_token=current["token"]):
        raise HTTPException(404, "User not found.")

    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard data
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/users/me/stats")
def my_stats(current=Depends(get_current_user)):
    """Return the headline stats for the dashboard cards."""
    analytics = get_user_analytics(current["email"])
    user = current["user"]
    return {
        "stars": user.get("stars", 0),
        "streak_days": analytics["streak_days"],
        "total_quizzes": analytics["total_attempts"],
        "total_questions": analytics["total_questions"],
        "total_correct": analytics["total_correct"],
        "overall_accuracy": analytics["overall_accuracy"],
        "total_time_minutes": analytics["total_time_minutes"],
        "daily_activity": analytics["daily_activity"],
        "subject_breakdown": analytics["subject_breakdown"],
    }


@app.get("/api/users/me/subjects")
def my_subjects(current=Depends(get_current_user)):
    """Subjects available for the user's grade, with last-studied timestamp."""
    grade = current["user"].get("grade", 4)
    subjects = GRADE_SUBJECTS.get(grade, ["Maths", "General Science"])

    # last-studied per subject = newest chat session that targets it
    chats = get_user_chats(current["email"])
    last_studied: dict[str, str] = {}
    for chat in chats:
        s = chat.get("subject")
        if s and s not in last_studied:
            last_studied[s] = chat.get("timestamp")

    return [
        {
            "name": name,
            "icon": SUBJECT_ICONS.get(name, "📚"),
            "grade": grade,
            "last_studied": last_studied.get(name),
        }
        for name in subjects
    ]


@app.get("/api/users/me/recent-chats")
def my_recent_chats(current=Depends(get_current_user)):
    """Up to 5 most recent chat sessions, with a preview snippet."""
    chats = get_user_chats(current["email"])
    out = []
    for c in chats[:5]:
        msgs = c.get("messages", [])
        last = msgs[-1].get("content", "") if msgs else ""
        out.append(
            {
                "id": c["id"],
                "subject": c.get("subject"),
                "title": c.get("title"),
                "timestamp": c.get("timestamp"),
                "language": c.get("language", "en"),
                "message_count": len(msgs),
                "last_message_snippet": (last[:120] + ("…" if len(last) > 120 else "")) if last else None,
            }
        )
    return out


@app.get("/api/users/me/recent-quizzes")
def my_recent_quizzes(current=Depends(get_current_user)):
    """Up to 5 most recent quiz attempts."""
    history = get_quiz_history(current["email"], limit=5)
    return [
        {
            "id": q["id"],
            "subject": q["subject"],
            "grade": q.get("grade"),
            "score_percent": q["score_percent"],
            "num_correct": q["num_correct"],
            "num_questions": q["num_questions"],
            "timestamp": q["timestamp"],
        }
        for q in history
    ]


# ──────────────────────────────────────────────────────────────────────────────
# Chat endpoints
# ──────────────────────────────────────────────────────────────────────────────
#
# A "chat session" is a single tutoring conversation about one subject. All
# sessions are persisted in data/chats.json via utils/chat_db.py — the same
# file the Streamlit app reads/writes — so the two frontends stay in sync.
#
# Auth: every endpoint requires a bearer token. Sessions are scoped to the
# authenticated user; we never accept an email in the request body.

def _normalise_subject(raw: str, grade: int) -> str:
    """Find the canonical subject name for the user's grade (case-insensitive)."""
    candidates = GRADE_SUBJECTS.get(grade, [])
    target = raw.strip().lower()
    for name in candidates:
        if name.lower() == target:
            return name
    if candidates:
        # Unknown subject for this grade — fall back to the first one rather
        # than 400-ing, so the UI never gets stuck.
        return candidates[0]
    return raw.strip() or "General"


def _serialise_session(session: dict) -> dict:
    """Shape a chat-db session for the React client."""
    return {
        "id": session["id"],
        "subject": session.get("subject"),
        "grade": session.get("grade"),
        "language": session.get("language", "en"),
        "title": session.get("title"),
        "timestamp": session.get("timestamp"),
        "messages": [
            {
                "role": m.get("role"),
                "content": m.get("content", ""),
                "timestamp": m.get("timestamp"),
                "skip_tutor": m.get("skip_tutor", False),
                "image_url": m.get("image_url"),
                "math_steps": m.get("math_steps"),
                "emoji_counting": m.get("emoji_counting"),
                "factor_tree": m.get("factor_tree"),
                "fraction_bar": m.get("fraction_bar"),
                "number_line": m.get("number_line"),
                "bar_chart": m.get("bar_chart"),
                "percentage_bar": m.get("percentage_bar"),
                "times_table": m.get("times_table"),
                "geometry": m.get("geometry"),
                "ratio": m.get("ratio"),
            }
            for m in session.get("messages", [])
        ],
    }


@app.get("/api/debug/openai-ping")
async def debug_openai_ping():
    """Internal: test OpenAI connectivity from inside uvicorn (remove before prod)."""
    import os, time
    from openai import OpenAI
    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        return {"error": "No key loaded"}
    t0 = time.time()
    try:
        client = OpenAI(api_key=key, timeout=30.0)
        resp = await run_in_thread(
            lambda: client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "Say hi in 3 words."}],
                max_tokens=20,
            )
        )
        return {
            "ok": True,
            "elapsed_s": round(time.time() - t0, 2),
            "reply": resp.choices[0].message.content,
        }
    except Exception as exc:
        return {"ok": False, "elapsed_s": round(time.time() - t0, 2), "error": str(exc)}


@app.get("/api/chat/config")
def chat_config():
    """Tell the UI which tutor capabilities are live right now.

    Returns:
      tutor_configured  – True if an OpenAI key is loaded (text chat works)
      rag_available     – True if the curriculum vector store is queryable
      total_vectors     – Size of the loaded ChromaDB collection (debug)
      images_available  – True if image generation can run (key + RAG stack)
      speech_available  – True if OpenAI TTS can run (same conditions)
    """
    status = tutor_rag_status()
    have_key = status.get("have_key", False)
    return {
        "tutor_configured": have_key,
        "rag_available": status.get("rag_available", False),
        "total_vectors": status.get("total_vectors", 0),
        # Visual aids only need an OpenAI key — the router (utils/visual_aids)
        # picks countable / symbolic / concept tracks, none of which depend on
        # the curriculum vector store. RAG only enriches the *text* answer.
        "images_available": have_key,
        "speech_available": have_key,
    }


@app.get("/api/chat/sessions")
def list_chat_sessions(current=Depends(get_current_user)):
    """All chat sessions for the current user, newest first."""
    return [
        {
            "id": c["id"],
            "subject": c.get("subject"),
            "title": c.get("title"),
            "timestamp": c.get("timestamp"),
            "language": c.get("language", "en"),
            "message_count": len(c.get("messages", [])),
        }
        for c in get_user_chats(current["email"])
    ]


@app.post("/api/chat/sessions")
def start_chat_session(req: CreateChatReq, current=Depends(get_current_user)):
    """Create a fresh chat session for a subject. Returns the empty session."""
    grade = current["user"].get("grade", 4)
    subject = _normalise_subject(req.subject, grade)
    language = "ur" if req.language == "ur" else "en"
    chat_id = create_chat_session(current["email"], grade, subject, language)
    session = get_chat_session(current["email"], chat_id)
    if not session:
        raise HTTPException(500, "Could not create chat session.")
    return _serialise_session(session)


@app.get("/api/chat/sessions/{chat_id}")
def get_chat(chat_id: str, current=Depends(get_current_user)):
    """Fetch one chat session including all of its messages."""
    session = get_chat_session(current["email"], chat_id)
    if not session:
        raise HTTPException(404, "Chat session not found.")
    return _serialise_session(session)


@app.delete("/api/chat/sessions/{chat_id}")
def remove_chat(chat_id: str, current=Depends(get_current_user)):
    """Delete a chat session."""
    if not get_chat_session(current["email"], chat_id):
        raise HTTPException(404, "Chat session not found.")
    delete_chat_session(current["email"], chat_id)
    return {"ok": True}


@app.post("/api/chat/sessions/{chat_id}/messages")
async def send_message(
    chat_id: str,
    req: SendMessageReq,
    current=Depends(get_current_user),
):
    """Append a user message and produce the tutor reply.

    The route is async and offloads the blocking OpenAI call to a dedicated
    thread pool so the uvicorn event loop stays responsive while waiting for
    the GPT response. Returns both the persisted user message (with timestamp)
    and the new assistant message so the client renders them in one round-trip.
    """
    text = (req.content or "").strip()
    if not text:
        raise HTTPException(400, "Message content cannot be empty.")
    if len(text) > 4000:
        raise HTTPException(400, "Message is too long (max 4000 characters).")

    session = get_chat_session(current["email"], chat_id)
    if not session:
        raise HTTPException(404, "Chat session not found.")

    grade = session.get("grade", current["user"].get("grade", 4))
    subject = session.get("subject", "General")
    language = session.get("language", "en")
    history = session.get("messages", [])

    # 1. Save the student's message.
    save_message(current["email"], chat_id, "user", text)

    # 2. Generate a tutor reply — run blocking httpx+OpenAI in the thread pool.
    #    The agent's preferred_format tells GPT HOW to structure the answer
    #    BEFORE it's generated (proactive format decision).
    reply_result = await run_in_thread(
        generate_reply,
        user_message=text,
        grade=grade,
        subject=subject,
        history=history,
        language=language,
        preferred_format=req.preferred_format,
    )
    reply = reply_result["text"]
    is_relevant = bool(reply_result.get("is_relevant", True))

    # 3. Persist the assistant reply.
    save_message(
        current["email"],
        chat_id,
        "assistant",
        reply,
        skip_tutor=not is_relevant,
    )

    # 4. Return the *latest* persisted versions so timestamps match disk.
    refreshed = get_chat_session(current["email"], chat_id) or session
    msgs = refreshed.get("messages", [])
    return {
        "user_message": _serialise_session(refreshed)["messages"][-2] if len(msgs) >= 2 else None,
        "assistant_message": _serialise_session(refreshed)["messages"][-1],
        "is_relevant": is_relevant,
        "session": {
            "id": refreshed["id"],
            "title": refreshed.get("title"),
            "message_count": len(msgs),
            "timestamp": refreshed.get("timestamp"),
        },
    }


# ──────────────────────────────────────────────────────────────────────────────
# Multimedia: image generation + text-to-speech
# ──────────────────────────────────────────────────────────────────────────────

def _public_image_url(raw: str) -> str:
    """Convert a tutor-generated image reference to something the React app can render.

    `utils/llm.generate_image` may return either:
      * a remote https URL (from DALL·E 3), or
      * a local path under `temp_generated_images/...` (from gpt-image-1 b64).

    Remote URLs are passed through unchanged; local paths are rewritten to the
    static-mount route so the browser can fetch them via the API server.
    """
    if not raw:
        return raw
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    # Treat anything else as a local file path. We only care about the basename;
    # the file must already live inside `temp_generated_images/` for the static
    # mount to find it (utils/llm._save_b64_image_to_temp guarantees this when
    # the API server is started from the AutiStudy directory).
    return f"/api/generated-images/{Path(raw).name}"


@app.post("/api/chat/sessions/{chat_id}/image")
async def generate_chat_image(chat_id: str, current=Depends(get_current_user)):
    """Generate a visual aid for the most recent user question.

    Routes through `chat_engine.generate_visual_aid`, which picks ONE of:

      * a DALL·E illustration (for countable arithmetic and concept questions), or
      * a step-by-step KaTeX solution card (for fractions / algebra / decimals,
        where DALL·E would miscount and miswrite math symbols).

    The result is attached to the latest assistant message (so a session re-fetch
    shows it inline) and returned to the client so it can render immediately.

    The endpoint URL keeps its name (`/image`) for backwards compatibility, but
    the response shape is now polymorphic — see `kind` field.
    """
    if not tutor_is_configured():
        raise HTTPException(503, "Visual aids are not available right now.")

    session = get_chat_session(current["email"], chat_id)
    if not session:
        raise HTTPException(404, "Chat session not found.")

    messages = session.get("messages", [])
    if not messages:
        raise HTTPException(400, "Send a message first so I know what to illustrate.")

    last_user_msg: Optional[dict] = next(
        (m for m in reversed(messages) if m.get("role") == "user"), None,
    )
    if not last_user_msg:
        raise HTTPException(400, "No user question found to illustrate yet.")

    aid = await run_in_thread(
        tutor_generate_visual_aid,
        user_message=last_user_msg["content"],
        grade=session.get("grade", current["user"].get("grade", 4)),
        subject=session.get("subject", "General"),
        history=messages,
        language=session.get("language", "en"),
    )
    if not aid:
        raise HTTPException(502, "Visual aid generation failed. Please try again.")

    # Attach visual aid to the substantive tutor answer, not adaptation stubs.
    from utils.visual_aids import substantive_assistant_index
    target_index = substantive_assistant_index(messages)

    kind = aid.get("kind")
    if kind == "image":
        public_url = _public_image_url(aid.get("image_url", ""))
        save_media_to_message(
            current["email"], chat_id, target_index, image_url=public_url,
        )
        return {
            "kind": "image",
            "image_url": public_url,
            "message_index": target_index,
        }

    if kind == "math_steps":
        steps_payload = aid.get("math_steps") or {}
        save_media_to_message(
            current["email"], chat_id, target_index, math_steps=steps_payload,
        )
        return {
            "kind": "math_steps",
            "math_steps": steps_payload,
            "message_index": target_index,
        }

    if kind == "emoji_counting":
        ec_payload = aid.get("emoji_counting") or {}
        save_media_to_message(
            current["email"], chat_id, target_index, emoji_counting=ec_payload,
        )
        return {
            "kind": "emoji_counting",
            "emoji_counting": ec_payload,
            "message_index": target_index,
        }

    if kind == "factor_tree":
        payload = aid.get("factor_tree") or {}
        save_media_to_message(
            current["email"], chat_id, target_index, extra={"factor_tree": payload},
        )
        return {"kind": "factor_tree", "factor_tree": payload, "message_index": target_index}

    if kind == "fraction_bar":
        payload = aid.get("fraction_bar") or {}
        save_media_to_message(
            current["email"], chat_id, target_index, extra={"fraction_bar": payload},
        )
        return {"kind": "fraction_bar", "fraction_bar": payload, "message_index": target_index}

    if kind == "number_line":
        payload = aid.get("number_line") or {}
        save_media_to_message(
            current["email"], chat_id, target_index, extra={"number_line": payload},
        )
        return {"kind": "number_line", "number_line": payload, "message_index": target_index}

    if kind == "bar_chart":
        payload = aid.get("bar_chart") or {}
        save_media_to_message(
            current["email"], chat_id, target_index, extra={"bar_chart": payload},
        )
        return {"kind": "bar_chart", "bar_chart": payload, "message_index": target_index}

    if kind == "percentage_bar":
        payload = aid.get("percentage_bar") or {}
        save_media_to_message(current["email"], chat_id, target_index, extra={"percentage_bar": payload})
        return {"kind": "percentage_bar", "percentage_bar": payload, "message_index": target_index}

    if kind == "times_table":
        payload = aid.get("times_table") or {}
        save_media_to_message(current["email"], chat_id, target_index, extra={"times_table": payload})
        return {"kind": "times_table", "times_table": payload, "message_index": target_index}

    if kind == "geometry":
        payload = aid.get("geometry") or {}
        save_media_to_message(current["email"], chat_id, target_index, extra={"geometry": payload})
        return {"kind": "geometry", "geometry": payload, "message_index": target_index}

    if kind == "ratio":
        payload = aid.get("ratio") or {}
        save_media_to_message(current["email"], chat_id, target_index, extra={"ratio": payload})
        return {"kind": "ratio", "ratio": payload, "message_index": target_index}

    raise HTTPException(502, "Visual aid generation produced an unknown response.")


@app.post("/api/chat/speech")
async def synthesize_speech(req: SpeechReq, current=Depends(get_current_user)):
    """Convert arbitrary tutor text to speech (base64 MP3).

    Used by the chat UI's "read aloud" button on assistant messages — keeps
    audio fully in-memory so we don't pollute disk with throwaway clips.
    """
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(400, "Text cannot be empty.")
    if len(text) > 4000:
        text = text[:4000]

    if not tutor_is_configured():
        raise HTTPException(503, "Read-aloud is not available right now.")

    audio_b64 = await run_in_thread(
        tutor_generate_speech, text=text, language=req.language or "en"
    )
    if not audio_b64:
        raise HTTPException(502, "Speech generation failed.")

    return {"audio_base64": audio_b64, "mime_type": "audio/mpeg"}


# ──────────────────────────────────────────────────────────────────────────────
# Quiz endpoints
# ──────────────────────────────────────────────────────────────────────────────

class QuizSubmitRequest(BaseModel):
    subject: str
    questions: list
    answers: list          # user's chosen answer strings
    time_per_question: list
    total_time: float


@app.get("/api/quiz/chapters")
async def quiz_chapters(subject: str, current=Depends(get_current_user)):
    """Return the list of chapters for the student's grade + subject from the textbook."""
    from utils.book_parser import get_chapters
    grade = current["user"].get("grade", 4)
    chapters = get_chapters(grade, subject)
    if chapters is None:
        raise HTTPException(404, f"No textbook found for Grade {grade} {subject}.")
    return {"chapters": chapters, "grade": grade, "subject": subject}


class QuizFromChatRequest(BaseModel):
    subject: str
    num_questions: int = 5


@app.post("/api/quiz/generate-from-chat")
async def quiz_generate_from_chat(req: QuizFromChatRequest, current=Depends(get_current_user)):
    """
    Generate a quiz from the student's most recent chat session for this subject.
    Falls back to general subject questions if no chat history exists.
    """
    from quiz_engine import generate_quiz_from_chat, generate_quiz_questions

    email = current["email"]
    grade = current["user"].get("grade", 4)

    # Find the most recent chat for this subject that has enough messages
    all_chats = get_user_chats(email)
    chat_history = []
    for chat_meta in reversed(all_chats):  # most recent first
        if chat_meta.get("subject") == req.subject:
            session = get_chat_session(email, chat_meta["id"])
            if session:
                msgs = [m for m in session.get("messages", []) if m.get("role") in ("user", "assistant")]
                if len(msgs) >= 4:
                    chat_history = msgs
                    break

    if chat_history:
        result = await run_in_thread(
            generate_quiz_from_chat,
            grade=grade,
            subject=req.subject,
            chat_history=chat_history,
            num_questions=req.num_questions,
        )
        if result:
            return {
                "questions": result["questions"],
                "grade": grade,
                "subject": req.subject,
                "topic": result["topic_summary"],
                "from_chat": True,
            }

    # Fallback: no chat history → general subject questions
    from quiz_engine import generate_quiz_questions
    questions = await run_in_thread(
        generate_quiz_questions,
        grade=grade,
        subject=req.subject,
        num_questions=req.num_questions,
    )
    if not questions:
        raise HTTPException(502, "Could not generate questions. Please try again.")
    return {
        "questions": questions,
        "grade": grade,
        "subject": req.subject,
        "topic": req.subject,
        "from_chat": False,
    }


class QuizGenerateRequest(BaseModel):
    subject: str
    num_questions: int = 5
    topic: Optional[str] = None
    chapter_number: Optional[int] = None   # if set, generate from textbook chapter


@app.post("/api/quiz/generate")
async def quiz_generate(req: QuizGenerateRequest, current=Depends(get_current_user)):
    """Generate a fresh set of MCQ questions for the logged-in student."""
    from quiz_engine import generate_quiz_questions, generate_quiz_from_chapter_content
    grade = current["user"].get("grade", 4)

    if req.chapter_number is not None:
        # Generate from specific textbook chapter
        from utils.book_parser import get_chapter_content, get_chapters
        content = get_chapter_content(grade, req.subject, req.chapter_number)
        if not content:
            raise HTTPException(404, f"Chapter {req.chapter_number} not found.")
        # Get chapter title for display
        chapters = get_chapters(grade, req.subject) or []
        ch_title = next((c["title"] for c in chapters if c["number"] == req.chapter_number), f"Chapter {req.chapter_number}")
        questions = await run_in_thread(
            generate_quiz_from_chapter_content,
            grade=grade,
            subject=req.subject,
            chapter_title=ch_title,
            chapter_content=content,
            num_questions=req.num_questions,
        )
        topic = ch_title
    else:
        questions = await run_in_thread(
            generate_quiz_questions,
            grade=grade,
            subject=req.subject,
            num_questions=req.num_questions,
            topic=req.topic,
        )
        topic = req.topic or req.subject

    if not questions:
        raise HTTPException(502, "Could not generate questions. Please try again.")
    return {"questions": questions, "grade": grade, "subject": req.subject, "topic": topic}


@app.post("/api/quiz/submit")
async def quiz_submit(req: QuizSubmitRequest, current=Depends(get_current_user)):
    """Score a completed quiz, persist the result, and award stars."""
    from utils.quiz_db import save_quiz_attempt, stars_for_score
    from utils.auth import load_users, save_users

    email = current["email"]
    grade = current["user"].get("grade", 4)

    correct_answers = [q.get("correct", "") for q in req.questions]
    attempt = save_quiz_attempt(
        user_email=email,
        grade=grade,
        subject=req.subject,
        questions=req.questions,
        answers=req.answers,
        correct_answers=correct_answers,
        time_per_question=req.time_per_question,
        total_time=req.total_time,
    )

    # Award stars to user profile
    stars_earned = stars_for_score(attempt["score_percent"])
    users = load_users()
    if email in users:
        users[email]["stars"] = users[email].get("stars", 0) + stars_earned
        save_users(users)

    return {
        "score_percent": attempt["score_percent"],
        "num_correct": attempt["num_correct"],
        "num_questions": attempt["num_questions"],
        "stars_earned": stars_earned,
        "attempt_id": attempt["id"],
    }


@app.get("/api/quiz/history")
async def quiz_history(current=Depends(get_current_user)):
    """Return recent quiz attempts for the logged-in student."""
    from utils.quiz_db import get_quiz_history
    return {"history": get_quiz_history(current["email"], limit=20)}


@app.get("/api/analytics")
async def analytics(current=Depends(get_current_user)):
    """Return full learning analytics for the logged-in student."""
    from utils.quiz_db import get_user_analytics
    data = get_user_analytics(current["email"])
    # Also attach current stars from user profile
    data["total_stars"] = current["user"].get("stars", 0)
    return data


@app.get("/api/chat/sessions/{chat_id}/recap")
async def get_chat_recap(chat_id: str, current=Depends(get_current_user)):
    """Recap of the current chat session — key points from this conversation."""
    session = get_chat_session(current["email"], chat_id)
    if not session:
        raise HTTPException(404, "Chat session not found.")

    from chat_engine import generate_session_recap

    grade = current["user"].get("grade", 4)
    subject = session.get("subject", "General")
    language = session.get("language", "en")

    return await run_in_thread(
        generate_session_recap,
        grade=grade,
        subject=subject,
        language=language,
        messages=session.get("messages", []),
    )


@app.post("/api/chat/sessions/{chat_id}/quiz")
async def generate_chat_quiz(chat_id: str, current=Depends(get_current_user)):
    """Generate a quiz based on what was discussed in a specific chat session."""
    session = get_chat_session(current["email"], chat_id)
    if not session:
        raise HTTPException(404, "Chat session not found.")

    messages = session.get("messages", [])
    if len([m for m in messages if m.get("role") == "user"]) < 2:
        raise HTTPException(400, "Not enough conversation yet to make a quiz. Keep chatting first!")

    from quiz_engine import generate_quiz_from_chat
    grade = current["user"].get("grade", 4)
    subject = session.get("subject", "General")

    result = await run_in_thread(
        generate_quiz_from_chat,
        grade=grade,
        subject=subject,
        chat_history=messages,
        num_questions=5,
    )

    if not result:
        raise HTTPException(502, "Could not generate quiz from this chat. Please try again.")

    return {
        "questions": result["questions"],
        "topic_summary": result["topic_summary"],
        "grade": grade,
        "subject": subject,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  TEACHING AGENT  — Adaptive Modality Endpoints
# ══════════════════════════════════════════════════════════════════════════════

class EmotionRequest(BaseModel):
    session_id: str
    image_b64: str          # base64-encoded JPEG from webcam


class ForceModalityRequest(BaseModel):
    session_id: str
    modality: str           # "text" | "text_image" | "text_image_voice" | "step_by_step"


@app.post("/api/agent/analyze-emotion")
async def agent_analyze_emotion(body: EmotionRequest, current=Depends(get_current_user)):
    """
    Analyze student's facial expression and update agent state.

    Flow:
      1. Forward webcam frame (base64 JPEG) to OpenAI Vision (gpt-4o-mini)
      2. Parse emotion result (happy/confused/frustrated/neutral/focused/no_face)
      3. Feed result into the session's AgentState machine
      4. Return new modality + action taken

    Called by the frontend every ~4 seconds while the student is in chat.
    """
    if not body.image_b64 or len(body.image_b64) < 100:
        raise HTTPException(400, "No valid image data provided.")

    # Run emotion detection in thread (synchronous OpenAI call)
    emotion_result = await run_in_thread(analyze_emotion, body.image_b64)

    # Feed into agent state machine
    state = get_or_create_state(body.session_id)
    decision = state.record_emotion(emotion_result)

    return {
        "emotion": emotion_result["emotion"],
        "confidence": emotion_result["confidence"],
        "understood": emotion_result["understood"],
        "description": emotion_result.get("description", ""),
        "modality": decision["modality"],
        "action": decision["action"],
        "modality_label": decision["modality_label"],
        "emotion_emoji": decision["emotion_emoji"],
        "consecutive_confused": decision["consecutive_confused"],
        "consecutive_understood": decision["consecutive_understood"],
    }


@app.get("/api/agent/state/{session_id}")
async def agent_state(session_id: str, current=Depends(get_current_user)):
    """Return current agent state for a session (modality, history, counters)."""
    state = agent_get_state(session_id)
    if state is None:
        # No state yet — return default
        return {
            "session_id": session_id,
            "modality": "text",
            "modality_label": "Text only",
            "consecutive_confused": 0,
            "consecutive_understood": 0,
            "escalation_count": 0,
            "de_escalation_count": 0,
            "emotion_history": [],
        }
    return state


@app.post("/api/agent/reset")
async def agent_reset(body: dict, current=Depends(get_current_user)):
    """Reset agent state for a session (call when starting a new topic)."""
    session_id = body.get("session_id", "")
    if not session_id:
        raise HTTPException(400, "session_id required.")
    agent_reset_state(session_id)
    return {"ok": True, "message": "Agent state reset."}


@app.post("/api/agent/force-modality")
async def agent_force_modality_endpoint(body: ForceModalityRequest, current=Depends(get_current_user)):
    """Manually override the modality (e.g. student or parent requests specific mode)."""
    valid = {"text", "text_image", "text_image_voice", "step_by_step"}
    if body.modality not in valid:
        raise HTTPException(400, f"modality must be one of {valid}")
    state = agent_force_modality(body.session_id, body.modality)  # type: ignore[arg-type]
    return state


class AgentRunRequest(BaseModel):
    session_id: str
    image_b64: str
    consecutive_confused: int = 0
    tools_used_this_session: list[str] = []


@app.post("/api/agent/run")
async def agent_run(body: AgentRunRequest, current=Depends(get_current_user)):
    """
    TRUE AGENTIC AI endpoint — ReAct pattern with OpenAI Function Calling.

    Unlike /api/agent/analyze-emotion (which uses fixed rules), this endpoint
    lets GPT-4o REASON about the student's situation and DECIDE which tool to
    use. The LLM reads the facial emotion + last chat messages + student context
    and picks from 8 available teaching tools.

    Returns:
      {
        emotion, confidence, understood,
        tool_called, tool_emoji, reasoning,
        modality, action_data, duration_ms
      }
    """
    if not body.image_b64 or len(body.image_b64) < 100:
        raise HTTPException(400, "No valid image data provided.")

    user = current["user"]
    grade = user.get("grade", 4)
    email = current["email"]

    # Get subject from chat session
    subject = "General"
    try:
        session = get_chat_session(email, body.session_id)
        if session:
            subject = session.get("subject", "General")
    except Exception:
        pass

    result = await run_in_thread(
        run_media_agent,
        image_b64=body.image_b64,
        session_id=body.session_id,
        user_email=email,
        grade=grade,
        subject=subject,
        consecutive_confused=body.consecutive_confused,
        tools_used_this_session=body.tools_used_this_session,
    )

    return result


class ContentGenerateRequest(BaseModel):
    """
    Used by the new adaptive agent architecture.
    The LOCAL TutorPolicyEngine already decided the ACTION.
    This endpoint only generates the CONTENT for that action using GPT.
    Much cheaper: no vision, no decision reasoning — just content.
    """
    action: str
    session_id: str
    subject: str = "General"
    last_question: str = ""
    last_answer: str = ""
    escalation_level: int = 1


def _subject_guard(subject: str) -> str:
    return (
        f"Subject: {subject}. Stay strictly within this subject — "
        f"do NOT switch to math or another topic unless the student's question is about that."
    )


ACTION_PROMPTS = {
    "SIMPLIFY_EXPLANATION": (
        "The student seems tired or discouraged. Re-explain their ORIGINAL question using "
        "ONLY 3–5 short sentences total. Give 2–3 concrete everyday examples with emojis "
        "(e.g. animals, food, things they see daily). "
        "No long paragraphs, no bullet lists longer than 3 items, no comprehension questions. "
        "Be warm and gentle. Stay on the same topic."
    ),
    "SHOW_VISUAL_EXPLANATION": (
        "Say ONE short friendly sentence introducing a picture that will appear next. "
        "Example: 'Here's a picture to help! 🎨' Do NOT write ASCII art or long text."
    ),
    "SHOW_FLOWCHART_STEPS": (
        "Re-explain the ORIGINAL question in a VERY compact way:\n"
        "- Max 4 short sentences total\n"
        "- Then one arrow flowchart line like: Step 1 → Step 2 → Step 3\n"
        "- Then ONE emoji-rich mini example (2 lines max)\n"
        "No comprehension questions. Stay on topic."
    ),
    "USE_VOICE_AID": (
        "Say ONE short friendly sentence before the answer is read aloud. "
        "Example: 'Let me read this out loud for you! 🔊' Maximum 15 words."
    ),
    "ASK_CHECK_UNDERSTANDING": (
        "Ask the student 1-2 very simple, friendly questions about the SAME topic they asked about. "
        "Frame them positively. Do not ask what question they want to understand."
    ),
    "GIVE_MINI_PUZZLE": (
        "Create a small, fun, interactive challenge or mini-puzzle related to the topic. "
        "Make it engaging and achievable. Include the answer key at the end hidden behind 'Answer: ||...||'."
    ),
    "SUGGEST_BREAK": (
        "Write a very short, warm, encouraging message suggesting the student take a 5-minute break. "
        "Praise their effort. Tell them the topic will be here when they come back."
    ),
    "SUGGEST_TRY_TOMORROW": (
        "Write a warm, positive message suggesting the student save this topic for tomorrow "
        "when they are fresh. Acknowledge their hard work today."
    ),
}


@app.post("/api/agent/generate-content")
async def agent_generate_content(body: ContentGenerateRequest, current=Depends(get_current_user)):
    """
    NEW adaptive agent endpoint.

    The TutorPolicyEngine (running locally in the browser) already decided
    WHAT action to take. This endpoint generates the actual CONTENT for that action.

    Cost: 1 GPT call per intervention (not per frame). Interventions happen at most
    every 12 seconds when needed — much cheaper than old approach.
    """
    action = body.action
    if action == "DO_NOTHING" or action not in ACTION_PROMPTS:
        return {"content": None}

    action_prompt = ACTION_PROMPTS[action]
    subject_ctx = _subject_guard(body.subject)
    question_ctx = f"Student's original question (keep answering THIS): {body.last_question}" if body.last_question else ""
    answer_ctx   = f"Previous tutor answer: {body.last_answer}"  if body.last_answer  else ""

    system = (
        "You are a warm, patient AI tutor for autistic children aged 8–12. "
        "Never say 'you look confused' or label the student's feelings. "
        "Be supportive, use simple language, emojis are encouraged. "
        "Always stay on the student's original question and current subject. "
        "When asked for brevity, obey strictly — shorter is better."
    )
    user_msg = f"{subject_ctx}\n\n{action_prompt}\n\n{question_ctx}\n{answer_ctx}".strip()

    def _gen():
        from openai import OpenAI
        client = OpenAI()
        max_tokens = 200 if action == "SHOW_FLOWCHART_STEPS" else (120 if action == "SIMPLIFY_EXPLANATION" else 80)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user_msg},
            ],
            max_tokens=max_tokens,
            temperature=0.5,
        )
        return resp.choices[0].message.content or ""

    content = await run_in_thread(_gen)
    return {"content": content, "action": action}


class StepMcqsRequest(BaseModel):
    session_id: str
    subject: str = "General"
    last_question: str = ""
    last_answer: str = ""
    adaptation_content: str = ""
    mode: str = "default"  # "default" | "teaching"


@app.post("/api/agent/step-mcqs")
async def agent_step_mcqs(body: StepMcqsRequest, current=Depends(get_current_user)):
    """Easy step-by-step MCQs — recall check or teaching ladder with hints."""
    subject_ctx = _subject_guard(body.subject)
    if body.mode == "appreciation":
        user_msg = (
            f"{subject_ctx}\n\n"
            f"Student question: {body.last_question}\n"
            f"Tutor answer: {body.last_answer[:800]}\n\n"
            "The student said they understood — celebrate them! Create 2 to 3 VERY EASY, "
            "encouraging quiz questions about the same topic. Always positive tone. "
            "Each question: max 12 words. Each option: max 6 words. "
            "wrong_hint: 2 short kind hint lines, never discouraging. "
            'Return ONLY valid JSON: '
            '{"questions":[{"step_label":"Fun check 1","question":"...","options":["A","B","C"],"correct_index":0,"wrong_hint":"Nice try!\\nLook at the answer above."}]}'
        )
        system_msg = (
            "You create warm, easy celebration quizzes for children aged 8–12. "
            "Output JSON only. Be encouraging no matter what."
        )
    elif body.mode == "teaching":
        user_msg = (
            f"{subject_ctx}\n\n"
            f"Student question: {body.last_question}\n"
            f"Tutor answer: {body.last_answer[:800]}\n"
            f"Step breakdown (if any): {body.adaptation_content[:600]}\n\n"
            "The student could not recall the main idea. Create 3 to 4 VERY EASY step-by-step MCQs "
            "that teach the topic one small step at a time, in order. "
            "Each question: max 14 words. Each option: max 7 words. "
            "Each wrong_hint: exactly 2 short encouraging hint lines pointing to that step. "
            "Return ONLY valid JSON: "
            '{"questions":[{"step_label":"Step 1","question":"...","options":["A","B","C"],"correct_index":0,"wrong_hint":"Line one.\\nLine two."}]}'
        )
        system_msg = (
            "You create gentle step-by-step teaching MCQs for children aged 8–12 with autism. "
            "Output JSON only. Same topic as the student's question."
        )
    else:
        user_msg = (
            f"{subject_ctx}\n\n"
            f"Student question: {body.last_question}\n"
            f"Tutor answer summary: {body.last_answer[:800]}\n\n"
            "Create 2 to 4 VERY EASY multiple-choice questions — one per step of the topic breakdown. "
            "Each question: max 12 words. Each option: max 6 words. "
            "Return ONLY valid JSON: "
            '{"questions":[{"step_label":"Step 1","question":"...","options":["A","B","C"],"correct_index":0,"wrong_hint":"Two short lines if wrong."}]}'
        )
        system_msg = (
            "You create easy teaching MCQs for children aged 8–12. "
            "Output JSON only. Questions must teach the same topic the student asked about."
        )

    def _gen():
        import json
        from openai import OpenAI
        client = OpenAI()
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=700,
            temperature=0.4,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content or "{}"
        try:
            data = json.loads(raw)
            return data.get("questions", [])[:4]
        except Exception:
            return []

    questions = await run_in_thread(_gen)
    return {"questions": questions}


class AgentDecideRequest(BaseModel):
    """Used by the new MediaPipe path — emotion already detected client-side."""
    session_id: str
    emotion: str
    confidence: float = 0.7
    understood: bool = False
    description: str = ""
    consecutive_confused: int = 0
    tools_used_this_session: list[str] = []


@app.post("/api/agent/decide")
async def agent_decide(body: AgentDecideRequest, current=Depends(get_current_user)):
    """
    TRUE AGENTIC AI — FAST PATH (MediaPipe edition).

    Emotion is pre-analyzed by MediaPipe running at 30fps in the browser.
    This endpoint skips the OpenAI Vision call and goes straight to the
    GPT-4o ReAct agent to decide which teaching tool to use.

    Saves ~500ms vs /api/agent/run (no Vision API call).
    Called only when emotion changes or every 6 seconds (not every frame).
    """
    user = current["user"]
    grade = user.get("grade", 4)
    email = current["email"]

    subject = "General"
    try:
        session = get_chat_session(email, body.session_id)
        if session:
            subject = session.get("subject", "General")
    except Exception:
        pass

    result = await run_in_thread(
        decide_from_emotion,
        emotion=body.emotion,
        confidence=body.confidence,
        understood=body.understood,
        description=body.description,
        session_id=body.session_id,
        user_email=email,
        grade=grade,
        subject=subject,
        consecutive_confused=body.consecutive_confused,
        tools_used_this_session=body.tools_used_this_session,
    )
    return result


class SessionSummaryRequest(BaseModel):
    session_id: str
    subject: str
    topic: str = ""
    tools_used: list[str] = []
    outcome: str = "partial"   # "understood" | "partial" | "stuck"


@app.post("/api/agent/session-summary")
async def agent_session_summary(body: SessionSummaryRequest, current=Depends(get_current_user)):
    """Record a session summary into the student's long-term agent memory."""
    await run_in_thread(
        memory_record_session,
        email=current["email"],
        subject=body.subject,
        topic=body.topic,
        tools_used=body.tools_used,
        outcome=body.outcome,
    )
    return {"ok": True}


class RecordAdaptationPrefRequest(BaseModel):
    subject: str
    adaptation: str  # step_by_step | read_aloud | image | mcq_recall | breathing
    via: str = "popup_yes"
    happy_cv: bool = False


@app.post("/api/agent/record-adaptation-preference")
async def agent_record_adaptation_preference(
    body: RecordAdaptationPrefRequest,
    current=Depends(get_current_user),
):
    """Save which help step worked when the student confirmed understanding."""
    await run_in_thread(
        record_adaptation_preference,
        current["email"],
        body.subject,
        body.adaptation,
        via=body.via,
        happy_cv=body.happy_cv,
    )
    order = await run_in_thread(
        get_adaptation_ladder_order,
        current["email"],
        body.subject,
    )
    return {"ok": True, "ladder_order": order}


@app.get("/api/agent/adaptation-ladder")
async def agent_adaptation_ladder(subject: str, current=Depends(get_current_user)):
    """Personalized help-ladder order for this student + subject."""
    order = await run_in_thread(
        get_adaptation_ladder_order,
        current["email"],
        subject,
    )
    from utils.agent_memory import get_preferred_adaptation

    preferred = await run_in_thread(
        get_preferred_adaptation,
        current["email"],
        subject,
    )
    return {"ladder_order": order, "preferred_adaptation": preferred}


@app.get("/api/agent/memory")
async def agent_memory(current=Depends(get_current_user)):
    """Return the agent's memory summary for this student (for parent dashboard)."""
    summary = await run_in_thread(get_memory_summary, current["email"])
    return summary
