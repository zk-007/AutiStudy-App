"""Remove all persisted data for a student account, and safe account-detail changes."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from utils.agent_memory import _memory_path
from utils.auth import load_users, save_users
from utils.chat_db import load_chats, save_chats
from utils.family_invite import (
    clear_all_invites_for_child,
    rename_child_email_on_invites,
)
from utils.parent_db import load_parents, save_parents
from utils.quiz_db import _get_user_file
from utils.session import delete_session, load_sessions, save_sessions


def delete_sessions_for_email(email: str, except_token: Optional[str] = None) -> None:
    sessions = load_sessions()
    to_remove = [
        token
        for token, session in sessions.items()
        if session.get("email") == email and token != except_token
    ]
    for token in to_remove:
        del sessions[token]
    save_sessions(sessions)


def unlink_parents_for_child(child_email: str) -> None:
    """
    Remove a deleted child from every parent account:
    - drop from children[]
    - clear pending if matching
    - parent account itself stays
    """
    child_email = child_email.strip().lower()
    parents = load_parents()
    for email, record in list(parents.items()):
        touched = False
        children = [
            c for c in (record.get("children") or [])
            if isinstance(c, dict) and (c.get("email") or "").strip().lower() != child_email
        ]
        if len(children) != len(record.get("children") or []):
            record["children"] = children
            touched = True
        if (record.get("child_email") or "").strip().lower() == child_email:
            record["child_email"] = children[0]["email"] if children else None
            touched = True
        if (record.get("pending_child_email") or "").strip().lower() == child_email:
            record["pending_child_email"] = None
            record["pending_invite_id"] = None
            touched = True
        if touched:
            if record.get("pending_child_email"):
                record["link_status"] = "pending"
            elif children:
                record["link_status"] = "linked"
            else:
                record["link_status"] = "none"
            record["verified"] = bool(children)
            parents[email] = record
    save_parents(parents)
    clear_all_invites_for_child(child_email)


def delete_student_account(email: str, current_token: Optional[str] = None) -> bool:
    """Delete student record and all associated files. Returns False if user missing."""
    users = load_users()
    if email not in users:
        return False

    del users[email]
    save_users(users)

    chats = load_chats()
    if email in chats:
        del chats[email]
        save_chats(chats)

    quiz_file = _get_user_file(email)
    if os.path.exists(quiz_file):
        os.remove(quiz_file)

    memory_file = _memory_path(email)
    if memory_file.exists():
        memory_file.unlink()

    unlink_parents_for_child(email)
    delete_sessions_for_email(email, except_token=None)
    if current_token:
        delete_session(current_token)

    return True


def change_student_email(old_email: str, new_email: str, current_token: Optional[str] = None) -> bool:
    """
    Rename a student's account email everywhere their data is keyed by it —
    users, chat history, quiz history, agent memory, parent links, and the
    live session — so nothing is orphaned and the student stays logged in.
    """
    users = load_users()
    user = users.pop(old_email, None)
    if user is None:
        return False
    user["email"] = new_email
    users[new_email] = user
    save_users(users)

    chats = load_chats()
    if old_email in chats:
        chats[new_email] = chats.pop(old_email)
        save_chats(chats)

    old_quiz_file = _get_user_file(old_email)
    if os.path.exists(old_quiz_file):
        new_quiz_file = _get_user_file(new_email)
        os.replace(old_quiz_file, new_quiz_file)

    old_memory_file = _memory_path(old_email)
    if old_memory_file.exists():
        new_memory_file = _memory_path(new_email)
        try:
            with open(old_memory_file, "r", encoding="utf-8") as f:
                memory = json.load(f)
            memory["email"] = new_email
            with open(old_memory_file, "w", encoding="utf-8") as f:
                json.dump(memory, f, indent=2, ensure_ascii=False)
        except Exception:
            pass
        os.replace(old_memory_file, new_memory_file)

    parents = load_parents()
    parents_changed = False
    for record in parents.values():
        children = record.get("children") or []
        for c in children:
            if isinstance(c, dict) and (c.get("email") or "").strip().lower() == old_email:
                c["email"] = new_email
                parents_changed = True
        if (record.get("child_email") or "").strip().lower() == old_email:
            record["child_email"] = new_email
            parents_changed = True
        if (record.get("pending_child_email") or "").strip().lower() == old_email:
            record["pending_child_email"] = new_email
            parents_changed = True
    if parents_changed:
        save_parents(parents)

    rename_child_email_on_invites(old_email, new_email)

    # Keep the current session alive under the new email instead of forcing
    # a re-login; any *other* sessions for the old email are dropped.
    sessions = load_sessions()
    for token, session in list(sessions.items()):
        if session.get("email") != old_email:
            continue
        if token == current_token:
            session["email"] = new_email
            if isinstance(session.get("user_data"), dict):
                session["user_data"]["email"] = new_email
        else:
            del sessions[token]
    save_sessions(sessions)

    return True


def change_parent_email(old_email: str, new_email: str, current_token: Optional[str] = None) -> bool:
    """
    Rename parent account email, clear family link (must re-invite),
    and keep the current parent session under the new address.
    """
    from utils.family_invite import clear_parent_links
    from utils.parent_db import load_parents, save_parents

    old_email = old_email.strip().lower()
    new_email = new_email.strip().lower()
    parents = load_parents()
    parent = parents.pop(old_email, None)
    if parent is None:
        return False
    if new_email in parents:
        # restore and abort
        parents[old_email] = parent
        save_parents(parents)
        return False

    clear_parent_links(old_email)

    parent["email"] = new_email
    parent["email_verified"] = True
    parent["children"] = []
    parent["child_email"] = None
    parent["pending_child_email"] = None
    parent["pending_invite_id"] = None
    parent["link_status"] = "none"
    parent["verified"] = False
    parents[new_email] = parent
    save_parents(parents)

    # Update parent sessions file (api_server path)
    sessions_path = Path(__file__).resolve().parent.parent / "data" / "parent_sessions.json"
    try:
        if sessions_path.exists():
            sessions = json.loads(sessions_path.read_text(encoding="utf-8"))
            if isinstance(sessions, dict):
                for token, session in list(sessions.items()):
                    if not isinstance(session, dict):
                        continue
                    if session.get("email") != old_email:
                        continue
                    if token == current_token:
                        session["email"] = new_email
                    else:
                        del sessions[token]
                sessions_path.write_text(
                    json.dumps(sessions, ensure_ascii=False, indent=2), encoding="utf-8"
                )
    except Exception:
        pass

    return True
