"""Remove all persisted data for a student account."""
from __future__ import annotations

import os
from typing import Optional

from utils.agent_memory import _memory_path
from utils.auth import load_users, save_users
from utils.chat_db import load_chats, save_chats
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
    parents = load_parents()
    changed = False
    for record in parents.values():
        if record.get("child_email") == child_email:
            record["child_email"] = None
            record["verified"] = False
            changed = True
    if changed:
        save_parents(parents)


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
