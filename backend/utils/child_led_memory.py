"""
Child-Led Adaptive Multimodal memory (v2).
Stores learning preference order, modality scores, and interaction log.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from utils.agent_memory import load_memory, save_memory

Modality = Literal["text", "voice", "image", "steps"]
Feedback = Literal["up", "down"]

DEFAULT_MODALITY_ORDER: list[str] = ["text", "image", "voice", "steps"]

SCORE_THUMBS_UP = 3.0
SCORE_THUMBS_DOWN = -2.0
SCORE_CHILD_SELECTED = 1.0
SCORE_MEDIA_POS = 0.3
SCORE_MEDIA_NEG = -0.3

RECENT_WINDOW = 5
RECENT_WEIGHT = 0.6
HISTORY_WEIGHT = 0.4


def _ensure_child_led(memory: dict) -> dict:
    memory.setdefault("child_led", {})
    cl = memory["child_led"]
    cl.setdefault("setup_complete", False)
    cl.setdefault("modality_order", list(DEFAULT_MODALITY_ORDER))
    cl.setdefault("modality_scores", {m: 0.0 for m in DEFAULT_MODALITY_ORDER})
    cl.setdefault("interactions", [])
    cl.setdefault("recent_modality_scores", {m: 0.0 for m in DEFAULT_MODALITY_ORDER})
    return cl


def get_learning_preferences(email: str) -> dict[str, Any]:
    memory = load_memory(email)
    cl = _ensure_child_led(memory)
    return {
        "setup_complete": bool(cl.get("setup_complete")),
        "modality_order": list(cl.get("modality_order") or DEFAULT_MODALITY_ORDER),
        "modality_scores": dict(cl.get("modality_scores") or {}),
        "effective_order": get_effective_modality_order(email),
    }


def save_learning_preferences(email: str, modality_order: list[str]) -> dict[str, Any]:
    valid = [m for m in modality_order if m in DEFAULT_MODALITY_ORDER]
    seen: set[str] = set()
    ordered: list[str] = []
    for m in valid:
        if m not in seen:
            seen.add(m)
            ordered.append(m)
    for m in DEFAULT_MODALITY_ORDER:
        if m not in seen:
            ordered.append(m)

    memory = load_memory(email)
    cl = _ensure_child_led(memory)
    cl["modality_order"] = ordered
    cl["setup_complete"] = True
    save_memory(email, memory)
    return get_learning_preferences(email)


def get_effective_modality_order(email: str) -> list[str]:
    """Blend saved preference with recent + overall modality scores."""
    memory = load_memory(email)
    cl = _ensure_child_led(memory)
    base = list(cl.get("modality_order") or DEFAULT_MODALITY_ORDER)
    overall = cl.get("modality_scores") or {}
    recent = cl.get("recent_modality_scores") or {}

    def blended(m: str) -> float:
        o = float(overall.get(m, 0))
        r = float(recent.get(m, 0))
        return r * RECENT_WEIGHT + o * HISTORY_WEIGHT

    ranked = sorted(base, key=lambda m: (-blended(m), base.index(m)))
    return ranked


def record_child_led_feedback(
    email: str,
    *,
    question: str,
    subject: str,
    modality: str,
    feedback: Feedback,
    child_selected: bool = False,
    media_signal: str | None = None,
    skipped: bool = False,
    break_after_fail: bool = False,
) -> dict[str, Any]:
    memory = load_memory(email)
    cl = _ensure_child_led(memory)

    delta = SCORE_THUMBS_UP if feedback == "up" else SCORE_THUMBS_DOWN
    if child_selected:
        delta += SCORE_CHILD_SELECTED
    if media_signal == "positive":
        delta += SCORE_MEDIA_POS
    elif media_signal == "negative":
        delta += SCORE_MEDIA_NEG

    scores = cl.setdefault("modality_scores", {m: 0.0 for m in DEFAULT_MODALITY_ORDER})
    recent = cl.setdefault("recent_modality_scores", {m: 0.0 for m in DEFAULT_MODALITY_ORDER})
    if modality in scores:
        scores[modality] = float(scores.get(modality, 0)) + delta
        recent[modality] = float(recent.get(modality, 0)) + delta

    entry = {
        "at": datetime.now().isoformat(),
        "question": (question or "")[:300],
        "subject": subject,
        "modality": modality,
        "feedback": feedback,
        "child_selected": child_selected,
        "media_signal": media_signal,
        "skipped": skipped,
        "break_after_fail": break_after_fail,
        "score_delta": delta,
    }
    interactions: list = cl.setdefault("interactions", [])
    interactions.append(entry)
    cl["interactions"] = interactions[-100:]

    save_memory(email, memory)
    return get_learning_preferences(email)
