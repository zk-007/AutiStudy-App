#!/usr/bin/env python3
"""Delete ALL student/parent accounts, chats, quizzes, sessions, agent memory."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def wipe() -> None:
    targets = {
        "users": BACKEND / "data" / "users.json",
        "parents": BACKEND / "data" / "parents.json",
        "chats": BACKEND / "data" / "chats.json",
        "sessions": BACKEND / "data" / "sessions.json",
        "parent_sessions": BACKEND / "data" / "parent_sessions.json",
    }
    dirs = [
        BACKEND / "quiz_data",
        BACKEND / "data" / "agent_memory",
    ]

    print("=== BEFORE WIPE ===")
    for label, path in targets.items():
        if path.exists():
            try:
                import json
                data = json.loads(path.read_text(encoding="utf-8"))
                count = len(data) if isinstance(data, dict) else 0
                print(f"  {path.name}: {count} records")
            except Exception:
                print(f"  {path.name}: (exists)")
    for d in dirs:
        if d.exists():
            n = sum(1 for _ in d.rglob("*") if _.is_file())
            print(f"  {d.name}/: {n} files")

    print("\n=== WIPING ===")
    for label, path in targets.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{}", encoding="utf-8")
        print(f"  cleared {path.relative_to(BACKEND)}")

    for d in dirs:
        if d.exists():
            shutil.rmtree(d)
            print(f"  removed {d.relative_to(BACKEND)}/")
        d.mkdir(parents=True, exist_ok=True)

    print("Done — all user data wiped.")


if __name__ == "__main__":
    if "--yes" not in sys.argv:
        print("Pass --yes to confirm full wipe (no backup).")
        sys.exit(1)
    wipe()
