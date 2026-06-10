"""
utils/parent_db.py
==================
CRUD helpers for parent accounts stored in data/parents.json.

Schema of one parent record:
{
  "email": "parent@example.com",
  "name": "Ahmed Khan",
  "password": "<sha256 hash>",
  "cnic": "12345-6789012-3",
  "child_email": "child@example.com",   # null until verified
  "verified": true
}
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Optional

_PARENTS_FILE = Path(__file__).parent.parent / "data" / "parents.json"
_lock = threading.Lock()


def _load() -> dict:
    if not _PARENTS_FILE.exists():
        return {}
    try:
        return json.loads(_PARENTS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save(data: dict) -> None:
    _PARENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    _PARENTS_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ── Public API ────────────────────────────────────────────────────────────────

def load_parents() -> dict:
    with _lock:
        return _load()


def save_parents(data: dict) -> None:
    with _lock:
        _save(data)


def get_parent(email: str) -> Optional[dict]:
    return load_parents().get(email.strip().lower())


def parent_exists(email: str) -> bool:
    return get_parent(email) is not None


def create_parent(
    email: str,
    name: str,
    password_hash: str,
    cnic: str,
    child_email: Optional[str],
    verified: bool,
) -> dict:
    parents = load_parents()
    record = {
        "email": email,
        "name": name,
        "password": password_hash,
        "cnic": cnic,
        "child_email": child_email,
        "verified": verified,
        "role": "parent",
    }
    parents[email] = record
    save_parents(parents)
    return record


def strip_password(parent: dict) -> dict:
    safe = {**parent}
    safe.pop("password", None)
    return safe
