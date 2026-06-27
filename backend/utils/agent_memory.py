"""
Agent Memory — Cross-Session Student Memory Store
==================================================
Persists what the agent has learned about each student across ALL sessions.

Storage: data/agent_memory/<email_hash>.json (one file per student)

What is remembered:
  - Which tools WORKED for this student (by subject)
  - Which tools FAILED or were ineffective
  - Topics the student consistently struggles with
  - Student's preferred learning modality
  - Total confusion events + resolution rate
  - Last 5 session summaries (for context)

The agent reads this memory before every decision so it can say:
  "Last time this student was confused about fractions,
   generate_visual worked well. I'll try that first."
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

MEMORY_DIR = Path("data/agent_memory")
MEMORY_DIR.mkdir(parents=True, exist_ok=True)


def _memory_path(email: str) -> Path:
    safe = hashlib.md5(email.encode()).hexdigest()
    return MEMORY_DIR / f"{safe}.json"


def _default_memory(email: str) -> dict:
    return {
        "email": email,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        # Tool effectiveness tracking (per subject)
        "tool_success": {},        # {"Math": {"generate_visual": 3, "use_analogy": 1}}
        "tool_failure": {},        # {"Math": {"simplify_text": 2}}
        # Topic memory
        "struggling_topics": [],   # ["fractions", "long division"]
        "mastered_topics": [],     # ["addition", "multiplication"]
        # Modality preference (what the student responds to best)
        "modality_success": {
            "text": 0,
            "text_image": 0,
            "text_image_voice": 0,
            "step_by_step": 0,
        },
        # Per-subject adaptation ladder wins (popup Yes / happy CV after a help step)
        "adaptation_success": {},  # {"Maths": {"read_aloud": 3, "step_by_step": 1}}
        # Overall stats
        "total_sessions": 0,
        "total_confused_events": 0,
        "total_resolved_events": 0,
        # Last sessions (for context window)
        "recent_sessions": [],     # last 5 [{subject, topic, tools_used, outcome}]
    }


def load_memory(email: str) -> dict:
    path = _memory_path(email)
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Merge any new default keys (forward-compat)
            defaults = _default_memory(email)
            for k, v in defaults.items():
                if k not in data:
                    data[k] = v
            return data
        except Exception:
            pass
    return _default_memory(email)


def save_memory(email: str, memory: dict) -> None:
    path = _memory_path(email)
    memory["updated_at"] = datetime.now().isoformat()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)


# ── Personalized adaptation ladder (comprehension popup flow) ─────────────────

DEFAULT_LADDER_ORDER = [1, 2, 3, 4, 5]

ADAPTATION_TO_ROUND: dict[str, int] = {
    "step_by_step": 1,
    "read_aloud": 2,
    "image": 3,
    "mcq_recall": 4,
    "breathing": 5,
}


def record_adaptation_preference(
    email: str,
    subject: str,
    adaptation: str,
    *,
    via: str = "popup_yes",
    happy_cv: bool = False,
) -> None:
    """Remember which help step worked when the student confirmed understanding."""
    if adaptation not in ADAPTATION_TO_ROUND:
        return

    memory = load_memory(email)
    memory.setdefault("adaptation_success", {})
    memory["adaptation_success"].setdefault(subject, {})
    bucket = memory["adaptation_success"][subject]
    bucket[adaptation] = bucket.get(adaptation, 0) + 1

    mod_key = {
        "step_by_step": "step_by_step",
        "read_aloud": "text_image_voice",
        "image": "text_image",
    }.get(adaptation)
    if mod_key and mod_key in memory["modality_success"]:
        memory["modality_success"][mod_key] += 1

    memory.setdefault("adaptation_meta", {})
    memory["adaptation_meta"][subject] = {
        "last_adaptation": adaptation,
        "last_via": via,
        "last_happy_cv": happy_cv,
        "last_at": datetime.now().isoformat(),
    }

    save_memory(email, memory)


def get_adaptation_ladder_order(email: str, subject: str) -> list[int]:
    """
    Return help-ladder round order for this student + subject.
    Most successful adaptation is tried first on the next confused question.
    """
    memory = load_memory(email)
    successes: dict = memory.get("adaptation_success", {}).get(subject, {})
    if not successes:
        return list(DEFAULT_LADDER_ORDER)

    best_adaptation = max(successes, key=lambda k: successes[k])
    if successes[best_adaptation] < 1:
        return list(DEFAULT_LADDER_ORDER)

    preferred_round = ADAPTATION_TO_ROUND.get(best_adaptation)
    if preferred_round is None:
        return list(DEFAULT_LADDER_ORDER)

    return [preferred_round] + [
        r for r in DEFAULT_LADDER_ORDER if r != preferred_round
    ]


def get_preferred_adaptation(email: str, subject: str) -> str | None:
    memory = load_memory(email)
    successes: dict = memory.get("adaptation_success", {}).get(subject, {})
    if not successes:
        return None
    return max(successes, key=lambda k: successes[k])


def record_tool_outcome(
    email: str,
    subject: str,
    tool_name: str,
    modality: str,
    resolved: bool,
    topic: str = "",
) -> None:
    """
    Record whether a tool resolved the student's confusion.
    Called after the emotion cycle completes.
    """
    memory = load_memory(email)

    # Tool success/failure per subject
    bucket = "tool_success" if resolved else "tool_failure"
    memory[bucket].setdefault(subject, {})
    memory[bucket][subject][tool_name] = (
        memory[bucket][subject].get(tool_name, 0) + 1
    )

    # Modality stats
    if resolved and modality in memory["modality_success"]:
        memory["modality_success"][modality] += 1

    # Global stats
    memory["total_confused_events"] += 1
    if resolved:
        memory["total_resolved_events"] += 1

    # Topic tracking
    if topic:
        if resolved:
            # Remove from struggling if it was there
            memory["struggling_topics"] = [
                t for t in memory["struggling_topics"] if t.lower() != topic.lower()
            ]
            if topic not in memory["mastered_topics"]:
                memory["mastered_topics"].append(topic)
        else:
            if topic not in memory["struggling_topics"]:
                memory["struggling_topics"].append(topic)
            # Keep list manageable
            memory["struggling_topics"] = memory["struggling_topics"][-20:]

    save_memory(email, memory)


def record_session_summary(
    email: str,
    subject: str,
    topic: str,
    tools_used: list[str],
    outcome: str,  # "understood" | "partial" | "stuck"
) -> None:
    """Append a session summary to the memory."""
    memory = load_memory(email)
    memory["total_sessions"] += 1

    summary = {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "subject": subject,
        "topic": topic,
        "tools_used": tools_used,
        "outcome": outcome,
    }
    memory["recent_sessions"].append(summary)
    # Keep only last 5
    memory["recent_sessions"] = memory["recent_sessions"][-5:]

    save_memory(email, memory)


def get_memory_context(email: str, subject: str) -> str:
    """
    Build a memory context string to inject into the agent's system prompt.
    Tells the agent what it already knows about this student.
    """
    memory = load_memory(email)

    lines = []

    # Preferred tools for this subject
    subject_success = memory["tool_success"].get(subject, {})
    subject_failure = memory["tool_failure"].get(subject, {})

    if subject_success:
        best = sorted(subject_success.items(), key=lambda x: x[1], reverse=True)[:3]
        lines.append(f"Tools that WORKED for this student in {subject}: "
                     + ", ".join(f"{t}({n}x)" for t, n in best))

    if subject_failure:
        bad = sorted(subject_failure.items(), key=lambda x: x[1], reverse=True)[:2]
        lines.append(f"Tools that did NOT help in {subject}: "
                     + ", ".join(f"{t}({n}x)" for t, n in bad))

    # Best overall modality
    mod_success = memory["modality_success"]
    best_mod = max(mod_success, key=mod_success.get) if any(mod_success.values()) else None
    if best_mod and mod_success[best_mod] > 0:
        lines.append(f"Preferred modality for this student: {best_mod} "
                     f"(resolved confusion {mod_success[best_mod]}x)")

    # Struggling topics
    if memory["struggling_topics"]:
        recent_struggles = memory["struggling_topics"][-5:]
        lines.append(f"Topics this student struggles with: {', '.join(recent_struggles)}")

    # Recent sessions
    if memory["recent_sessions"]:
        last = memory["recent_sessions"][-1]
        lines.append(
            f"Last session ({last['date']}): {last['subject']} — {last.get('topic','?')} "
            f"— outcome: {last['outcome']} — tools: {', '.join(last.get('tools_used', []))}"
        )

    # Resolution rate
    total = memory["total_confused_events"]
    resolved = memory["total_resolved_events"]
    if total > 0:
        rate = int(resolved / total * 100)
        lines.append(f"Overall confusion resolution rate: {rate}% ({resolved}/{total})")

    # Preferred adaptation for this subject (comprehension ladder)
    pref = get_preferred_adaptation(email, subject)
    if pref:
        count = memory.get("adaptation_success", {}).get(subject, {}).get(pref, 0)
        lines.append(
            f"Preferred help style in {subject}: {pref.replace('_', ' ')} "
            f"(worked {count}x) — try this first when they need extra help"
        )

    if not lines:
        return "No memory yet — this is the student's first session."

    return "STUDENT MEMORY (from past sessions):\n" + "\n".join(f"• {l}" for l in lines)


def get_memory_summary(email: str) -> dict[str, Any]:
    """Return a clean summary dict for the parent dashboard / API."""
    memory = load_memory(email)
    total = memory["total_confused_events"]
    resolved = memory["total_resolved_events"]
    return {
        "total_sessions": memory["total_sessions"],
        "total_confused_events": total,
        "total_resolved_events": resolved,
        "resolution_rate": round(resolved / total * 100) if total > 0 else 0,
        "struggling_topics": memory["struggling_topics"][-5:],
        "mastered_topics": memory["mastered_topics"][-5:],
        "modality_success": memory["modality_success"],
        "adaptation_success": memory.get("adaptation_success", {}),
        "best_modality": max(memory["modality_success"], key=memory["modality_success"].get)
        if any(memory["modality_success"].values()) else "text",
        "recent_sessions": memory["recent_sessions"][-3:],
    }
