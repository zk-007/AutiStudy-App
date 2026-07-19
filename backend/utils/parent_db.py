"""
utils/parent_db.py
==================
CRUD helpers for parent accounts stored in data/parents.json.

V6 schema (multi-child + Father/Mother designation):
{
  "email": "parent@example.com",
  "name": "Ahmed Khan",
  "password": "<hash>",
  "email_verified": true,
  "relationship": "father" | "mother",
  "children": [
    {
      "email": "child@…",
      "linked_at": "…",
      "invite_id": "…",
      "relationship": "father"
    }
  ],
  "child_email": null | "child@…",   # denormalized primary (first linked)
  "link_status": "none" | "pending" | "linked",
  "pending_child_email": null | "child@…",
  "pending_invite_id": null | "…",
  "role": "parent"
}
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

_PARENTS_FILE = Path(__file__).parent.parent / "data" / "parents.json"
_lock = threading.Lock()

VALID_RELATIONSHIPS = frozenset({"father", "mother"})


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


def load_parents() -> dict:
    with _lock:
        return _load()


def save_parents(data: dict) -> None:
    with _lock:
        _save(data)


def normalize_relationship(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    val = str(raw).strip().lower()
    if val in VALID_RELATIONSHIPS:
        return val
    return None


def _migrate_record(rec: dict) -> dict:
    """Ensure children[] + relationship exist; keep child_email in sync."""
    rel = normalize_relationship(rec.get("relationship"))
    if not rel:
        # Legacy accounts: default Father so existing links keep working.
        rel = "father"
        rec["relationship"] = rel

    children = rec.get("children")
    if not isinstance(children, list):
        children = []

    # Promote legacy singular child_email into children[]
    legacy = (rec.get("child_email") or "").strip().lower() or None
    emails = {
        (c.get("email") or "").strip().lower()
        for c in children
        if isinstance(c, dict) and c.get("email")
    }
    if legacy and legacy not in emails:
        children.append({
            "email": legacy,
            "linked_at": rec.get("linked_at"),
            "invite_id": rec.get("linked_invite_id"),
            "relationship": rel,
        })

    # Normalize child entries
    cleaned: List[Dict[str, Any]] = []
    seen = set()
    for c in children:
        if not isinstance(c, dict):
            continue
        em = (c.get("email") or "").strip().lower()
        if not em or em in seen:
            continue
        seen.add(em)
        cleaned.append({
            "email": em,
            "linked_at": c.get("linked_at"),
            "invite_id": c.get("invite_id"),
            "relationship": normalize_relationship(c.get("relationship")) or rel,
        })

    rec["children"] = cleaned
    rec["relationship"] = rel
    rec["child_email"] = cleaned[0]["email"] if cleaned else None

    pending = (rec.get("pending_child_email") or "").strip().lower() or None
    if pending:
        rec["link_status"] = "pending"
        rec["pending_child_email"] = pending
    elif cleaned:
        rec["link_status"] = "linked"
        rec["pending_child_email"] = None
        rec["pending_invite_id"] = None
    else:
        rec["link_status"] = "none"
        rec["pending_child_email"] = None
        rec["pending_invite_id"] = None

    rec["verified"] = bool(cleaned)
    return rec


def get_parent(email: str) -> Optional[dict]:
    key = email.strip().lower()
    with _lock:
        data = _load()
        rec = data.get(key)
        if not rec:
            return None
        migrated = _migrate_record(dict(rec))
        if migrated != rec:
            data[key] = migrated
            _save(data)
        return migrated


def parent_exists(email: str) -> bool:
    return get_parent(email) is not None


def create_parent(
    email: str,
    name: str,
    password_hash: str,
    *,
    email_verified: bool = False,
    relationship: str = "father",
    child_email: Optional[str] = None,
    link_status: str = "none",
    pending_child_email: Optional[str] = None,
    pending_invite_id: Optional[str] = None,
    cnic: Optional[str] = None,
) -> dict:
    parents = load_parents()
    rel = normalize_relationship(relationship) or "father"
    children: List[Dict[str, Any]] = []
    if child_email:
        children.append({
            "email": child_email.strip().lower(),
            "linked_at": None,
            "invite_id": None,
            "relationship": rel,
        })
    record = {
        "email": email.strip().lower(),
        "name": name,
        "password": password_hash,
        "email_verified": email_verified,
        "relationship": rel,
        "children": children,
        "child_email": children[0]["email"] if children else None,
        "link_status": link_status,
        "pending_child_email": pending_child_email,
        "pending_invite_id": pending_invite_id,
        "verified": link_status == "linked" or bool(children),
        "role": "parent",
    }
    if cnic:
        record["cnic"] = cnic
    record = _migrate_record(record)
    parents[email.strip().lower()] = record
    save_parents(parents)
    return record


def update_parent(email: str, **fields) -> Optional[dict]:
    parents = load_parents()
    key = email.strip().lower()
    rec = parents.get(key)
    if not rec:
        return None
    if "relationship" in fields:
        fields["relationship"] = normalize_relationship(fields["relationship"]) or rec.get("relationship") or "father"
    rec.update(fields)
    rec = _migrate_record(rec)
    parents[key] = rec
    save_parents(parents)
    return rec


def get_parent_children(email: str) -> List[Dict[str, Any]]:
    parent = get_parent(email)
    if not parent:
        return []
    return list(parent.get("children") or [])


def parent_has_child(email: str, child_email: str) -> bool:
    child_email = child_email.strip().lower()
    return any(c.get("email") == child_email for c in get_parent_children(email))


def add_linked_child(
    parent_email: str,
    child_email: str,
    *,
    invite_id: Optional[str] = None,
    linked_at: Optional[str] = None,
    relationship: Optional[str] = None,
) -> Optional[dict]:
    parent = get_parent(parent_email)
    if not parent:
        return None
    child_email = child_email.strip().lower()
    rel = normalize_relationship(relationship) or parent.get("relationship") or "father"
    children = list(parent.get("children") or [])
    if any(c.get("email") == child_email for c in children):
        # Already linked — just clear pending
        return update_parent(
            parent_email,
            pending_child_email=None,
            pending_invite_id=None,
            link_status="linked",
        )
    children.append({
        "email": child_email,
        "linked_at": linked_at,
        "invite_id": invite_id,
        "relationship": rel,
    })
    return update_parent(
        parent_email,
        children=children,
        pending_child_email=None,
        pending_invite_id=None,
        link_status="linked",
        verified=True,
    )


def remove_linked_child(parent_email: str, child_email: str) -> Optional[dict]:
    parent = get_parent(parent_email)
    if not parent:
        return None
    child_email = child_email.strip().lower()
    children = [c for c in (parent.get("children") or []) if c.get("email") != child_email]
    pending = parent.get("pending_child_email")
    pending_id = parent.get("pending_invite_id")
    if pending == child_email:
        pending = None
        pending_id = None
    return update_parent(
        parent_email,
        children=children,
        pending_child_email=pending,
        pending_invite_id=pending_id,
    )


def clear_all_children(parent_email: str) -> Optional[dict]:
    return update_parent(
        parent_email,
        children=[],
        child_email=None,
        pending_child_email=None,
        pending_invite_id=None,
        link_status="none",
        verified=False,
    )


def strip_password(parent: dict) -> dict:
    safe = {**parent}
    safe.pop("password", None)
    return safe


def delete_parent(email: str) -> bool:
    """Permanently remove a parent account record."""
    parents = load_parents()
    key = email.strip().lower()
    if key not in parents:
        return False
    del parents[key]
    save_parents(parents)
    return True
