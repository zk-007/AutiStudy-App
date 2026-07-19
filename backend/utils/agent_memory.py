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
        # Declared learner profile — collected ONCE at onboarding (Gap #2:
        # Persistent Learner Profile). Unlike everything else in this file,
        # these fields are explicitly stated by the student, not inferred
        # from usage. get_memory_context() surfaces this first so the
        # Media Agent / Adaptive Decision Engine treats it as ground truth.
        "learner_profile": {
            "onboarding_completed": False,
            "learning_style": None,       # "visual" | "audio" | "text" | "mixed"
            "preferred_language": None,   # "en" | "ur"
            "audio_preference": None,     # "auto" | "manual"
            "sensory_preference": None,   # "calm" | "standard" (animations/motion)
            "explanation_style": None,    # "step_by_step" | "concise"
            "updated_at": None,
        },
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
        # Per-subject adaptation ladder losses (step shown, student still confused)
        "adaptation_failure": {},  # {"Maths": {"image": 2}}
        # Every explanation-format delivery + outcome, used to score which
        # format to try first next time (recent > total > CV expression).
        # [{"subject", "modality", "feedback": "up"/"down", "expression", "timestamp"}]
        "modality_feedback_log": [],
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


# ── Declared learner profile (one-time onboarding) ────────────────────────────

VALID_LEARNING_STYLES = {"visual", "audio", "text", "mixed"}
VALID_LANGUAGES = {"en", "ur"}
VALID_AUDIO_PREFS = {"auto", "manual"}
VALID_SENSORY_PREFS = {"calm", "standard"}
VALID_EXPLANATION_STYLES = {"step_by_step", "concise"}


def get_learner_profile(email: str) -> dict:
    """Return the declared learner profile (onboarding answers)."""
    memory = load_memory(email)
    return memory.get("learner_profile", _default_memory(email)["learner_profile"])


def save_learner_profile(
    email: str,
    *,
    learning_style: str,
    preferred_language: str,
    audio_preference: str,
    sensory_preference: str,
    explanation_style: str,
) -> dict:
    """
    Save the one-time onboarding answers. Called once, right after signup.
    These become part of the permanent learner profile the Media Agent reads.

    Onboarding is a deliberate, fresh signal about how this student learns —
    it should win on the very next question. Any older per-subject ladder
    history (from before this onboarding) is cleared so it can't silently
    override the just-chosen preference; new Got it/Not yet feedback after
    this point still builds up and takes priority exactly as before.
    """
    memory = load_memory(email)
    memory["learner_profile"] = {
        "onboarding_completed": True,
        "learning_style": learning_style if learning_style in VALID_LEARNING_STYLES else "mixed",
        "preferred_language": preferred_language if preferred_language in VALID_LANGUAGES else "en",
        "audio_preference": audio_preference if audio_preference in VALID_AUDIO_PREFS else "manual",
        "sensory_preference": sensory_preference if sensory_preference in VALID_SENSORY_PREFS else "standard",
        "explanation_style": explanation_style if explanation_style in VALID_EXPLANATION_STYLES else "step_by_step",
        "updated_at": datetime.now().isoformat(),
    }
    memory["adaptation_success"] = {}
    memory["adaptation_failure"] = {}
    memory["adaptation_meta"] = {}
    memory["modality_feedback_log"] = []
    save_memory(email, memory)
    return memory["learner_profile"]


def update_audio_preference(email: str, audio_preference: str) -> dict:
    """Update only narration control preference (Gap 6 — learner audio control)."""
    memory = load_memory(email)
    profile = memory.get("learner_profile", _default_memory(email)["learner_profile"])
    profile["audio_preference"] = (
        audio_preference if audio_preference in VALID_AUDIO_PREFS else "manual"
    )
    profile["updated_at"] = datetime.now().isoformat()
    memory["learner_profile"] = profile
    save_memory(email, memory)
    return profile


def _describe_learner_profile(profile: dict) -> str | None:
    """Human-readable one-liner for the agent's system prompt / memory context."""
    if not profile.get("onboarding_completed"):
        return None

    style_labels = {
        "visual": "prefers visual explanations (pictures/diagrams)",
        "audio": "prefers audio/read-aloud explanations",
        "text": "prefers plain text explanations",
        "mixed": "has no strong preference — likes a mix of text, visuals, and audio",
    }
    explanation_labels = {
        "step_by_step": "wants explanations broken into small numbered steps",
        "concise": "prefers short, concise explanations (no unnecessary detail)",
    }
    language_labels = {"en": "English", "ur": "Urdu"}

    parts = [
        style_labels.get(profile.get("learning_style"), ""),
        explanation_labels.get(profile.get("explanation_style"), ""),
        f"preferred language: {language_labels.get(profile.get('preferred_language'), 'English')}",
    ]
    if profile.get("audio_preference") == "auto":
        parts.append("okay with audio playing automatically")
    else:
        parts.append("prefers to manually start/stop audio narration")
    if profile.get("sensory_preference") == "calm":
        parts.append("sensitive to motion/animation — keep transitions calm and minimal")

    return "This student told us at signup: " + "; ".join(p for p in parts if p) + "."


# ── Personalized adaptation ladder (comprehension popup flow) ─────────────────

DEFAULT_LADDER_ORDER = [1, 2, 3, 4, 5]

ADAPTATION_TO_ROUND: dict[str, int] = {
    "step_by_step": 1,
    "read_aloud": 2,
    "image": 3,
    "mcq_recall": 4,
    "breathing": 5,
}

# CV expression → positivity (0-1). Used as the smallest-weight signal in
# the modality preference score — a supporting hint only, never decisive.
EXPRESSION_POSITIVITY: dict[str, float] = {
    "happy": 1.0,
    "neutral": 0.5,
    "bored": 0.3,
    "tired": 0.25,
    "inattentive": 0.25,
    "confused": 0.25,
    "sad": 0.2,
    "frustrated": 0.15,
}

MODALITY_FEEDBACK_LOG_CAP = 300

# Weighted score: recent success > total success count > CV expression.
RECENCY_WEIGHT = 0.55
TOTAL_WEIGHT = 0.35
EXPRESSION_WEIGHT = 0.10
RECENCY_HALF_LIFE_HOURS = 12.0


def _log_modality_feedback(
    memory: dict,
    subject: str,
    modality: str,
    feedback: str,  # "up" | "down"
    expression: str | None,
) -> None:
    """Append one delivery outcome — the raw data the scoring function reads."""
    log = memory.setdefault("modality_feedback_log", [])
    log.append({
        "subject": subject,
        "modality": modality,
        "feedback": feedback,
        "expression": expression,
        "timestamp": datetime.now().isoformat(),
    })
    if len(log) > MODALITY_FEEDBACK_LOG_CAP:
        del log[: len(log) - MODALITY_FEEDBACK_LOG_CAP]


def record_adaptation_preference(
    email: str,
    subject: str,
    adaptation: str,
    *,
    via: str = "popup_yes",
    happy_cv: bool = False,
    expression: str | None = None,
) -> None:
    """Remember which help step worked when the student confirmed understanding."""
    memory = load_memory(email)
    _log_modality_feedback(memory, subject, adaptation, "up", expression)

    # Plain-text wins — remember for next question (not a ladder round).
    if adaptation == "simple_text":
        memory.setdefault("adaptation_meta", {})
        memory["adaptation_meta"][subject] = {
            "last_adaptation": "simple_text",
            "last_via": via,
            "last_happy_cv": happy_cv,
            "last_at": datetime.now().isoformat(),
        }
        save_memory(email, memory)
        return

    if adaptation not in ADAPTATION_TO_ROUND:
        save_memory(email, memory)
        return
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


def record_adaptation_failure(
    email: str,
    subject: str,
    adaptation: str,
    *,
    expression: str | None = None,
) -> None:
    """
    Remember that a help step was tried and did NOT work (student stayed on the
    ladder / said "not yet" after seeing it). Gap #5 — "No Learning From
    Feedback": previously only successes were recorded, so a strategy that
    consistently failed for a student was still tried first just as often as
    one that never failed. get_adaptation_ladder_order() below now nets
    success − failure so repeatedly-failing strategies sink in the order.
    """
    memory = load_memory(email)
    _log_modality_feedback(memory, subject, adaptation, "down", expression)

    if adaptation not in ADAPTATION_TO_ROUND:
        save_memory(email, memory)
        return

    memory.setdefault("adaptation_failure", {})
    memory["adaptation_failure"].setdefault(subject, {})
    bucket = memory["adaptation_failure"][subject]
    bucket[adaptation] = bucket.get(adaptation, 0) + 1
    save_memory(email, memory)


def _recency_score(last_ts_iso: str | None) -> float:
    """0-1, decaying by half every RECENCY_HALF_LIFE_HOURS since the event."""
    if not last_ts_iso:
        return 0.0
    try:
        last = datetime.fromisoformat(last_ts_iso)
    except (TypeError, ValueError):
        return 0.0
    hours = max(0.0, (datetime.now() - last).total_seconds() / 3600.0)
    return 0.5 ** (hours / RECENCY_HALF_LIFE_HOURS)


def compute_modality_scores(email: str, subject: str) -> dict[str, dict]:
    """
    Score every teaching format tried for this subject:
      score = 0.55 * recency(most recent 👍) + 0.35 * total 👍 (normalised)
              + 0.10 * average CV expression positivity

    Recent feedback dominates, total success count supports it, and the
    detected expression is a light supporting signal — never decisive.
    """
    memory = load_memory(email)
    log = [e for e in memory.get("modality_feedback_log", []) if e.get("subject") == subject]
    if not log:
        return {}

    by_modality: dict[str, list[dict]] = {}
    for entry in log:
        by_modality.setdefault(entry["modality"], []).append(entry)

    up_counts = {
        m: sum(1 for e in es if e.get("feedback") == "up") for m, es in by_modality.items()
    }
    max_up = max(up_counts.values()) if up_counts else 0

    latest_up_ts: dict[str, str | None] = {}
    for m, es in by_modality.items():
        ups = [e["timestamp"] for e in es if e.get("feedback") == "up" and e.get("timestamp")]
        latest_up_ts[m] = max(ups) if ups else None

    scores: dict[str, dict] = {}
    for m, es in by_modality.items():
        recency = _recency_score(latest_up_ts.get(m))
        total = (up_counts.get(m, 0) / max_up) if max_up else 0.0
        expr_vals = [
            EXPRESSION_POSITIVITY[e["expression"]]
            for e in es
            if e.get("expression") in EXPRESSION_POSITIVITY
        ]
        expression = (sum(expr_vals) / len(expr_vals)) if expr_vals else 0.5
        combined = (
            RECENCY_WEIGHT * recency + TOTAL_WEIGHT * total + EXPRESSION_WEIGHT * expression
        )
        scores[m] = {
            "recency": round(recency, 3),
            "total": round(total, 3),
            "expression": round(expression, 3),
            "score": round(combined, 3),
            "up_count": up_counts.get(m, 0),
            "event_count": len(es),
        }
    return scores


def _ladder_from_preferred(preferred_round: int, demoted: set[int]) -> list[int]:
    """Build ladder with preferred round first; negative-net steps sink to the end."""
    remaining = [r for r in DEFAULT_LADDER_ORDER if r != preferred_round and r not in demoted]
    demoted_ordered = [r for r in DEFAULT_LADDER_ORDER if r in demoted and r != preferred_round]
    return [preferred_round] + remaining + demoted_ordered


def get_adaptation_ladder_order(email: str, subject: str) -> list[int]:
    """
    Return help-ladder round order for this student + subject.
    Ranks by NET score (successes − failures) so a strategy that keeps
    failing this student gets pushed down even if it once succeeded.

    When every strategy has net ≤ 0 (common after ladder testing — many 👎
    clicks while advancing), fall back to the most recent 👍 winner
    (adaptation_meta.last_adaptation) so the step that last worked is still
    tried first on the next question.
    """
    memory = load_memory(email)
    successes: dict = memory.get("adaptation_success", {}).get(subject, {})
    failures: dict = memory.get("adaptation_failure", {}).get(subject, {})
    if not successes and not failures:
        return list(DEFAULT_LADDER_ORDER)

    adaptations = set(successes) | set(failures)
    net_scores = {
        a: successes.get(a, 0) - failures.get(a, 0) for a in adaptations
    }
    demoted = {
        ADAPTATION_TO_ROUND[a] for a, score in net_scores.items() if score < 0
    }

    preferred_adaptation: str | None = None
    best_adaptation = max(net_scores, key=lambda k: net_scores[k])
    if net_scores[best_adaptation] > 0:
        preferred_adaptation = best_adaptation
    else:
        meta = memory.get("adaptation_meta", {}).get(subject, {})
        last = meta.get("last_adaptation")
        if last and last in ADAPTATION_TO_ROUND and successes.get(last, 0) > 0:
            preferred_adaptation = last

    if preferred_adaptation is None:
        return list(DEFAULT_LADDER_ORDER)

    preferred_round = ADAPTATION_TO_ROUND[preferred_adaptation]
    return _ladder_from_preferred(preferred_round, demoted)


def adaptation_to_teaching_modality(adaptation: str | None) -> str | None:
    """Map stored adaptation key → frontend teaching modality."""
    mapping = {
        "simple_text": "simple_text",
        "step_by_step": "step_by_step",
        "read_aloud": "read_aloud",
        "image": "image",
    }
    return mapping.get(adaptation or "")


def get_current_preferred_modality(email: str, subject: str) -> str | None:
    """
    Best modality to try first on the next question — a weighted score of:
      1. Recency of the most recent 👍 for that format (highest weight)
      2. Total 👍 count for that format (medium weight)
      3. Average CV expression positivity while it was shown (lowest weight)

    Falls back to None (→ onboarding profile default) when there's no
    feedback history yet for this subject.
    """
    scores = compute_modality_scores(email, subject)
    if not scores:
        return None
    best = max(scores, key=lambda m: scores[m]["score"])
    return best


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


# ── Adaptive revision (Gap 5 — doc Problem 9 / Revision Strategy) ────────────

REVISION_ACTIVITIES = ("one_question", "matching", "step_recap", "fill_blank")


def _topic_matches(topic: str, candidates: list[str]) -> bool:
    """Loose match — topic substring either way."""
    if not topic or not candidates:
        return False
    t = topic.strip().lower()
    for c in candidates:
        cl = (c or "").strip().lower()
        if not cl:
            continue
        if t in cl or cl in t:
            return True
    return False


def _pick_revision_activity(profile: dict) -> str:
    """Map learner profile → revision activity type (doc: flashcards, matching, quiz, recap)."""
    style = profile.get("learning_style") or "mixed"
    expl = profile.get("explanation_style") or "step_by_step"
    if style == "visual":
        return "matching"
    if style == "audio":
        return "one_question"
    if expl == "step_by_step":
        return "step_recap"
    if expl == "concise":
        return "one_question"
    return "one_question"


def evaluate_revision_need(email: str, subject: str, topic: str = "") -> dict:
    """
    Decide whether a revision activity is warranted for this question/subject.
    Doc: do NOT auto-ask "Do you remember what you studied last time?" every time —
    only when memory signals the learner likely needs a recap on THIS topic.
    """
    memory = load_memory(email)
    profile = memory.get("learner_profile", {})
    topic_hint = (topic or "").strip()[:80]

    if topic_hint and _topic_matches(topic_hint, memory.get("mastered_topics", [])):
        return {"needed": False, "activity": None, "reason": "topic_mastered"}

    failures: dict = memory.get("adaptation_failure", {}).get(subject, {})
    total_failures = sum(failures.values()) if failures else 0

    recent = memory.get("recent_sessions", [])
    recent_stuck = any(
        s.get("subject") == subject and s.get("outcome") == "stuck"
        for s in recent[-3:]
    )

    struggling = memory.get("struggling_topics", [])
    topic_struggling = bool(topic_hint and _topic_matches(topic_hint, struggling))

    needed = bool(topic_struggling or recent_stuck or total_failures >= 2)

    if not needed:
        return {"needed": False, "activity": None, "reason": "no_revision_signals"}

    activity = _pick_revision_activity(profile)
    if activity not in REVISION_ACTIVITIES:
        activity = "one_question"

    if topic_struggling:
        reason = "struggling_topic"
    elif recent_stuck:
        reason = "recent_stuck_session"
    else:
        reason = "help_steps_failed"

    return {"needed": True, "activity": activity, "reason": reason}


def get_memory_context(email: str, subject: str) -> str:
    """
    Build a memory context string to inject into the agent's system prompt.
    Tells the agent what it already knows about this student.
    """
    memory = load_memory(email)

    lines = []

    # Declared profile FIRST — this is ground truth stated by the student,
    # not inferred from behaviour, so the agent should weigh it most heavily.
    profile_line = _describe_learner_profile(memory.get("learner_profile", {}))
    if profile_line:
        lines.append(profile_line)

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
        "learner_profile": memory.get("learner_profile", {}),
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
        "adaptation_failure": memory.get("adaptation_failure", {}),
    }
