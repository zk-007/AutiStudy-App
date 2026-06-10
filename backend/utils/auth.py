"""
User authentication utilities for the AutiStudy REST API.
Password hashing, user JSON store — no Streamlit dependency.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
USERS_FILE = str(_PROJECT_ROOT / "data" / "users.json")


def hash_password(password: str) -> str:
    """Hash with bcrypt (salted, slow — proper password storage)."""
    import bcrypt

    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _sha256(password: str) -> str:
    """Legacy SHA-256 used by old accounts — only for migration check."""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(plain: str, stored: str) -> bool:
    """
    Verify password against stored hash.
    Supports both bcrypt (new) and SHA-256 (legacy migration).
    """
    import bcrypt

    if stored.startswith("$2b$") or stored.startswith("$2a$"):
        return bcrypt.checkpw(plain.encode("utf-8"), stored.encode("utf-8"))
    return _sha256(plain) == stored


def migrate_password_if_needed(email: str, plain: str, users: dict) -> None:
    """
    If the stored password is still SHA-256, upgrade it to bcrypt silently
    on next successful login. Call this AFTER verify_password returns True.
    """
    stored = users.get(email, {}).get("password", "")
    if not (stored.startswith("$2b$") or stored.startswith("$2a$")):
        users[email]["password"] = hash_password(plain)
        save_users(users)


def load_users() -> dict:
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_users(users: dict) -> None:
    os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)


def register_user(name, email, password, role, grade):
    """Register a user (used by scripts; REST API has its own register endpoint)."""
    users = load_users()
    if email in users:
        return False, "Email already registered"

    users[email] = {
        "name": name,
        "email": email,
        "password": hash_password(password),
        "role": role,
        "grade": grade,
        "stars": 0,
        "badges": [],
        "progress": {},
    }
    save_users(users)
    return True, "Registration successful"
