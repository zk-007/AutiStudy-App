"""
API key / secret loading for the FastAPI backend (no Streamlit).
================================================================
Reads from (in order):
  1. Environment variables
  2. backend/config/secrets.toml
  3. backend/.streamlit/secrets.toml  (legacy path, kept for migration)
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


def secrets_toml_paths() -> list[Path]:
    """Candidate secrets.toml locations, newest convention first."""
    return [
        _BACKEND_ROOT / "config" / "secrets.toml",
        _BACKEND_ROOT / ".streamlit" / "secrets.toml",
    ]


def load_secrets_toml() -> dict[str, Any]:
    for path in secrets_toml_paths():
        if not path.exists():
            continue
        try:
            import toml

            return toml.load(path)
        except Exception:
            continue
    return {}


def get_secret(key: str, default: str = "") -> str:
    val = os.getenv(key, "")
    if val:
        return val
    return str(load_secrets_toml().get(key, default) or default)
