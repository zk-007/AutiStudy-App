"""
Part B #6 — Contact form storage.

Messages are appended to data/contact_messages.json so the team can review
them later. Real email delivery can be wired on top of this later without
changing the API shape.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

CONTACT_FILE = Path("data/contact_messages.json")
MAX_MESSAGES = 2000


def _load() -> List[Dict[str, Any]]:
    if not CONTACT_FILE.exists():
        return []
    try:
        data = json.loads(CONTACT_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save(messages: List[Dict[str, Any]]) -> None:
    CONTACT_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONTACT_FILE.write_text(
        json.dumps(messages[-MAX_MESSAGES:], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def save_contact_message(
    *,
    name: str,
    email: str,
    role: str,
    subject: str,
    message: str,
    email_sent: bool = False,
    emailed_to: str | None = None,
) -> Dict[str, Any]:
    entry = {
        "id": str(uuid.uuid4())[:10],
        "timestamp": datetime.now().isoformat(),
        "name": name,
        "email": email,
        "role": role,
        "subject": subject,
        "message": message,
        "status": "new",
        "email_sent": bool(email_sent),
        "emailed_to": emailed_to,
    }
    messages = _load()
    messages.append(entry)
    _save(messages)
    return entry
