"""
Temporary single-use Family Invitation Codes (V6).

Format shown to users: FAM-XXXXX (5 alphanumeric chars).
Only the SHA-256 hash is stored — plaintext returned once on create.
"""

from __future__ import annotations

import hashlib
import json
import random
import secrets
import string
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

INVITES_FILE = Path("data/family_invites.json")
RATE_FILE = Path("data/invite_rate_limits.json")
_lock = threading.RLock()

INVITE_TTL_HOURS = 48
CODE_ALPHABET = string.ascii_uppercase + string.digits
MAX_FAILS = 5
COOLDOWN_MINUTES = 15


def _now() -> datetime:
    return datetime.now()


def _hash(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()


def _load_invites() -> Dict[str, Any]:
    if not INVITES_FILE.exists():
        return {}
    try:
        data = json.loads(INVITES_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_invites(data: Dict[str, Any]) -> None:
    INVITES_FILE.parent.mkdir(parents=True, exist_ok=True)
    INVITES_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _load_rates() -> Dict[str, Any]:
    if not RATE_FILE.exists():
        return {}
    try:
        data = json.loads(RATE_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_rates(data: Dict[str, Any]) -> None:
    RATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    RATE_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def normalize_invite_code(raw: str) -> str:
    code = (raw or "").strip().upper().replace(" ", "")
    if not code.startswith("FAM-"):
        # allow entering without prefix
        if len(code) == 5:
            code = f"FAM-{code}"
    return code


def _generate_plain_code() -> str:
    body = "".join(secrets.choice(CODE_ALPHABET) for _ in range(5))
    return f"FAM-{body}"


def create_invite(child_email: str) -> Dict[str, Any]:
    """
    Cancel any open invites for this child, create a new one.
    Returns { invite_id, code, expires_at } — code plaintext once only.
    """
    child_email = child_email.strip().lower()
    now = _now()
    expires = now + timedelta(hours=INVITE_TTL_HOURS)
    plain = _generate_plain_code()
    invite_id = secrets.token_hex(8)

    with _lock:
        data = _load_invites()
        for inv in data.values():
            if (
                inv.get("child_email") == child_email
                and not inv.get("used")
                and not inv.get("cancelled")
                and not inv.get("pending_parent_email")
            ):
                inv["cancelled"] = True
                inv["cancelled_at"] = now.isoformat()

        data[invite_id] = {
            "id": invite_id,
            "child_email": child_email,
            "code_hash": _hash(plain),
            "created_at": now.isoformat(),
            "expires_at": expires.isoformat(),
            "used": False,
            "cancelled": False,
            "pending_parent_email": None,
            "pending_parent_name": None,
            "pending_at": None,
            "linked_parent_email": None,
        }
        _save_invites(data)

    return {
        "invite_id": invite_id,
        "code": plain,
        "expires_at": expires.isoformat(),
        "expires_in_hours": INVITE_TTL_HOURS,
    }


def cancel_invite(child_email: str, invite_id: str) -> bool:
    child_email = child_email.strip().lower()
    with _lock:
        data = _load_invites()
        inv = data.get(invite_id)
        if not inv or inv.get("child_email") != child_email:
            return False
        if inv.get("used"):
            return False
        inv["cancelled"] = True
        inv["cancelled_at"] = _now().isoformat()
        # clear pending if any
        inv["pending_parent_email"] = None
        inv["pending_parent_name"] = None
        data[invite_id] = inv
        _save_invites(data)
        return True


def list_child_invites(child_email: str) -> List[Dict[str, Any]]:
    child_email = child_email.strip().lower()
    now = _now()
    out: List[Dict[str, Any]] = []
    with _lock:
        data = _load_invites()
        for inv in data.values():
            if inv.get("child_email") != child_email:
                continue
            expired = False
            try:
                expired = now > datetime.fromisoformat(inv["expires_at"])
            except Exception:
                expired = True
            out.append({
                "id": inv["id"],
                "created_at": inv.get("created_at"),
                "expires_at": inv.get("expires_at"),
                "expired": expired,
                "used": bool(inv.get("used")),
                "cancelled": bool(inv.get("cancelled")),
                "pending_parent_email": inv.get("pending_parent_email"),
                "pending_parent_name": inv.get("pending_parent_name"),
                "linked_parent_email": inv.get("linked_parent_email"),
                "status": _status(inv, expired),
            })
    out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return out[:20]


def _status(inv: Dict[str, Any], expired: bool) -> str:
    if inv.get("linked_parent_email"):
        return "linked"
    if inv.get("used") and inv.get("pending_parent_email"):
        return "pending_approval"
    if inv.get("cancelled"):
        return "cancelled"
    if expired:
        return "expired"
    if inv.get("used"):
        return "used"
    return "active"


def check_rate_limit(parent_email: str) -> Optional[str]:
    key = parent_email.strip().lower()
    with _lock:
        rates = _load_rates()
        entry = rates.get(key) or {}
        locked_until = entry.get("locked_until")
        if locked_until:
            try:
                until = datetime.fromisoformat(locked_until)
                if _now() < until:
                    mins = int((until - _now()).total_seconds() / 60) + 1
                    return f"Too many incorrect codes. Try again in {mins} minute(s)."
                entry["fails"] = 0
                entry.pop("locked_until", None)
            except Exception:
                entry = {}
        rates[key] = entry
        _save_rates(rates)
    return None


def record_failed_attempt(parent_email: str) -> None:
    key = parent_email.strip().lower()
    with _lock:
        rates = _load_rates()
        entry = rates.get(key) or {"fails": 0}
        fails = int(entry.get("fails") or 0) + 1
        entry["fails"] = fails
        if fails >= MAX_FAILS:
            entry["locked_until"] = (
                _now() + timedelta(minutes=COOLDOWN_MINUTES)
            ).isoformat()
            entry["fails"] = 0
        rates[key] = entry
        _save_rates(rates)


def clear_rate_limit(parent_email: str) -> None:
    key = parent_email.strip().lower()
    with _lock:
        rates = _load_rates()
        rates.pop(key, None)
        _save_rates(rates)


def get_linked_parents_for_child(child_email: str) -> List[Dict[str, Any]]:
    """Return currently linked parents for a child (max 2: father + mother)."""
    child_email = child_email.strip().lower()
    out: List[Dict[str, Any]] = []
    with _lock:
        for inv in _load_invites().values():
            if inv.get("child_email") != child_email:
                continue
            parent_email = inv.get("linked_parent_email")
            if not parent_email:
                continue
            rel = (inv.get("linked_relationship") or inv.get("pending_relationship") or "").strip().lower()
            if rel not in ("father", "mother"):
                rel = "father"
            out.append({
                "email": parent_email,
                "name": inv.get("pending_parent_name") or inv.get("linked_parent_name") or "Parent",
                "relationship": rel,
                "linked_at": inv.get("linked_at"),
                "invite_id": inv["id"],
            })
    # Prefer one entry per relationship slot
    by_slot: Dict[str, Dict[str, Any]] = {}
    for item in out:
        by_slot[item["relationship"]] = item
    return list(by_slot.values())


def check_relationship_slot(
    child_email: str,
    relationship: str,
    *,
    exclude_parent_email: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Enforce: one Father and one Mother slot per child.
    Returns (ok, error_detail).
    """
    relationship = (relationship or "").strip().lower()
    if relationship not in ("father", "mother"):
        return False, "Parent relationship must be Father or Mother."

    child_email = child_email.strip().lower()
    exclude = (exclude_parent_email or "").strip().lower() or None
    linked = get_linked_parents_for_child(child_email)

    for p in linked:
        if exclude and p.get("email") == exclude:
            continue
        if p.get("relationship") == relationship:
            label = "Father" if relationship == "father" else "Mother"
            return False, (
                f"This child already has a linked {label}. "
                f"Only one {label} can be linked."
            )

    # Also block if another pending request already holds this slot
    with _lock:
        for inv in _load_invites().values():
            if inv.get("child_email") != child_email:
                continue
            if inv.get("linked_parent_email"):
                continue
            pending_email = inv.get("pending_parent_email")
            if not pending_email:
                continue
            if exclude and pending_email == exclude:
                continue
            pending_rel = (inv.get("pending_relationship") or "").strip().lower()
            if pending_rel == relationship:
                label = "Father" if relationship == "father" else "Mother"
                return False, (
                    f"A {label} link request is already waiting for this child’s approval."
                )

    if len([p for p in linked if not exclude or p.get("email") != exclude]) >= 2:
        return False, "This child already has two linked parents (Father and Mother)."

    return True, "ok"


def slots_for_child(child_email: str) -> Dict[str, Any]:
    linked = get_linked_parents_for_child(child_email)
    father = next((p for p in linked if p.get("relationship") == "father"), None)
    mother = next((p for p in linked if p.get("relationship") == "mother"), None)
    return {
        "father": father,
        "mother": mother,
        "open_slots": [
            s for s, occupied in (("father", father), ("mother", mother)) if not occupied
        ],
        "can_invite_more": father is None or mother is None,
    }


def redeem_invite(
    *,
    plain_code: str,
    parent_email: str,
    parent_name: str,
    relationship: str,
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Parent submits invite code. On success, marks invite pending approval
    (single-use from this point — cannot be reused by another parent).
    """
    parent_email = parent_email.strip().lower()
    relationship = (relationship or "").strip().lower()
    if relationship not in ("father", "mother"):
        return False, "Set your relationship (Father or Mother) before linking.", None

    limit_msg = check_rate_limit(parent_email)
    if limit_msg:
        return False, limit_msg, None

    code = normalize_invite_code(plain_code)
    if not code.startswith("FAM-") or len(code) != 9:
        record_failed_attempt(parent_email)
        return False, "Invalid invitation code format. Example: FAM-82K7Q", None

    code_h = _hash(code)
    now = _now()

    with _lock:
        data = _load_invites()
        match_id = None
        match = None
        for iid, inv in data.items():
            if inv.get("code_hash") == code_h:
                match_id = iid
                match = inv
                break

        if not match:
            record_failed_attempt(parent_email)
            return False, "Invitation code not found.", None

        if match.get("cancelled"):
            record_failed_attempt(parent_email)
            return False, "This invitation was cancelled by the student.", None

        try:
            if now > datetime.fromisoformat(match["expires_at"]):
                record_failed_attempt(parent_email)
                return False, "This invitation code has expired. Ask for a new one.", None
        except Exception:
            return False, "This invitation code is invalid.", None

        if match.get("used") or match.get("pending_parent_email") or match.get("linked_parent_email"):
            record_failed_attempt(parent_email)
            return False, "This invitation code has already been used.", None

        child_email = match["child_email"]

        if child_email == parent_email:
            return False, "Parent and child cannot use the same email address.", None

        # Already linked to this child?
        for inv in data.values():
            if (
                inv.get("child_email") == child_email
                and inv.get("linked_parent_email") == parent_email
            ):
                return False, "You are already linked to this child.", None

        slot_ok, slot_detail = check_relationship_slot(
            child_email, relationship, exclude_parent_email=parent_email
        )
        if not slot_ok:
            return False, slot_detail, None

        approve_token = secrets.token_urlsafe(24)
        match["used"] = True
        match["pending_parent_email"] = parent_email
        match["pending_parent_name"] = parent_name.strip() or "Parent"
        match["pending_relationship"] = relationship
        match["pending_at"] = now.isoformat()
        match["approve_token_hash"] = _hash(approve_token)
        data[match_id] = match
        _save_invites(data)

    clear_rate_limit(parent_email)
    return True, "pending_approval", {
        "invite_id": match_id,
        "child_email": child_email,
        "parent_email": parent_email,
        "parent_name": match.get("pending_parent_name") or "Parent",
        "relationship": relationship,
        "approve_token": approve_token,
    }


def get_pending_for_child(child_email: str) -> List[Dict[str, Any]]:
    child_email = child_email.strip().lower()
    out: List[Dict[str, Any]] = []
    with _lock:
        for inv in _load_invites().values():
            if inv.get("child_email") != child_email:
                continue
            if inv.get("pending_parent_email") and not inv.get("linked_parent_email"):
                out.append({
                    "invite_id": inv["id"],
                    "parent_email": inv["pending_parent_email"],
                    "parent_name": inv.get("pending_parent_name") or "Parent",
                    "relationship": (inv.get("pending_relationship") or "father"),
                    "pending_at": inv.get("pending_at"),
                })
    return out


def approve_invite(
    child_email: str, invite_id: str
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """Returns (ok, detail, info) where info has parent_email, relationship, linked_at."""
    child_email = child_email.strip().lower()
    with _lock:
        data = _load_invites()
        inv = data.get(invite_id)
        if not inv or inv.get("child_email") != child_email:
            return False, "Invitation not found.", None
        parent_email = inv.get("pending_parent_email")
        if not parent_email:
            return False, "No pending parent request on this invitation.", None
        if inv.get("linked_parent_email"):
            return False, "Already linked.", None
        if parent_email == child_email:
            return False, "Parent and child cannot use the same email address.", None

        relationship = (inv.get("pending_relationship") or "father").strip().lower()
        if relationship not in ("father", "mother"):
            relationship = "father"

        slot_ok, slot_detail = check_relationship_slot(
            child_email, relationship, exclude_parent_email=parent_email
        )
        if not slot_ok:
            return False, slot_detail, None

        linked_at = _now().isoformat()
        inv["linked_parent_email"] = parent_email
        inv["linked_relationship"] = relationship
        inv["linked_parent_name"] = inv.get("pending_parent_name") or "Parent"
        inv["linked_at"] = linked_at
        inv.pop("approve_token_hash", None)
        data[invite_id] = inv
        _save_invites(data)
        return True, "linked", {
            "parent_email": parent_email,
            "relationship": relationship,
            "linked_at": linked_at,
            "invite_id": invite_id,
            "parent_name": inv.get("linked_parent_name") or "Parent",
        }


def reject_invite(child_email: str, invite_id: str) -> Tuple[bool, str]:
    child_email = child_email.strip().lower()
    with _lock:
        data = _load_invites()
        inv = data.get(invite_id)
        if not inv or inv.get("child_email") != child_email:
            return False, "Invitation not found."
        if not inv.get("pending_parent_email"):
            return False, "No pending parent request."
        if inv.get("linked_parent_email"):
            return False, "Already linked — use unlink instead."
        inv["pending_parent_email"] = None
        inv["pending_parent_name"] = None
        inv["rejected_at"] = _now().isoformat()
        inv["cancelled"] = True  # code already consumed; need new invite
        inv.pop("approve_token_hash", None)
        data[invite_id] = inv
        _save_invites(data)
        return True, "rejected"


def reissue_approve_token(child_email: str, invite_id: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """Regenerate email-approve token for a pending invite (child authenticated)."""
    child_email = child_email.strip().lower()
    with _lock:
        data = _load_invites()
        inv = data.get(invite_id)
        if not inv or inv.get("child_email") != child_email:
            return False, "Invitation not found.", None
        if not inv.get("pending_parent_email") or inv.get("linked_parent_email"):
            return False, "No pending parent request to email.", None
        token = secrets.token_urlsafe(24)
        inv["approve_token_hash"] = _hash(token)
        data[invite_id] = inv
        _save_invites(data)
        return True, "ok", {
            "invite_id": invite_id,
            "child_email": child_email,
            "parent_email": inv["pending_parent_email"],
            "parent_name": inv.get("pending_parent_name") or "Parent",
            "approve_token": token,
        }


def respond_with_approve_token(
    plain_token: str,
    action: str,
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Approve or reject a pending parent link using the emailed one-time token.
    Does not require a logged-in session — the token proves access to the child's inbox.
    """
    action = (action or "").strip().lower()
    if action not in ("approve", "reject"):
        return False, "Action must be approve or reject.", None

    token = (plain_token or "").strip()
    if len(token) < 16:
        return False, "Invalid or expired approval link.", None
    token_h = _hash(token)

    with _lock:
        data = _load_invites()
        match_id = None
        match = None
        for iid, inv in data.items():
            if inv.get("approve_token_hash") == token_h:
                match_id = iid
                match = inv
                break

        if not match:
            return False, "This approval link is invalid or already used.", None

        parent_email = match.get("pending_parent_email")
        if not parent_email:
            return False, "No pending parent request on this link.", None
        if match.get("linked_parent_email"):
            return False, "Already linked.", None

        child_email = match.get("child_email")
        parent_name = match.get("pending_parent_name") or "Parent"

        if action == "approve":
            relationship = (match.get("pending_relationship") or "father").strip().lower()
            if relationship not in ("father", "mother"):
                relationship = "father"
            slot_ok, slot_detail = check_relationship_slot(
                child_email, relationship, exclude_parent_email=parent_email
            )
            if not slot_ok:
                return False, slot_detail, None

            linked_at = _now().isoformat()
            match["linked_parent_email"] = parent_email
            match["linked_relationship"] = relationship
            match["linked_parent_name"] = parent_name
            match["linked_at"] = linked_at
            match.pop("approve_token_hash", None)
            data[match_id] = match
            _save_invites(data)
            return True, "linked", {
                "action": "approve",
                "child_email": child_email,
                "parent_email": parent_email,
                "parent_name": parent_name,
                "relationship": relationship,
                "linked_at": linked_at,
                "invite_id": match_id,
            }

        match["pending_parent_email"] = None
        match["pending_parent_name"] = None
        match["rejected_at"] = _now().isoformat()
        match["cancelled"] = True
        match.pop("approve_token_hash", None)
        data[match_id] = match
        _save_invites(data)
        return True, "rejected", {
            "action": "reject",
            "child_email": child_email,
            "parent_email": parent_email,
            "parent_name": parent_name,
            "invite_id": match_id,
        }


def get_link_status_for_child(child_email: str) -> Dict[str, Any]:
    child_email = child_email.strip().lower()
    pending = get_pending_for_child(child_email)
    linked_parents = get_linked_parents_for_child(child_email)
    # Enrich names from parent_db when available
    try:
        from utils.parent_db import get_parent
        enriched = []
        for p in linked_parents:
            rec = get_parent(p["email"])
            enriched.append({
                **p,
                "name": (rec or {}).get("name") or p.get("name") or "Parent",
                "relationship": p.get("relationship")
                or (rec or {}).get("relationship")
                or "father",
            })
        linked_parents = enriched
    except Exception:
        pass

    slots = slots_for_child(child_email)
    # Back-compat: singular linked_parent = first linked
    linked_parent = linked_parents[0] if linked_parents else None
    return {
        "pending_requests": pending,
        "linked_parents": linked_parents,
        "linked_parent": linked_parent,
        "slots": slots,
        "can_invite_more": bool(slots.get("can_invite_more")),
        "active_invites": [
            i for i in list_child_invites(child_email)
            if i["status"] == "active"
        ],
    }


def rename_child_email_on_invites(old_email: str, new_email: str) -> int:
    """Keep family invite rows pointing at a student after they change email."""
    old_email = old_email.strip().lower()
    new_email = new_email.strip().lower()
    changed = 0
    with _lock:
        data = _load_invites()
        for inv in data.values():
            if inv.get("child_email") == old_email:
                inv["child_email"] = new_email
                changed += 1
        if changed:
            _save_invites(data)
    return changed


def clear_parent_links(parent_email: str) -> int:
    """When a parent account is deleted, clear pending/linked flags on invites."""
    parent_email = parent_email.strip().lower()
    changed = 0
    with _lock:
        data = _load_invites()
        for inv in data.values():
            touch = False
            if inv.get("pending_parent_email") == parent_email:
                inv["pending_parent_email"] = None
                inv["pending_parent_name"] = None
                inv["pending_relationship"] = None
                inv.pop("approve_token_hash", None)
                inv["cancelled"] = True
                touch = True
            if inv.get("linked_parent_email") == parent_email:
                inv["was_linked_to"] = parent_email
                inv["linked_parent_email"] = None
                inv["linked_relationship"] = None
                inv["unlinked_at"] = _now().isoformat()
                touch = True
            if touch:
                changed += 1
        if changed:
            _save_invites(data)
    return changed


def unlink_parent_from_child(
    child_email: str,
    *,
    parent_email: Optional[str] = None,
    invite_id: Optional[str] = None,
) -> Tuple[bool, List[str]]:
    """
    Unlink one parent from a child. Returns (ok, list_of_unlinked_parent_emails).
    If neither parent_email nor invite_id given, unlinks all linked parents.
    """
    child_email = child_email.strip().lower()
    parent_email = (parent_email or "").strip().lower() or None
    invite_id = (invite_id or "").strip() or None
    unlinked: List[str] = []
    with _lock:
        data = _load_invites()
        for iid, inv in data.items():
            if inv.get("child_email") != child_email:
                continue
            linked = inv.get("linked_parent_email")
            if not linked:
                continue
            if invite_id and iid != invite_id:
                continue
            if parent_email and linked != parent_email:
                continue
            inv["unlinked_at"] = _now().isoformat()
            inv["was_linked_to"] = linked
            inv["linked_parent_email"] = None
            inv["linked_relationship"] = None
            inv["pending_parent_email"] = None
            inv["pending_relationship"] = None
            unlinked.append(linked)
        if unlinked:
            _save_invites(data)
    return bool(unlinked), unlinked


def unlink_by_child(child_email: str) -> bool:
    """Unlink all parents from this child."""
    ok, _ = unlink_parent_from_child(child_email)
    return ok


def clear_all_invites_for_child(child_email: str) -> int:
    """
    When a child deletes their account: clear every invite row for that child
    so parents lose access and the child disappears from family state.
    """
    child_email = child_email.strip().lower()
    changed = 0
    with _lock:
        data = _load_invites()
        for inv in data.values():
            if inv.get("child_email") != child_email:
                continue
            if inv.get("linked_parent_email") or inv.get("pending_parent_email") or not inv.get("cancelled"):
                inv["was_linked_to"] = inv.get("linked_parent_email") or inv.get("pending_parent_email")
                inv["linked_parent_email"] = None
                inv["linked_relationship"] = None
                inv["pending_parent_email"] = None
                inv["pending_parent_name"] = None
                inv["pending_relationship"] = None
                inv.pop("approve_token_hash", None)
                inv["cancelled"] = True
                inv["child_deleted_at"] = _now().isoformat()
                changed += 1
        if changed:
            _save_invites(data)
    return changed
