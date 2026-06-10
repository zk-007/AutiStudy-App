"""
Bearer-token session store for the AutiStudy REST API.
Persists sessions in data/sessions.json (shared with the React frontend).
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Dict, Optional

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
SESSIONS_FILE = str(_PROJECT_ROOT / "data" / "sessions.json")


def generate_session_token(email: str) -> str:
    """Generate a unique session token."""
    timestamp = str(time.time())
    token_string = f"{email}:{timestamp}"
    return hashlib.sha256(token_string.encode()).hexdigest()[:32]


def load_sessions() -> Dict:
    """Load all sessions from file."""
    if os.path.exists(SESSIONS_FILE):
        try:
            with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_sessions(sessions: Dict) -> None:
    """Save sessions to file."""
    os.makedirs(os.path.dirname(SESSIONS_FILE), exist_ok=True)
    with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(sessions, f, indent=2)


def create_session(
    email: str,
    user_data: Dict,
    current_page: str = "dashboard",
    language: str = "en",
) -> str:
    """Create a new session and return the bearer token."""
    sessions = load_sessions()
    token = generate_session_token(email)

    sessions[token] = {
        "email": email,
        "user_data": user_data,
        "created_at": time.time(),
        "current_page": current_page,
        "language": language,
    }

    save_sessions(sessions)
    return token


def update_session_page(token: str, page: str) -> None:
    """Update the current page in session."""
    if not token:
        return
    sessions = load_sessions()
    if token in sessions:
        sessions[token]["current_page"] = page
        save_sessions(sessions)


def update_session_language(token: str, language: str) -> None:
    """Update the language in session."""
    if not token:
        return
    sessions = load_sessions()
    if token in sessions:
        sessions[token]["language"] = language
        save_sessions(sessions)


def get_session(token: str) -> Optional[Dict]:
    """Get session data by token."""
    if not token:
        return None

    sessions = load_sessions()
    session = sessions.get(token)

    if session:
        if time.time() - session.get("created_at", 0) < 7 * 24 * 60 * 60:
            return session
        delete_session(token)

    return None


def delete_session(token: str) -> None:
    """Delete a session."""
    sessions = load_sessions()
    if token in sessions:
        del sessions[token]
        save_sessions(sessions)
