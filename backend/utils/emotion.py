"""
Emotion Detection via OpenAI Vision (gpt-4o-mini)
===================================================
Analyzes a child's facial expression from a webcam frame (base64 JPEG)
and returns structured emotion data that the Teaching Agent uses to
decide which learning modality to activate next.

No additional Python packages required — uses the OpenAI API already
configured in the project.
"""

from __future__ import annotations

import json
import os
from typing import TypedDict

from openai import OpenAI

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        from utils.secrets import get_secret
        api_key = get_secret("OPENAI_API_KEY", "")
        _client = OpenAI(api_key=api_key)
    return _client


EMOTION_SYSTEM_PROMPT = """You are an expert at reading facial expressions of children aged 8-12.
Analyze the image provided and return ONLY a JSON object with this exact format:
{
  "emotion": "<emotion>",
  "confidence": <0.0-1.0>,
  "understood": <true|false>,
  "description": "<one short phrase>"
}

Emotion values (pick exactly one):
- "happy"       → smiling, relaxed, engaged, nodding       → understood = true
- "focused"     → concentrating, attentive, leaning in     → understood = true
- "neutral"     → blank face, neither happy nor sad        → understood = false
- "confused"    → furrowed brows, head tilt, squinting     → understood = false
- "frustrated"  → upset, looking away, slouching, distressed → understood = false
- "no_face"     → cannot detect a clear face in the image  → understood = false

Be conservative: if unsure between confused and neutral, pick confused.
Return ONLY the JSON, no extra text."""


class EmotionResult(TypedDict):
    emotion: str
    confidence: float
    understood: bool
    description: str


def analyze_emotion(image_b64: str) -> EmotionResult:
    """
    Analyze facial expression from a base64-encoded JPEG image.

    Args:
        image_b64: Base64-encoded JPEG image string (from webcam frame).

    Returns:
        EmotionResult dict with keys: emotion, confidence, understood, description.
    """
    try:
        client = _get_client()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=120,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_b64}",
                                "detail": "low",   # cheap + fast, sufficient for expressions
                            },
                        },
                        {
                            "type": "text",
                            "text": EMOTION_SYSTEM_PROMPT,
                        },
                    ],
                }
            ],
        )
        result = json.loads(response.choices[0].message.content)
        # Validate required fields
        emotion = str(result.get("emotion", "neutral"))
        confidence = float(result.get("confidence", 0.5))
        understood = bool(result.get("understood", False))
        description = str(result.get("description", ""))
        return EmotionResult(
            emotion=emotion,
            confidence=confidence,
            understood=understood,
            description=description,
        )
    except Exception as exc:
        return EmotionResult(
            emotion="neutral",
            confidence=0.5,
            understood=False,
            description=f"Analysis error: {str(exc)[:60]}",
        )
