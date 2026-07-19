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
import random
import sys
import io
from datetime import date, timedelta
from pathlib import Path
from typing import Optional, Tuple

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
from utils.session import create_session, delete_session, get_session, load_sessions, save_sessions  # noqa: E402
from utils.auth import (  # noqa: E402
    hash_password, load_users, save_users,
    verify_password, migrate_password_if_needed,
)
from utils.parent_db import (  # noqa: E402
    add_linked_child,
    clear_all_children,
    create_parent,
    delete_parent,
    get_parent,
    get_parent_children,
    load_parents,
    normalize_relationship,
    parent_exists,
    parent_has_child,
    remove_linked_child,
    save_parents,
    strip_password as parent_strip_pw,
    update_parent,
)
from utils.email_otp import (  # noqa: E402
    SUPPORT_INBOX,
    consume_password_reset_grant,
    create_and_send_otp,
    issue_password_reset_grant,
    send_contact_form_email,
    send_family_invite_email,
    send_parent_link_request_email,
    verify_otp,
)
from utils.family_invite import (  # noqa: E402
    approve_invite,
    cancel_invite,
    clear_parent_links,
    create_invite,
    get_link_status_for_child,
    get_pending_for_child,
    list_child_invites,
    redeem_invite,
    reissue_approve_token,
    reject_invite,
    respond_with_approve_token,
    slots_for_child,
    unlink_parent_from_child,
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
    REVISION_ACTIVITIES,
    evaluate_revision_need,
    get_adaptation_ladder_order,
    get_current_preferred_modality,
    get_learner_profile,
    get_memory_context,
    get_memory_summary,
    record_adaptation_failure,
    record_adaptation_preference,
    save_learner_profile,
    update_audio_preference,
    record_session_summary as memory_record_session,
)
from utils.dashboard_extras import (  # noqa: E402
    VALID_MOODS,
    compute_journey,
    get_mood_today,
    get_schedule_for_day,
    merge_activity_dates,
    save_mood,
    set_schedule_for_day,
    toggle_schedule_item,
)
from utils.contact_store import save_contact_message  # noqa: E402

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
    expose_headers=["Retry-After"],
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
    family_code: Optional[str] = None  # legacy; unused in V6 invite flow


class SignupPendingResponse(BaseModel):
    ok: bool
    email: str
    detail: str
    expires_in_sec: Optional[int] = None
    retry_after_sec: Optional[int] = None
    dev_mode: bool = False
    dev_otp: Optional[str] = None


def _otp_send_http_error(sent: dict) -> HTTPException:
    """Map OTP send failure to 429 (rate limit) or 400, with Retry-After when known."""
    retry = sent.get("retry_after_sec")
    status = 429 if retry is not None else 400
    headers = {"Retry-After": str(int(retry))} if retry is not None else None
    return HTTPException(
        status_code=status,
        detail=sent.get("detail", "Could not send code."),
        headers=headers,
    )


class VerifyEmailReq(BaseModel):
    email: str
    code: str
    role: str  # "child" | "parent"


class ChildSignupReq(BaseModel):
    name: str
    email: str
    password: str
    grade: int = 4


class CreateChatReq(BaseModel):
    subject: str
    language: str = "en"


class SendMessageReq(BaseModel):
    content: str
    preferred_format: str = "normal"  # from agent: normal|simplified|step_by_step_flowchart|with_visual_description


VALID_TTS_VOICES = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}


class SpeechReq(BaseModel):
    text: str
    language: str = "en"
    voice: Optional[str] = None


class VisualAidReq(BaseModel):
    """Optional body for POST /api/chat/sessions/{id}/image."""
    attach_to: str = "substantive"  # "substantive" | "last"
    stub_message: Optional[str] = None


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
# Contact (Part B #6) — public form; emailed to support + saved to JSON
# ──────────────────────────────────────────────────────────────────────────────

VALID_CONTACT_ROLES = {"student", "parent", "teacher", "other"}


class ContactReq(BaseModel):
    name: str
    email: str
    role: str = "other"
    subject: str
    message: str


@app.post("/api/contact")
def submit_contact(req: ContactReq):
    """
    Contact form: email the message to supportAutistudy@gmail.com and
    keep a local copy in data/contact_messages.json.
    """
    name = (req.name or "").strip()
    email = (req.email or "").strip().lower()
    subject = (req.subject or "").strip()
    message = (req.message or "").strip()
    role = (req.role or "other").strip().lower()

    if len(name) < 2:
        raise HTTPException(400, "Please enter your name.")
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Please enter a valid email address.")
    if len(subject) < 2:
        raise HTTPException(400, "Please enter a short subject.")
    if len(message) < 10:
        raise HTTPException(400, "Please write a bit more in your message.")
    if len(message) > 4000:
        raise HTTPException(400, "Message is too long (max 4000 characters).")
    if role not in VALID_CONTACT_ROLES:
        role = "other"

    sent_ok, sent_detail = send_contact_form_email(
        name=name[:80],
        from_email=email[:120],
        role=role,
        subject=subject[:120],
        message=message,
    )
    if not sent_ok:
        raise HTTPException(
            503,
            sent_detail
            or "Could not deliver your message to support. Please try again in a moment.",
        )

    entry = save_contact_message(
        name=name[:80],
        email=email[:120],
        role=role,
        subject=subject[:120],
        message=message,
        email_sent=True,
        emailed_to=SUPPORT_INBOX,
    )
    return {
        "ok": True,
        "id": entry["id"],
        "detail": (
            f"Message sent to {SUPPORT_INBOX}. "
            "Thank you — the AutiStudy team will get back to you."
        ),
        "emailed_to": SUPPORT_INBOX,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Auth endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register", response_model=AuthResponse)
def register(req: RegisterReq):
    """Legacy endpoint — use /api/auth/child/signup."""
    raise HTTPException(
        400,
        "Please use the student or parent signup form.",
    )


@app.post("/api/auth/login", response_model=AuthResponse)
def login(req: LoginReq):
    email = req.email.strip().lower()
    users = load_users()
    user = users.get(email)
    if not user or not verify_password(req.password, user.get("password", "")):
        raise HTTPException(401, "Invalid email or password.")

    # V6: block login until email verified (legacy accounts without the flag stay allowed)
    if user.get("email_verified") is False:
        raise HTTPException(
            403,
            "Please verify your email before logging in. Check your inbox for the code.",
        )

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


# ── V6: Child signup + email OTP ─────────────────────────────────────────────

@app.post("/api/auth/child/signup", response_model=SignupPendingResponse)
def child_signup(req: ChildSignupReq):
    """Create an unverified student account and email a 6-digit OTP."""
    email = req.email.strip().lower()
    _validate_email(email)
    pw_err = _validate_password(req.password)
    if pw_err:
        raise HTTPException(400, pw_err)
    if req.grade not in GRADE_SUBJECTS:
        raise HTTPException(400, "Grade must be between 4 and 7.")
    if len((req.name or "").strip()) < 2:
        raise HTTPException(400, "Please enter your name.")

    if parent_exists(email):
        raise HTTPException(
            400,
            "This email is already used by a parent account. "
            "Parent and child must use different emails.",
        )

    users = load_users()
    existing = users.get(email)
    if existing and existing.get("email_verified") is not False:
        raise HTTPException(400, "An account with this email already exists. Please log in.")

    users[email] = {
        "name": req.name.strip() or "Student",
        "email": email,
        "password": hash_password(req.password),
        "role": "student",
        "grade": req.grade,
        "stars": 0,
        "badges": [],
        "progress": {},
        "email_verified": False,
        "avatar": random.choice(sorted(VALID_AVATARS)),
    }
    save_users(users)

    sent = create_and_send_otp(role="child", email=email, purpose="signup")
    if not sent.get("ok"):
        raise _otp_send_http_error(sent)

    return {
        "ok": True,
        "email": email,
        "detail": sent.get("detail", "Verification code sent."),
        "expires_in_sec": sent.get("expires_in_sec"),
        "retry_after_sec": sent.get("retry_after_sec"),
        "dev_mode": bool(sent.get("dev_mode")),
        "dev_otp": sent.get("dev_otp"),
    }


@app.post("/api/auth/verify-email", response_model=AuthResponse)
def verify_email(req: VerifyEmailReq):
    """Verify OTP and activate the account (child or parent)."""
    email = req.email.strip().lower()
    role = (req.role or "").strip().lower()
    if role not in ("child", "parent"):
        raise HTTPException(400, "Role must be 'child' or 'parent'.")

    ok, detail, _meta = verify_otp(role=role, email=email, code=req.code, expected_purpose="signup")
    if not ok:
        raise HTTPException(400, detail)

    if role == "child":
        users = load_users()
        user = users.get(email)
        if not user:
            raise HTTPException(404, "Account not found. Please sign up again.")
        user["email_verified"] = True
        users[email] = user
        save_users(users)
        safe = _strip_password(user)
        token = create_session(email, safe, current_page="dashboard", language="en")
        return {"token": token, "user": safe}

    parent = get_parent(email)
    if not parent:
        raise HTTPException(404, "Parent account not found. Please sign up again.")
    update_parent(email, email_verified=True)
    parent = get_parent(email)
    token = _create_parent_session(email)
    return {"token": token, "user": parent_strip_pw(parent)}


class ResendOtpReq(BaseModel):
    email: str
    role: str


@app.post("/api/auth/resend-otp", response_model=SignupPendingResponse)
def resend_otp(req: ResendOtpReq):
    email = req.email.strip().lower()
    role = (req.role or "").strip().lower()
    if role not in ("child", "parent"):
        raise HTTPException(400, "Role must be 'child' or 'parent'.")

    if role == "child":
        user = load_users().get(email)
        if not user:
            raise HTTPException(404, "No signup found for this email.")
        if user.get("email_verified") is True:
            raise HTTPException(400, "Email is already verified. Please log in.")
    else:
        parent = get_parent(email)
        if not parent:
            raise HTTPException(404, "No signup found for this email.")
        if parent.get("email_verified") is True:
            raise HTTPException(400, "Email is already verified. Please log in.")

    sent = create_and_send_otp(role=role, email=email, purpose="signup")
    if not sent.get("ok"):
        raise _otp_send_http_error(sent)
    return {
        "ok": True,
        "email": email,
        "detail": sent.get("detail", "Verification code sent."),
        "expires_in_sec": sent.get("expires_in_sec"),
        "retry_after_sec": sent.get("retry_after_sec"),
        "dev_mode": bool(sent.get("dev_mode")),
        "dev_otp": sent.get("dev_otp"),
    }


# ── Forgot password (child + parent, email OTP) ───────────────────────────────

_FORGOT_GENERIC_DETAIL = (
    "If an account exists for this email, we sent a verification code. "
    "Check your inbox (and Spam)."
)


class ForgotPasswordRequestReq(BaseModel):
    email: str
    role: str  # "child" | "parent"


class ForgotPasswordVerifyReq(BaseModel):
    email: str
    role: str
    code: str


class ForgotPasswordResetReq(BaseModel):
    email: str
    role: str
    reset_token: str
    new_password: str


def _forgot_account_exists(role: str, email: str) -> bool:
    if role == "child":
        return email in load_users()
    return get_parent(email) is not None


def _revoke_sessions_after_password_reset(role: str, email: str) -> None:
    """Old sessions must not keep working after a password reset."""
    email = email.strip().lower()
    if role == "child":
        from utils.user_cleanup import delete_sessions_for_email
        delete_sessions_for_email(email)
        return
    sessions = _load_parent_sessions()
    keep = {tok: s for tok, s in sessions.items() if s.get("email") != email}
    _save_parent_sessions(keep)


@app.post("/api/auth/forgot-password/request", response_model=SignupPendingResponse)
def forgot_password_request(req: ForgotPasswordRequestReq):
    """
    Send a password-reset OTP to a registered email (child or parent).
    Always returns a generic success payload to avoid email enumeration.
    """
    email = req.email.strip().lower()
    role = (req.role or "").strip().lower()
    if role not in ("child", "parent"):
        raise HTTPException(400, "Role must be 'child' or 'parent'.")
    _validate_email(email)

    # Anti-enumeration: same response whether or not the account exists.
    if not _forgot_account_exists(role, email):
        return {
            "ok": True,
            "email": email,
            "detail": _FORGOT_GENERIC_DETAIL,
            "expires_in_sec": None,
            "retry_after_sec": 60,
            "dev_mode": False,
            "dev_otp": None,
        }

    sent = create_and_send_otp(role=role, email=email, purpose="password_reset")
    if not sent.get("ok"):
        raise _otp_send_http_error(sent)

    return {
        "ok": True,
        "email": email,
        "detail": _FORGOT_GENERIC_DETAIL,
        "expires_in_sec": sent.get("expires_in_sec"),
        "retry_after_sec": sent.get("retry_after_sec"),
        "dev_mode": bool(sent.get("dev_mode")),
        "dev_otp": sent.get("dev_otp"),
    }


@app.post("/api/auth/forgot-password/resend", response_model=SignupPendingResponse)
def forgot_password_resend(req: ForgotPasswordRequestReq):
    """Resend password-reset OTP (same rules / anti-enumeration as request)."""
    return forgot_password_request(req)


@app.post("/api/auth/forgot-password/verify")
def forgot_password_verify(req: ForgotPasswordVerifyReq):
    """Verify the email OTP; on success issue a short-lived one-time reset token."""
    email = req.email.strip().lower()
    role = (req.role or "").strip().lower()
    if role not in ("child", "parent"):
        raise HTTPException(400, "Role must be 'child' or 'parent'.")

    ok, detail, _meta = verify_otp(
        role=role, email=email, code=req.code, expected_purpose="password_reset"
    )
    if not ok:
        raise HTTPException(400, detail)

    if not _forgot_account_exists(role, email):
        raise HTTPException(400, "Account not found. Please request a new code.")

    reset_token = issue_password_reset_grant(role=role, email=email)
    return {
        "ok": True,
        "email": email,
        "role": role,
        "reset_token": reset_token,
        "detail": "Code verified. You can set a new password now.",
    }


@app.post("/api/auth/forgot-password/reset")
def forgot_password_reset(req: ForgotPasswordResetReq):
    """Consume reset token and update password (child or parent)."""
    email = req.email.strip().lower()
    role = (req.role or "").strip().lower()
    if role not in ("child", "parent"):
        raise HTTPException(400, "Role must be 'child' or 'parent'.")

    # Validate strength before consuming the one-time grant.
    err = _validate_password(req.new_password)
    if err:
        raise HTTPException(400, err)

    ok, detail = consume_password_reset_grant(
        role=role, email=email, token=req.reset_token
    )
    if not ok:
        raise HTTPException(400, detail)

    if role == "child":
        users = load_users()
        user = users.get(email)
        if not user:
            raise HTTPException(404, "Account not found.")
        user["password"] = hash_password(req.new_password)
        # Password reset implies they control this inbox.
        user["email_verified"] = True
        users[email] = user
        save_users(users)
    else:
        parent = get_parent(email)
        if not parent:
            raise HTTPException(404, "Account not found.")
        update_parent(
            email,
            password=hash_password(req.new_password),
            email_verified=True,
        )

    _revoke_sessions_after_password_reset(role, email)
    return {
        "ok": True,
        "detail": "Your password has been updated successfully.",
    }


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
    relationship: str  # father | mother


@app.post("/api/auth/parent/signup", response_model=SignupPendingResponse)
def parent_signup(req: ParentSignupReq):
    """Create an unverified parent account and email a 6-digit OTP."""
    email = req.email.strip().lower()
    _validate_email(email)
    pw_err = _validate_password(req.password)
    if pw_err:
        raise HTTPException(400, pw_err)
    if len((req.name or "").strip()) < 2:
        raise HTTPException(400, "Please enter your name.")
    relationship = normalize_relationship(req.relationship)
    if not relationship:
        raise HTTPException(400, "Please choose Father or Mother.")

    if email in load_users():
        raise HTTPException(
            400,
            "This email is already used by a student account. "
            "Parent and child must use different emails.",
        )

    existing = get_parent(email)
    if existing and existing.get("email_verified") is not False:
        raise HTTPException(400, "A parent account with this email already exists. Please log in.")

    create_parent(
        email=email,
        name=req.name.strip() or "Parent",
        password_hash=hash_password(req.password),
        email_verified=False,
        relationship=relationship,
        link_status="none",
    )

    sent = create_and_send_otp(role="parent", email=email, purpose="signup")
    if not sent.get("ok"):
        raise _otp_send_http_error(sent)

    return {
        "ok": True,
        "email": email,
        "detail": sent.get("detail", "Verification code sent."),
        "expires_in_sec": sent.get("expires_in_sec"),
        "retry_after_sec": sent.get("retry_after_sec"),
        "dev_mode": bool(sent.get("dev_mode")),
        "dev_otp": sent.get("dev_otp"),
    }


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
    if parent.get("email_verified") is False:
        raise HTTPException(
            403,
            "Please verify your email before logging in. Check your inbox for the code.",
        )
    token = _create_parent_session(email)
    return {"token": token, "user": parent_strip_pw(parent)}


@app.post("/api/auth/parent/logout")
def parent_logout(current=Depends(get_current_parent)):
    _delete_parent_session(current["token"])
    return {"ok": True}


@app.get("/api/auth/parent/me")
def parent_me(current=Depends(get_current_parent)):
    return parent_strip_pw(current["parent"])


class ParentPasswordChangeReq(BaseModel):
    current_password: str
    new_password: str


@app.post("/api/auth/parent/password")
def parent_change_password(body: ParentPasswordChangeReq, current=Depends(get_current_parent)):
    """Allow a logged-in parent to change their password."""
    email = current["email"]
    parent = get_parent(email)
    if not parent:
        raise HTTPException(404, "Parent account not found.")
    if not verify_password(body.current_password, parent.get("password", "")):
        raise HTTPException(400, "Current password is incorrect.")
    err = _validate_password(body.new_password)
    if err:
        raise HTTPException(400, err)
    update_parent(email, password=hash_password(body.new_password))
    return {"ok": True, "detail": "Password updated."}


class ParentDeleteReq(BaseModel):
    password: str


@app.post("/api/auth/parent/delete")
def parent_delete_account(body: ParentDeleteReq, current=Depends(get_current_parent)):
    """Permanently delete the logged-in parent account."""
    email = current["email"]
    parent = get_parent(email)
    if not parent:
        raise HTTPException(404, "Parent account not found.")
    if not verify_password(body.password, parent.get("password", "")):
        raise HTTPException(400, "Password is incorrect.")

    clear_parent_links(email)
    if not delete_parent(email):
        raise HTTPException(500, "Could not delete parent account.")

    # Drop all sessions for this parent email
    sessions = _load_parent_sessions()
    keep = {tok: s for tok, s in sessions.items() if s.get("email") != email}
    _save_parent_sessions(keep)
    return {"ok": True, "detail": "Parent account deleted."}


# ── V6: Family invitation + child approval ───────────────────────────────────

class CreateInviteReq(BaseModel):
    parent_email: Optional[str] = None  # optional: email the code to parent


@app.post("/api/family/invite")
def family_create_invite(body: Optional[CreateInviteReq] = None, current=Depends(get_current_user)):
    """Child generates a temporary single-use Family Invitation Code."""
    email = current["email"]
    user = current["user"]
    if user.get("email_verified") is False:
        raise HTTPException(403, "Verify your email before inviting a parent.")

    slots = slots_for_child(email)
    if not slots.get("can_invite_more"):
        raise HTTPException(
            400,
            "Both Father and Mother slots are already linked. Unlink one before inviting again.",
        )

    invite = create_invite(email)

    email_sent = False
    email_detail: Optional[str] = None
    parent_email = ((body.parent_email if body else None) or "").strip().lower()
    if parent_email:
        _validate_email(parent_email)
        if parent_email == email:
            raise HTTPException(
                400,
                "Parent and child cannot use the same email address.",
            )
        ok, detail = send_family_invite_email(
            to=parent_email,
            child_name=str(user.get("name") or "Your child"),
            code=invite["code"],
            expires_in_hours=int(invite["expires_in_hours"]),
        )
        email_sent = ok
        if ok:
            email_detail = (
                f"Invitation emailed to {parent_email}. "
                "Ask them to check Inbox and Spam."
            )
        else:
            email_detail = (
                detail
                or "Could not send the email. Share the invitation code manually."
            )

    return {
        "ok": True,
        "invite_id": invite["invite_id"],
        "code": invite["code"],
        "expires_at": invite["expires_at"],
        "expires_in_hours": invite["expires_in_hours"],
        "email_sent": email_sent,
        "email_detail": email_detail,
        "emailed_to": parent_email if email_sent else None,
    }


@app.get("/api/family/status")
def family_status_child(current=Depends(get_current_user)):
    return get_link_status_for_child(current["email"])


@app.post("/api/family/invite/{invite_id}/cancel")
def family_cancel_invite(invite_id: str, current=Depends(get_current_user)):
    if not cancel_invite(current["email"], invite_id):
        raise HTTPException(404, "Invite not found or already used.")
    return {"ok": True, "status": get_link_status_for_child(current["email"])}


class ApproveRejectReq(BaseModel):
    invite_id: str


@app.post("/api/family/approve")
def family_approve(body: ApproveRejectReq, current=Depends(get_current_user)):
    ok, detail, info = approve_invite(current["email"], body.invite_id)
    if not ok or not info:
        raise HTTPException(400, detail)
    parent_email = info["parent_email"]
    add_linked_child(
        parent_email,
        current["email"],
        invite_id=info.get("invite_id"),
        linked_at=info.get("linked_at"),
        relationship=info.get("relationship"),
    )
    return {
        "ok": True,
        "linked_parent_email": parent_email,
        "relationship": info.get("relationship"),
        "status": get_link_status_for_child(current["email"]),
    }


def _frontend_base() -> str:
    return (os.environ.get("FRONTEND_URL") or "http://localhost:3000").rstrip("/")


def _notify_child_parent_link_request(
    *,
    child_email: str,
    child_name: str,
    parent_name: str,
    parent_email: str,
    approve_token: str,
) -> Tuple[bool, str]:
    base = _frontend_base()
    approve_url = f"{base}/family/respond?token={approve_token}&action=approve"
    reject_url = f"{base}/family/respond?token={approve_token}&action=reject"
    return send_parent_link_request_email(
        to=child_email,
        child_name=child_name,
        parent_name=parent_name,
        parent_email=parent_email,
        approve_url=approve_url,
        reject_url=reject_url,
    )


class EmailRespondReq(BaseModel):
    token: str
    action: str  # approve | reject


@app.post("/api/family/email-respond")
def family_email_respond(body: EmailRespondReq):
    """Approve/reject via one-time link from the student's email (no login required)."""
    ok, detail, info = respond_with_approve_token(body.token, body.action)
    if not ok or not info:
        raise HTTPException(400, detail)

    parent_email = info["parent_email"]
    child_email = info["child_email"]
    if info["action"] == "approve":
        add_linked_child(
            parent_email,
            child_email,
            invite_id=info.get("invite_id"),
            linked_at=info.get("linked_at"),
            relationship=info.get("relationship"),
        )
        return {
            "ok": True,
            "action": "approve",
            "detail": f"Linked with {parent_email}.",
            "parent_email": parent_email,
            "parent_name": info.get("parent_name"),
            "relationship": info.get("relationship"),
        }

    # Reject: clear pending only — keep any other linked children
    update_parent(
        parent_email,
        pending_child_email=None,
        pending_invite_id=None,
    )
    return {
        "ok": True,
        "action": "reject",
        "detail": "Parent request rejected.",
        "parent_email": parent_email,
        "parent_name": info.get("parent_name"),
    }


@app.post("/api/family/pending/{invite_id}/email-again")
def family_email_pending_again(invite_id: str, current=Depends(get_current_user)):
    """Resend Approve/Reject email to the student's own inbox."""
    ok, detail, info = reissue_approve_token(current["email"], invite_id)
    if not ok:
        raise HTTPException(400, detail)
    user = current["user"]
    sent_ok, sent_detail = _notify_child_parent_link_request(
        child_email=current["email"],
        child_name=str(user.get("name") or "there"),
        parent_name=str(info["parent_name"]),
        parent_email=str(info["parent_email"]),
        approve_token=str(info["approve_token"]),
    )
    if not sent_ok:
        raise HTTPException(400, sent_detail)
    return {
        "ok": True,
        "detail": f"Approval email sent to {current['email']}. Check Inbox and Spam.",
        "emailed_to": current["email"],
    }


@app.post("/api/family/reject")
def family_reject(body: ApproveRejectReq, current=Depends(get_current_user)):
    # Capture pending parent before reject clears it
    pending_parent = None
    for p in get_pending_for_child(current["email"]):
        if p.get("invite_id") == body.invite_id:
            pending_parent = p.get("parent_email")
            break

    ok, detail = reject_invite(current["email"], body.invite_id)
    if not ok:
        raise HTTPException(400, detail)

    if pending_parent:
        update_parent(
            pending_parent,
            pending_child_email=None,
            pending_invite_id=None,
        )
    else:
        for pemail, prec in list(load_parents().items()):
            if prec.get("pending_invite_id") == body.invite_id:
                update_parent(
                    pemail,
                    pending_child_email=None,
                    pending_invite_id=None,
                )
    return {"ok": True, "status": get_link_status_for_child(current["email"])}


class UnlinkReq(BaseModel):
    invite_id: Optional[str] = None
    parent_email: Optional[str] = None


@app.post("/api/family/unlink")
def family_unlink_child(
    body: Optional[UnlinkReq] = None,
    current=Depends(get_current_user),
):
    """Child unlinks one (or all) linked parent(s)."""
    status = get_link_status_for_child(current["email"])
    linked_parents = status.get("linked_parents") or []
    if not linked_parents and not status.get("linked_parent"):
        raise HTTPException(400, "No linked parent to unlink.")

    invite_id = (body.invite_id if body else None) or None
    parent_email = (body.parent_email if body else None) or None
    # Back-compat: no target → unlink singular first/only parent
    if not invite_id and not parent_email and status.get("linked_parent"):
        parent_email = status["linked_parent"]["email"]
        invite_id = status["linked_parent"].get("invite_id")

    ok, unlinked = unlink_parent_from_child(
        current["email"],
        parent_email=parent_email,
        invite_id=invite_id,
    )
    if not ok:
        raise HTTPException(400, "Could not unlink parent.")

    for pem in unlinked:
        remove_linked_child(pem, current["email"])

    return {"ok": True, "status": get_link_status_for_child(current["email"])}


class RedeemInviteReq(BaseModel):
    code: str


@app.post("/api/auth/parent/redeem-invite")
def parent_redeem_invite(body: RedeemInviteReq, current=Depends(get_current_parent)):
    """Parent enters Family Invitation Code → pending child approval."""
    parent = current["parent"]
    if parent.get("email_verified") is False:
        raise HTTPException(403, "Verify your email first.")

    relationship = normalize_relationship(parent.get("relationship"))
    if not relationship:
        raise HTTPException(400, "Your account is missing a Father/Mother designation.")

    if parent.get("pending_child_email"):
        raise HTTPException(
            400,
            f"You already have a pending request for {parent['pending_child_email']}. "
            "Wait for approval before linking another child.",
        )

    ok, detail, info = redeem_invite(
        plain_code=body.code,
        parent_email=current["email"],
        parent_name=parent.get("name") or "Parent",
        relationship=relationship,
    )
    if not ok:
        raise HTTPException(400, detail)

    if info and info.get("child_email") == current["email"]:
        # Should never happen (same email can't be both roles), but guard linking.
        raise HTTPException(
            400,
            "Parent and child cannot use the same email address.",
        )

    # Keep existing children[]; only set pending fields
    update_parent(
        current["email"],
        link_status="pending",
        pending_child_email=info["child_email"],
        pending_invite_id=info["invite_id"],
    )

    child_email = info["child_email"]
    child_user = load_users().get(child_email) or {}
    emailed = False
    email_detail = None
    sent_ok, sent_detail = _notify_child_parent_link_request(
        child_email=child_email,
        child_name=str(child_user.get("name") or "there"),
        parent_name=str(info.get("parent_name") or parent.get("name") or "Parent"),
        parent_email=current["email"],
        approve_token=str(info["approve_token"]),
    )
    emailed = sent_ok
    email_detail = (
        f"Approval email sent to {child_email}."
        if sent_ok
        else (sent_detail or "Could not email the student — they can still Approve in Settings → Family.")
    )

    return {
        "ok": True,
        "detail": (
            f"Request sent to your child's email ({child_email}). "
            "Ask them to Approve from that email (or Settings → Family)."
        ),
        "pending_child_email": child_email,
        "invite_id": info["invite_id"],
        "child_notified": emailed,
        "child_notify_detail": email_detail,
        "parent": parent_strip_pw(get_parent(current["email"])),
    }


@app.get("/api/auth/parent/link-status")
def parent_link_status(current=Depends(get_current_parent)):
    p = current["parent"]
    children = get_parent_children(current["email"])
    return {
        "link_status": p.get("link_status") or ("linked" if children else "none"),
        "relationship": p.get("relationship"),
        "child_email": p.get("child_email"),
        "children": children,
        "pending_child_email": p.get("pending_child_email"),
        "pending_invite_id": p.get("pending_invite_id"),
    }


def _parent_resolve_child_email(parent: dict, child_email: Optional[str]) -> str:
    """Ensure the parent is linked to the requested child (or the only child)."""
    linked = [
        (c.get("email") or "").strip().lower()
        for c in (parent.get("children") or [])
        if isinstance(c, dict) and c.get("email")
    ]
    # Legacy fallback
    if not linked and parent.get("child_email"):
        linked = [parent["child_email"].strip().lower()]

    if not linked:
        raise HTTPException(
            404,
            "No linked child yet. Enter a Family Invitation Code from your child.",
        )

    if child_email:
        target = child_email.strip().lower()
        if target not in linked:
            raise HTTPException(403, "You are not linked to this child.")
        return target

    if len(linked) == 1:
        return linked[0]

    raise HTTPException(
        400,
        "Multiple children linked. Select a child (pass child_email).",
    )


@app.get("/api/parent/children")
def parent_children_list(current=Depends(get_current_parent)):
    """List all children linked to this parent (for selection screen)."""
    parent = current["parent"]
    users = load_users()
    items = []
    for c in get_parent_children(current["email"]):
        email = c.get("email")
        if not email:
            continue
        child = users.get(email) or {}
        items.append({
            "email": email,
            "name": child.get("name") or email.split("@")[0],
            "grade": child.get("grade"),
            "stars": child.get("stars", 0),
            "avatar": child.get("avatar"),
            "relationship": c.get("relationship") or parent.get("relationship") or "father",
            "linked_at": c.get("linked_at"),
            "exists": bool(child),
        })
    # Drop orphans (child deleted but somehow still listed)
    items = [i for i in items if i["exists"]]
    return {
        "relationship": parent.get("relationship"),
        "pending_child_email": parent.get("pending_child_email"),
        "pending_invite_id": parent.get("pending_invite_id"),
        "link_status": parent.get("link_status"),
        "children": items,
        "count": len(items),
    }


# ── Parent dashboard data ─────────────────────────────────────────────────────

@app.get("/api/parent/dashboard")
def parent_dashboard(
    child_email: Optional[str] = None,
    current=Depends(get_current_parent),
):
    """Return enriched child analytics for the selected linked child."""
    parent = current["parent"]
    linked = get_parent_children(current["email"])
    if not linked and parent.get("pending_child_email"):
        raise HTTPException(
            409,
            "Waiting for your child to Approve via their email (or Settings → Family).",
        )

    child_email = _parent_resolve_child_email(parent, child_email)

    users = load_users()
    child = users.get(child_email)
    if not child:
        # Stale link — scrub from parent
        remove_linked_child(current["email"], child_email)
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

    rel = parent.get("relationship") or "father"
    for c in linked:
        if c.get("email") == child_email:
            rel = c.get("relationship") or rel
            break

    return {
        "child": {
            "name":  child.get("name"),
            "grade": child.get("grade"),
            "stars": child.get("stars", 0),
            "email": child_email,
            "avatar": child.get("avatar"),
        },
        "relationship": rel,
        "children_count": len(linked),
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
async def parent_report(
    child_email: Optional[str] = None,
    current=Depends(get_current_parent),
):
    """Generate an AI progress report for the selected linked child."""
    parent = current["parent"]
    child_email = _parent_resolve_child_email(parent, child_email)

    users = load_users()
    child = users.get(child_email)
    if not child:
        remove_linked_child(current["email"], child_email)
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


VALID_AVATARS = {f"avatar_{i}" for i in range(1, 13)}


class AvatarUpdateReq(BaseModel):
    avatar: str


@app.patch("/api/users/me/avatar")
def update_my_avatar(body: AvatarUpdateReq, current=Depends(get_current_user)):
    """
    Part B #2 — Avatar-based profile pictures. Students pick a friendly
    illustrated avatar instead of uploading a real photo; changeable anytime
    from Settings → Profile.
    """
    if body.avatar not in VALID_AVATARS:
        raise HTTPException(400, "Unknown avatar id.")
    email = current["email"]
    users = load_users()
    user = users.get(email)
    if not user:
        raise HTTPException(404, "User not found.")
    user["avatar"] = body.avatar
    users[email] = user
    save_users(users)
    return _strip_password(user)


class ChangeEmailReq(BaseModel):
    new_email: str
    password: str


class VerifyEmailChangeReq(BaseModel):
    new_email: str
    code: str


@app.post("/api/users/me/email/request")
def request_my_email_change(body: ChangeEmailReq, current=Depends(get_current_user)):
    """Send OTP to the *new* email before applying a student email change."""
    old_email = current["email"]
    new_email = body.new_email.strip().lower()
    if "@" not in new_email or "." not in new_email.split("@")[-1]:
        raise HTTPException(400, "Please enter a valid email address.")

    users = load_users()
    user = users.get(old_email)
    if not user:
        raise HTTPException(404, "User not found.")
    if not verify_password(body.password, user.get("password", "")):
        raise HTTPException(400, "Password is incorrect.")
    if new_email == old_email:
        raise HTTPException(400, "That is already your current email.")
    if new_email in users:
        raise HTTPException(400, "An account with this email already exists.")
    if parent_exists(new_email):
        raise HTTPException(
            400,
            "This email is already used by a parent account. "
            "Parent and child must use different emails.",
        )

    sent = create_and_send_otp(
        role="child",
        email=new_email,
        purpose="email_change",
        meta={"old_email": old_email},
    )
    if not sent.get("ok"):
        raise _otp_send_http_error(sent)
    return {
        "ok": True,
        "email": new_email,
        "detail": sent.get("detail", "Verification code sent to your new email."),
        "expires_in_sec": sent.get("expires_in_sec"),
        "retry_after_sec": sent.get("retry_after_sec"),
        "dev_mode": bool(sent.get("dev_mode")),
        "dev_otp": sent.get("dev_otp"),
    }


@app.post("/api/users/me/email/verify")
def verify_my_email_change(body: VerifyEmailChangeReq, current=Depends(get_current_user)):
    """Confirm OTP on the new email, then migrate the student account."""
    from utils.user_cleanup import change_student_email

    old_email = current["email"]
    new_email = body.new_email.strip().lower()
    ok, detail, meta = verify_otp(
        role="child",
        email=new_email,
        code=body.code,
        expected_purpose="email_change",
    )
    if not ok:
        raise HTTPException(400, detail)
    if (meta or {}).get("old_email") != old_email:
        raise HTTPException(400, "This code was not issued for your account. Request a new one.")
    if new_email in load_users():
        raise HTTPException(400, "An account with this email already exists.")
    if parent_exists(new_email):
        raise HTTPException(
            400,
            "This email is already used by a parent account. "
            "Parent and child must use different emails.",
        )

    if not change_student_email(old_email, new_email, current_token=current["token"]):
        raise HTTPException(404, "User not found.")

    updated = load_users()[new_email]
    return {
        "ok": True,
        "user": _strip_password(updated),
        "detail": "Email updated and verified.",
    }


@app.post("/api/users/me/email")
def change_my_email_legacy(body: ChangeEmailReq, current=Depends(get_current_user)):
    """Legacy: starts OTP verification for the new email (same as /email/request)."""
    return request_my_email_change(body, current)


@app.post("/api/auth/parent/email/request")
def parent_request_email_change(body: ChangeEmailReq, current=Depends(get_current_parent)):
    """Send OTP to parent's new email. After verify, family link is cleared (must re-link)."""
    old_email = current["email"]
    new_email = body.new_email.strip().lower()
    if "@" not in new_email or "." not in new_email.split("@")[-1]:
        raise HTTPException(400, "Please enter a valid email address.")

    parent = get_parent(old_email)
    if not parent:
        raise HTTPException(404, "Parent account not found.")
    if not verify_password(body.password, parent.get("password", "")):
        raise HTTPException(400, "Password is incorrect.")
    if new_email == old_email:
        raise HTTPException(400, "That is already your current email.")
    if parent_exists(new_email):
        raise HTTPException(400, "An account with this email already exists.")
    if new_email in load_users():
        raise HTTPException(
            400,
            "This email is already used by a student account. "
            "Parent and child must use different emails.",
        )

    sent = create_and_send_otp(
        role="parent",
        email=new_email,
        purpose="email_change",
        meta={"old_email": old_email},
    )
    if not sent.get("ok"):
        raise _otp_send_http_error(sent)
    return {
        "ok": True,
        "email": new_email,
        "detail": (
            sent.get("detail", "Verification code sent.")
            + " After you confirm, you'll need to link your child again."
        ),
        "expires_in_sec": sent.get("expires_in_sec"),
        "retry_after_sec": sent.get("retry_after_sec"),
        "dev_mode": bool(sent.get("dev_mode")),
        "dev_otp": sent.get("dev_otp"),
        "will_unlink": True,
    }


@app.post("/api/auth/parent/email/verify")
def parent_verify_email_change(body: VerifyEmailChangeReq, current=Depends(get_current_parent)):
    from utils.user_cleanup import change_parent_email

    old_email = current["email"]
    new_email = body.new_email.strip().lower()
    ok, detail, meta = verify_otp(
        role="parent",
        email=new_email,
        code=body.code,
        expected_purpose="email_change",
    )
    if not ok:
        raise HTTPException(400, detail)
    if (meta or {}).get("old_email") != old_email:
        raise HTTPException(400, "This code was not issued for your account. Request a new one.")
    if parent_exists(new_email):
        raise HTTPException(400, "An account with this email already exists.")
    if new_email in load_users():
        raise HTTPException(
            400,
            "This email is already used by a student account. "
            "Parent and child must use different emails.",
        )

    if not change_parent_email(old_email, new_email, current_token=current["token"]):
        raise HTTPException(400, "Could not update parent email.")

    updated = get_parent(new_email)
    return {
        "ok": True,
        "user": parent_strip_pw(updated),
        "detail": "Email updated. Your child link was cleared — enter a new Family Invitation Code to re-link.",
        "needs_relink": True,
    }


class ChangeGradeReq(BaseModel):
    grade: int


@app.patch("/api/users/me/grade")
def change_my_grade(body: ChangeGradeReq, current=Depends(get_current_user)):
    """Part B #8 — let a student update their grade/class from Settings."""
    if body.grade not in GRADE_SUBJECTS:
        raise HTTPException(400, "Grade must be between 4 and 7.")

    email = current["email"]
    users = load_users()
    user = users.get(email)
    if not user:
        raise HTTPException(404, "User not found.")
    user["grade"] = body.grade
    users[email] = user
    save_users(users)

    sessions = load_sessions()
    if current["token"] in sessions and isinstance(sessions[current["token"]].get("user_data"), dict):
        sessions[current["token"]]["user_data"]["grade"] = body.grade
        save_sessions(sessions)

    return _strip_password(user)


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


def _dashboard_bundle(email: str) -> dict:
    """Part B #9 — enriched dashboard: time, lessons, mood, schedule, journey."""
    analytics = get_user_analytics(email)
    daily = analytics.get("daily_activity") or []
    today_s = date.today().isoformat()
    week_cutoff = (date.today() - timedelta(days=6)).isoformat()

    time_today = 0.0
    time_week = 0.0
    for day in daily:
        t = float(day.get("time") or 0)
        d = day.get("date") or ""
        if d == today_s:
            time_today = t
        if d >= week_cutoff:
            time_week += t

    chats = get_user_chats(email)
    lessons_covered = len(chats)
    lessons_today = sum(
        1 for c in chats if (c.get("timestamp") or "")[:10] == today_s
    )

    quiz_dates = {
        d["date"]
        for d in daily
        if d.get("date") and (d.get("questions") or 0) > 0
    }
    chat_dates = {
        (c.get("timestamp") or "")[:10]
        for c in chats
        if c.get("timestamp")
    }
    chat_dates.discard("")
    active_days = merge_activity_dates(email, quiz_dates, chat_dates)
    journey = compute_journey(active_days)

    return {
        "time": {
            "today_minutes": round(time_today, 1),
            "week_minutes": round(time_week, 1),
            "total_minutes": analytics.get("total_time_minutes", 0),
        },
        "lessons": {
            "covered": lessons_covered,
            "today": lessons_today,
        },
        "mood_today": get_mood_today(email),
        "schedule": get_schedule_for_day(email, today_s),
        "journey": journey,
        "valid_moods": sorted(VALID_MOODS),
    }


@app.get("/api/users/me/dashboard")
def my_dashboard(current=Depends(get_current_user)):
    """Part B #9 — Dashboard enhancements payload."""
    return _dashboard_bundle(current["email"])


class MoodReq(BaseModel):
    mood: str


@app.post("/api/users/me/mood")
def post_mood(body: MoodReq, current=Depends(get_current_user)):
    """Self-reported mood check-in at the start of a learning session."""
    try:
        result = save_mood(current["email"], body.mood)
    except ValueError as err:
        raise HTTPException(400, str(err)) from err
    return {**result, "dashboard": _dashboard_bundle(current["email"])}


class ScheduleItemIn(BaseModel):
    id: Optional[str] = None
    title: str
    subject: Optional[str] = None
    done: bool = False


class SchedulePutReq(BaseModel):
    items: list[ScheduleItemIn]


@app.get("/api/users/me/schedule")
def get_schedule(current=Depends(get_current_user)):
    return {"date": date.today().isoformat(), "items": get_schedule_for_day(current["email"])}


@app.put("/api/users/me/schedule")
def put_schedule(body: SchedulePutReq, current=Depends(get_current_user)):
    items = set_schedule_for_day(
        current["email"],
        [i.model_dump() for i in body.items],
    )
    return {"date": date.today().isoformat(), "items": items}


@app.post("/api/users/me/schedule/{item_id}/toggle")
def post_toggle_schedule(item_id: str, current=Depends(get_current_user)):
    items = toggle_schedule_item(current["email"], item_id)
    return {"date": date.today().isoformat(), "items": items}


class LearnerProfileReq(BaseModel):
    learning_style: str        # "visual" | "audio" | "text" | "mixed"
    preferred_language: str    # "en" | "ur"
    audio_preference: str      # "auto" | "manual"
    sensory_preference: str    # "calm" | "standard"
    explanation_style: str     # "step_by_step" | "concise"


@app.get("/api/profile/learning")
def get_my_learner_profile(current=Depends(get_current_user)):
    """One-time onboarding profile. Frontend uses `onboarding_completed` to
    decide whether to show the onboarding wizard after signup/login."""
    return get_learner_profile(current["email"])


@app.post("/api/profile/learning")
def set_my_learner_profile(body: LearnerProfileReq, current=Depends(get_current_user)):
    """Save the student's one-time learning-preference answers. This becomes
    part of the persistent Learner Profile the Media Agent reads before every
    teaching decision (see utils/agent_memory.get_memory_context)."""
    return save_learner_profile(
        current["email"],
        learning_style=body.learning_style,
        preferred_language=body.preferred_language,
        audio_preference=body.audio_preference,
        sensory_preference=body.sensory_preference,
        explanation_style=body.explanation_style,
    )


class AudioPreferencePatch(BaseModel):
    audio_preference: str  # "auto" | "manual"


@app.patch("/api/profile/learning/audio")
def patch_audio_preference(body: AudioPreferencePatch, current=Depends(get_current_user)):
    """Gap 6 — update narration auto/manual without re-submitting full onboarding."""
    return update_audio_preference(current["email"], body.audio_preference)


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
    raw_relevant = reply_result.get("is_relevant")
    is_relevant = bool(raw_relevant) if raw_relevant is not None else False

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
async def generate_chat_image(
    chat_id: str,
    req: VisualAidReq = VisualAidReq(),
    current=Depends(get_current_user),
):
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

    stub = (req.stub_message or "").strip()
    if stub:
        save_message(current["email"], chat_id, "assistant", stub)
        session = get_chat_session(current["email"], chat_id) or session
        messages = session.get("messages", [])

    try:
        aid = await run_in_thread(
            tutor_generate_visual_aid,
            user_message=last_user_msg["content"],
            grade=session.get("grade", current["user"].get("grade", 4)),
            subject=session.get("subject", "General"),
            history=messages,
            language=session.get("language", "en"),
        )
    except Exception as err:
        print(f"[api] generate_chat_image failed: {err}")
        raise HTTPException(502, "Visual aid generation failed. Please try again.") from err

    if not aid:
        raise HTTPException(502, "Visual aid generation failed. Please try again.")

    from utils.visual_aids import last_assistant_index, substantive_assistant_index

    messages = session.get("messages", [])
    if (req.attach_to or "substantive").strip().lower() == "last":
        target_index = last_assistant_index(messages)
    else:
        target_index = substantive_assistant_index(messages)

    # Attach visual aid to the chosen assistant bubble, not always the main answer.
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

    voice = req.voice if req.voice in VALID_TTS_VOICES else None
    audio_b64 = await run_in_thread(
        tutor_generate_speech, text=text, language=req.language or "en", voice=voice
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
    "SIMPLE_TEXT_ONLY": (
        "The student wants a SIMPLE TEXT explanation of the PREVIOUS tutor answer.\n"
        "Write ONLY 3–6 short, easy sentences in one short paragraph.\n"
        "Do NOT use numbered steps, bullet lists, arrow flowcharts (→), "
        "or lines like 'Step 1'. No 'Let's break this down' headers."
    ),
    "SHOW_VISUAL_EXPLANATION": (
        "Say ONE short friendly sentence introducing a picture that will appear next. "
        "Example: 'Here's a picture to help! 🎨' Do NOT write ASCII art or long text."
    ),
    "SHOW_FLOWCHART_STEPS": (
        "The student did NOT understand the PREVIOUS tutor answer. "
        "Do NOT repeat the same long paragraph. Re-teach ONLY that answer in simpler words.\n\n"
        "Required structure (follow exactly):\n"
        "1) Opening (1 sentence): warm, e.g. 'Let's break this down simply! 🪜'\n"
        "2) Simple explanation: 3–4 very short sentences using easy words (max 12 words each).\n"
        "3) Concept flowcharts — 2–4 lines using REAL words from the topic, NOT generic labels:\n"
        "   Each line: Word → next idea → next idea (add 1 emoji at the end)\n"
        "   Example for AI:\n"
        "   🤖 AI → computer system → thinks & learns → like a human\n"
        "   ✨ AI → helps people → with daily tasks\n"
        "   NEVER write 'Step 1 → Step 2 → Step 3' — use the actual concepts.\n"
        "4) Emoji example (2 lines): pick ONE concrete example FROM the previous answer "
        "and show how it works, e.g.:\n"
        "   🎶 AI suggests songs you might like based on what you've listened to!\n"
        "   📚 AI can help you find information quickly!\n\n"
        "Rules: stay on the SAME topic as the original question; no quiz questions; "
        "no long bullet lists; emojis encouraged."
    ),
    "STEP_BY_STEP_ONLY": (
        "The student wants a STEP-BY-STEP explanation of the PREVIOUS tutor answer.\n"
        "Do NOT write a summary paragraph. Do NOT repeat the full simple-text answer.\n\n"
        "Required structure (follow exactly):\n"
        "1) Opening (1 sentence): warm, e.g. 'Let's break this down simply! 🪜'\n"
        "2) Concept flowcharts — 2–4 lines using REAL words from the topic:\n"
        "   Each line: Word → next idea → next idea (add 1 emoji at the end)\n"
        "   NEVER write 'Step 1 → Step 2 → Step 3' — use the actual concepts.\n"
        "3) Emoji example (2 lines) from the topic.\n\n"
        "Rules: steps/flow lines ONLY — no plain paragraph before the arrows."
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
    Adaptive agent content generation.

    The local comprehension engine (running in the browser: camera signals +
    ComprehensionStateMachine) already decided WHAT action to take. This
    endpoint used to generate content from the action alone — meaning the
    Media Agent's real-time signal was never actually combined with what we
    know about THIS student (Gap: "Media Agent is Isolated"). It now pulls
    the same persistent Learner Profile + history (utils/agent_memory) that
    the ReAct Media Agent uses, so the real-time decision and the student's
    long-term profile are combined into one personalized response — instead
    of the real-time signal being the only input.

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

    try:
        memory_context = get_memory_context(current["email"], body.subject)
    except Exception:
        memory_context = ""

    system = (
        "You are a warm, patient AI tutor for autistic children aged 8–12. "
        "Never say 'you look confused' or label the student's feelings. "
        "Be supportive, use simple language, emojis are encouraged. "
        "Always stay on the student's original question and current subject. "
        "When asked for brevity, obey strictly — shorter is better.\n\n"
        f"{memory_context}\n"
        "Use this student's known profile and history above to shape HOW you explain — "
        "e.g. lean on their preferred modality/language, avoid strategies that already "
        "failed for them, and match the explanation style they told us they prefer."
    )
    user_msg = f"{subject_ctx}\n\n{action_prompt}\n\n{question_ctx}\n{answer_ctx}".strip()

    def _gen():
        from openai import OpenAI
        client = OpenAI()
        max_tokens = 350 if action in ("SHOW_FLOWCHART_STEPS", "STEP_BY_STEP_ONLY") else (200 if action in ("SIMPLIFY_EXPLANATION", "SIMPLE_TEXT_ONLY") else 80)
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
    mode: str = "default"  # "default" | "teaching" | "appreciation" | "revision"
    activity: str = "one_question"  # revision only: one_question | matching | step_recap | fill_blank


@app.get("/api/agent/revision-check")
async def agent_revision_check(
    subject: str,
    topic: str = "",
    current=Depends(get_current_user),
):
    """
    Gap 5 — Adaptive Revision: should we offer a revision activity for this
    topic/subject? Returns needed=False when memory shows no struggle signals
    (doc: skip revision and proceed normally).
    """
    result = await run_in_thread(
        evaluate_revision_need,
        current["email"],
        subject,
        topic,
    )
    return result


@app.post("/api/agent/step-mcqs")
async def agent_step_mcqs(body: StepMcqsRequest, current=Depends(get_current_user)):
    """Easy step-by-step MCQs — recall check or teaching ladder with hints."""
    subject_ctx = _subject_guard(body.subject)
    memory_ctx = ""
    try:
        memory_ctx = get_memory_context(current["email"], body.subject)
    except Exception:
        pass

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
    elif body.mode == "revision":
        activity = body.activity if body.activity in REVISION_ACTIVITIES else "one_question"
        mem_block = f"\n\nStudent memory (use to tailor difficulty, NOT to ask about old sessions):\n{memory_ctx}\n" if memory_ctx else ""
        activity_specs = {
            "one_question": (
                "Create exactly 1 VERY EASY quiz question about the CURRENT topic only "
                "(the student's question below). Do NOT ask 'do you remember last time'. "
                "Max 12 words per question, max 6 words per option."
            ),
            "matching": (
                "Create 2 VERY EASY matching-style MCQs about the CURRENT topic. "
                "Each question pairs two related ideas (e.g. term → meaning). "
                "Max 12 words per question, max 6 words per option."
            ),
            "step_recap": (
                "Create 2 to 3 VERY EASY step-by-step recap MCQs about the CURRENT topic only, "
                "one small step at a time. Max 14 words per question, max 7 words per option."
            ),
            "fill_blank": (
                "Create 1 to 2 VERY EASY fill-in-the-blank style MCQs about the CURRENT topic. "
                "Use '___' in the question text. Max 14 words per question, max 6 words per option."
            ),
        }
        user_msg = (
            f"{subject_ctx}{mem_block}\n\n"
            f"Student question (CURRENT topic): {body.last_question}\n"
            f"Tutor answer summary: {body.last_answer[:800]}\n\n"
            f"Revision activity type: {activity}\n"
            f"{activity_specs[activity]}\n"
            "wrong_hint: 2 short kind hint lines. "
            'Return ONLY valid JSON: '
            '{"questions":[{"step_label":"Quick check","question":"...","options":["A","B","C"],"correct_index":0,"wrong_hint":"Nice try!\\nLook at the answer above."}]}'
        )
        system_msg = (
            "You create adaptive revision quizzes for children aged 8–12. "
            "Only quiz the CURRENT question topic — never generic 'what did you study last session'. "
            "Output JSON only."
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
    adaptation: str  # step_by_step | read_aloud | image | mcq_recall | breathing | simple_text
    via: str = "popup_yes"
    happy_cv: bool = False
    expression: str | None = None  # Media Agent's dominant CV label at feedback time


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
        expression=body.expression,
    )
    order = await run_in_thread(
        get_adaptation_ladder_order,
        current["email"],
        body.subject,
    )
    preferred_modality = await run_in_thread(
        get_current_preferred_modality,
        current["email"],
        body.subject,
    )
    return {"ok": True, "ladder_order": order, "preferred_modality": preferred_modality}


class RecordAdaptationFailureRequest(BaseModel):
    subject: str
    adaptation: str  # step_by_step | read_aloud | image | mcq_recall | breathing | simple_text
    expression: str | None = None  # Media Agent's dominant CV label at feedback time


@app.post("/api/agent/record-adaptation-failure")
async def agent_record_adaptation_failure(
    body: RecordAdaptationFailureRequest,
    current=Depends(get_current_user),
):
    """
    Save that a help step was shown but did NOT resolve the student's confusion
    (they moved past it on the ladder). Gap #5 — "No Learning From Feedback":
    without this, the system only ever remembered what worked, so a strategy
    that consistently failed for a student kept getting tried again.
    """
    await run_in_thread(
        record_adaptation_failure,
        current["email"],
        body.subject,
        body.adaptation,
        expression=body.expression,
    )
    order = await run_in_thread(
        get_adaptation_ladder_order,
        current["email"],
        body.subject,
    )
    preferred_modality = await run_in_thread(
        get_current_preferred_modality,
        current["email"],
        body.subject,
    )
    return {"ok": True, "ladder_order": order, "preferred_modality": preferred_modality}


@app.get("/api/agent/adaptation-ladder")
async def agent_adaptation_ladder(subject: str, current=Depends(get_current_user)):
    """Personalized help-ladder order for this student + subject."""
    from utils.agent_memory import get_current_preferred_modality

    order = await run_in_thread(
        get_adaptation_ladder_order,
        current["email"],
        subject,
    )
    preferred_modality = await run_in_thread(
        get_current_preferred_modality,
        current["email"],
        subject,
    )
    return {"ladder_order": order, "preferred_modality": preferred_modality}


@app.get("/api/agent/memory")
async def agent_memory(current=Depends(get_current_user)):
    """Return the agent's memory summary for this student (for parent dashboard)."""
    summary = await run_in_thread(get_memory_summary, current["email"])
    return summary
