"""
Part B #9 — Dashboard extras: mood check-ins, daily schedule, learning-day
history for the Learner Journey tree.

Storage: data/dashboard/<safe_email>.json
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

DASHBOARD_DIR = Path("data/dashboard")

VALID_MOODS = {"great", "good", "okay", "tired", "frustrated"}

DEFAULT_SCHEDULE_TEMPLATES = [
    {"title": "Maths practice", "subject": "Maths"},
    {"title": "Science reading", "subject": "General Science"},
    {"title": "Ask the tutor a question", "subject": None},
]


def _safe_email(email: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.+-]", "_", (email or "").strip().lower())


def _path(email: str) -> Path:
    DASHBOARD_DIR.mkdir(parents=True, exist_ok=True)
    return DASHBOARD_DIR / f"{_safe_email(email)}.json"


def _empty() -> Dict[str, Any]:
    return {
        "mood_checkins": [],       # [{date, mood, timestamp}]
        "schedule": {},            # { "YYYY-MM-DD": [{id, title, subject, done}] }
        "learning_days": [],       # ["YYYY-MM-DD", ...] unique active days
    }


def load_dashboard(email: str) -> Dict[str, Any]:
    path = _path(email)
    if not path.exists():
        return _empty()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _empty()
        base = _empty()
        base.update(data)
        base.setdefault("mood_checkins", [])
        base.setdefault("schedule", {})
        base.setdefault("learning_days", [])
        return base
    except Exception:
        return _empty()


def save_dashboard(email: str, data: Dict[str, Any]) -> None:
    path = _path(email)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _today() -> str:
    return date.today().isoformat()


def mark_learning_day(email: str, day: Optional[str] = None) -> List[str]:
    """Record that the student was active on `day` (defaults to today)."""
    data = load_dashboard(email)
    d = day or _today()
    days: List[str] = list(data.get("learning_days") or [])
    if d not in days:
        days.append(d)
        days.sort()
        # Keep last ~120 days
        days = days[-120:]
        data["learning_days"] = days
        save_dashboard(email, data)
    return days


def get_mood_today(email: str) -> Optional[str]:
    data = load_dashboard(email)
    today = _today()
    for entry in reversed(data.get("mood_checkins") or []):
        if entry.get("date") == today:
            return entry.get("mood")
    return None


def save_mood(email: str, mood: str) -> Dict[str, Any]:
    mood = (mood or "").strip().lower()
    if mood not in VALID_MOODS:
        raise ValueError(f"Invalid mood. Choose one of: {', '.join(sorted(VALID_MOODS))}")
    data = load_dashboard(email)
    today = _today()
    checkins = [c for c in (data.get("mood_checkins") or []) if c.get("date") != today]
    checkins.append({
        "date": today,
        "mood": mood,
        "timestamp": datetime.now().isoformat(),
    })
    data["mood_checkins"] = checkins[-60:]
    save_dashboard(email, data)
    mark_learning_day(email, today)
    return {"date": today, "mood": mood}


def get_schedule_for_day(email: str, day: Optional[str] = None) -> List[Dict[str, Any]]:
    data = load_dashboard(email)
    d = day or _today()
    schedule = data.get("schedule") or {}
    items = schedule.get(d)
    if items is None:
        # Seed a gentle default plan the first time they open today.
        items = [
            {
                "id": str(uuid.uuid4())[:8],
                "title": t["title"],
                "subject": t.get("subject"),
                "done": False,
            }
            for t in DEFAULT_SCHEDULE_TEMPLATES
        ]
        schedule[d] = items
        data["schedule"] = schedule
        save_dashboard(email, data)
    return items


def set_schedule_for_day(
    email: str,
    items: List[Dict[str, Any]],
    day: Optional[str] = None,
) -> List[Dict[str, Any]]:
    data = load_dashboard(email)
    d = day or _today()
    cleaned: List[Dict[str, Any]] = []
    for raw in items[:12]:
        title = (raw.get("title") or "").strip()
        if not title:
            continue
        cleaned.append({
            "id": raw.get("id") or str(uuid.uuid4())[:8],
            "title": title[:80],
            "subject": raw.get("subject") or None,
            "done": bool(raw.get("done")),
        })
    schedule = data.get("schedule") or {}
    schedule[d] = cleaned
    # Prune schedules older than 30 days
    cutoff = (date.today() - timedelta(days=30)).isoformat()
    data["schedule"] = {k: v for k, v in schedule.items() if k >= cutoff}
    save_dashboard(email, data)
    if any(i.get("done") for i in cleaned):
        mark_learning_day(email, d)
    return cleaned


def toggle_schedule_item(email: str, item_id: str, day: Optional[str] = None) -> List[Dict[str, Any]]:
    d = day or _today()
    items = get_schedule_for_day(email, d)
    for item in items:
        if item.get("id") == item_id:
            item["done"] = not bool(item.get("done"))
            break
    return set_schedule_for_day(email, items, d)


def merge_activity_dates(
    email: str,
    quiz_dates: Set[str],
    chat_dates: Set[str],
) -> List[str]:
    """Union stored learning days with quiz/chat activity; persist extras."""
    data = load_dashboard(email)
    stored = set(data.get("learning_days") or [])
    mood_dates = {c.get("date") for c in (data.get("mood_checkins") or []) if c.get("date")}
    merged = sorted(stored | quiz_dates | chat_dates | mood_dates)
    merged = merged[-120:]
    if merged != list(data.get("learning_days") or []):
        data["learning_days"] = merged
        save_dashboard(email, data)
    return merged


def compute_journey(active_days: List[str]) -> Dict[str, Any]:
    """
    Build Learner Journey metrics from a sorted list of YYYY-MM-DD active days.

    Tree grows with consecutive days ending today (or yesterday if they haven't
    studied yet today). Skipping days lowers health → tree wilts.
    """
    today = date.today()
    today_s = today.isoformat()
    yesterday_s = (today - timedelta(days=1)).isoformat()
    active = set(active_days or [])

    # Consecutive streak ending on the most recent eligible day
    if today_s in active:
        end = today
    elif yesterday_s in active:
        end = today - timedelta(days=1)
    else:
        end = None

    streak = 0
    if end is not None:
        cursor = end
        while cursor.isoformat() in active:
            streak += 1
            cursor -= timedelta(days=1)

    days_since = None
    if active:
        last = max(date.fromisoformat(d) for d in active)
        days_since = (today - last).days

    # Health 0..1 — full when streaking; decays after misses
    if streak >= 7:
        health = 1.0
    elif streak >= 3:
        health = 0.75
    elif streak >= 1:
        health = 0.5
    elif days_since is None:
        health = 0.15
    elif days_since <= 2:
        health = 0.35
    elif days_since <= 5:
        health = 0.2
    else:
        health = 0.08

    wilted = streak == 0 and (days_since is None or days_since >= 2)

    if streak >= 14:
        stage = "mighty"
    elif streak >= 7:
        stage = "flourishing"
    elif streak >= 3:
        stage = "growing"
    elif streak >= 1:
        stage = "sprout"
    else:
        stage = "seed"

    return {
        "streak_days": streak,
        "health": round(health, 2),
        "stage": stage,
        "wilted": wilted,
        "active_today": today_s in active,
        "total_active_days": len(active),
        "recent_days": sorted(active)[-14:],
    }
