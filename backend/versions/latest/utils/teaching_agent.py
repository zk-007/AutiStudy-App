"""
Teaching Agent — Adaptive Modality State Machine
=================================================
This is the "brain" of the adaptive teaching system.

It tracks a student's emotional state over time and decides which
teaching MODALITY to use for the current response:

  MODALITY LADDER (escalates up when confused, de-escalates when understood)
  ──────────────────────────────────────────────────────────────────────────
  1. text            → plain text explanation (default, always first)
  2. text_image      → text + visual illustration / emoji counting
  3. text_image_voice→ text + image + voice narration (auto-spoken)
  4. step_by_step    → re-explain broken into numbered tiny steps

  RULES
  ─────
  • After 2 consecutive "confused/frustrated" reads  → escalate one level up
  • After 3 consecutive "happy/focused" reads        → de-escalate one level down
  • "neutral" and "no_face" reads do NOT change the counters
  • Each session gets its own independent AgentState (in-memory, keyed by session_id)
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Literal

Modality = Literal["text", "text_image", "text_image_voice", "step_by_step"]

MODALITY_LADDER: list[Modality] = [
    "text",
    "text_image",
    "text_image_voice",
    "step_by_step",
]

MODALITY_LABELS = {
    "text": "Text only",
    "text_image": "Text + Illustration",
    "text_image_voice": "Text + Image + Voice",
    "step_by_step": "Step-by-step breakdown",
}

EMOTION_EMOJIS = {
    "happy": "😊",
    "focused": "🧐",
    "neutral": "😐",
    "confused": "😕",
    "frustrated": "😣",
    "no_face": "📷",
}


@dataclass
class AgentState:
    session_id: str
    modality: Modality = "text"
    emotion_history: Deque[dict] = field(default_factory=lambda: deque(maxlen=10))
    consecutive_confused: int = 0
    consecutive_understood: int = 0

    # How many times each modality was triggered this session
    escalation_count: int = 0
    de_escalation_count: int = 0

    def record_emotion(self, emotion_result: dict) -> dict:
        """
        Record a new emotion reading and decide whether to change modality.

        Returns a dict describing what happened:
          {
            "modality": str,            ← current modality after this reading
            "action": str,              ← "stay" | "escalated_to_X" | "de_escalated_to_X"
            "emotion": str,
            "understood": bool,
            "consecutive_confused": int,
            "consecutive_understood": int,
            "modality_label": str,      ← human-readable modality name
            "emotion_emoji": str,
          }
        """
        self.emotion_history.append(emotion_result)

        emotion = emotion_result.get("emotion", "neutral")
        understood = emotion_result.get("understood", False)

        # Update consecutive counters
        if understood:
            # happy or focused
            self.consecutive_confused = 0
            self.consecutive_understood += 1
        elif emotion in ("confused", "frustrated", "sad"):
            self.consecutive_confused += 1
            self.consecutive_understood = 0
        # neutral / no_face → leave counters unchanged

        # Decide action
        action = "stay"
        if self.consecutive_confused >= 2:
            action = self._escalate()
            self.consecutive_confused = 0      # reset after acting
        elif self.consecutive_understood >= 3:
            action = self._de_escalate()
            self.consecutive_understood = 0    # reset after acting

        return {
            "modality": self.modality,
            "action": action,
            "emotion": emotion,
            "understood": understood,
            "consecutive_confused": self.consecutive_confused,
            "consecutive_understood": self.consecutive_understood,
            "modality_label": MODALITY_LABELS[self.modality],
            "emotion_emoji": EMOTION_EMOJIS.get(emotion, "❓"),
        }

    def _escalate(self) -> str:
        idx = MODALITY_LADDER.index(self.modality)
        if idx < len(MODALITY_LADDER) - 1:
            self.modality = MODALITY_LADDER[idx + 1]
            self.escalation_count += 1
            return f"escalated_to_{self.modality}"
        return "at_max_modality"

    def _de_escalate(self) -> str:
        idx = MODALITY_LADDER.index(self.modality)
        if idx > 0:
            self.modality = MODALITY_LADDER[idx - 1]
            self.de_escalation_count += 1
            return f"de_escalated_to_{self.modality}"
        return "at_min_modality"

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "modality": self.modality,
            "modality_label": MODALITY_LABELS[self.modality],
            "consecutive_confused": self.consecutive_confused,
            "consecutive_understood": self.consecutive_understood,
            "escalation_count": self.escalation_count,
            "de_escalation_count": self.de_escalation_count,
            "emotion_history": list(self.emotion_history),
        }


# ── In-memory store (session_id → AgentState) ────────────────────────────────
_agent_states: Dict[str, AgentState] = {}


def get_or_create_state(session_id: str) -> AgentState:
    """Return existing state for this session, or create a fresh one."""
    if session_id not in _agent_states:
        _agent_states[session_id] = AgentState(session_id=session_id)
    return _agent_states[session_id]


def reset_state(session_id: str) -> None:
    """Clear the agent state for a session (called when chat ends/resets)."""
    _agent_states.pop(session_id, None)


def get_state(session_id: str) -> dict | None:
    """Return the current state dict, or None if no state exists."""
    state = _agent_states.get(session_id)
    return state.to_dict() if state else None


def force_modality(session_id: str, modality: Modality) -> dict:
    """Manually override modality (e.g. teacher/parent intervention)."""
    state = get_or_create_state(session_id)
    state.modality = modality
    state.consecutive_confused = 0
    state.consecutive_understood = 0
    return state.to_dict()
