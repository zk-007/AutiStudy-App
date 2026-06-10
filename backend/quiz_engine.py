"""
Quiz Engine for AutiStudy
=========================
Generates grade-appropriate multiple-choice questions using GPT-4o-mini.
Questions are structured, autistic-friendly (clear language, no ambiguity),
and aligned to the curriculum subjects per grade.
"""

from __future__ import annotations

import json
import re
from typing import List, Dict, Optional

# Subject configs per grade
GRADE_SUBJECTS = {
    4: ["Maths", "General Science"],
    5: ["Maths", "General Science"],
    6: ["Maths", "General Science", "Computer Science"],
    7: ["Maths", "General Science", "Computer Science"],
    8: ["Maths", "General Science", "Computer Science"],
}

_SYSTEM_PROMPT = """You are a friendly quiz generator for an educational app for students with autism.

RULES:
- Use simple, clear, unambiguous language — no idioms or metaphors
- Questions must match the student's grade level exactly
- Always provide exactly 4 answer options (A, B, C, D)
- One option is clearly correct; the other three are plausible but wrong
- Include a short, encouraging explanation for the correct answer (1-2 sentences)
- Topics must be curriculum-appropriate for the grade and subject

RESPONSE FORMAT — return ONLY valid JSON, no markdown, no extra text:
{
  "questions": [
    {
      "question": "What is 6 × 7?",
      "options": ["42", "48", "36", "54"],
      "correct": "42",
      "explanation": "6 × 7 = 42. You can count by 7s: 7, 14, 21, 28, 35, 42!"
    }
  ]
}"""


def _build_prompt(grade: int, subject: str, num_questions: int, topic: Optional[str]) -> str:
    topic_line = f" Focus on the topic: {topic}." if topic else ""
    return (
        f"Generate {num_questions} multiple-choice questions for a Grade {grade} student "
        f"studying {subject}.{topic_line}\n\n"
        f"Make the questions engaging, varied in difficulty (mix easy, medium, hard), "
        f"and appropriate for a child aged {grade + 5}-{grade + 6} years."
    )


def generate_quiz_questions(
    grade: int,
    subject: str,
    num_questions: int = 5,
    topic: Optional[str] = None,
) -> Optional[List[Dict]]:
    """
    Generate quiz questions using GPT-4o-mini.
    Returns a list of question dicts or None on failure.
    """
    try:
        from utils.llm import get_openai_client
        client = get_openai_client()
        if not client:
            return None

        prompt = _build_prompt(grade, subject, num_questions, topic)

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
            max_tokens=1800,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content or ""
        data = json.loads(raw)
        questions = data.get("questions", [])

        # Validate structure
        valid = []
        for q in questions:
            if (
                isinstance(q, dict)
                and q.get("question")
                and isinstance(q.get("options"), list)
                and len(q["options"]) == 4
                and q.get("correct")
                and q.get("explanation")
                and q["correct"] in q["options"]
            ):
                valid.append(q)

        return valid if valid else None

    except Exception as exc:
        print(f"[quiz_engine] generation failed: {exc}")
        return None


_CHAPTER_QUIZ_SYSTEM = """You are a quiz generator for an educational app for students with autism.

A student is studying a textbook chapter. Generate quiz questions based ONLY on the content provided.

RULES:
- Questions must come directly from the chapter text — no outside knowledge
- Use simple, clear, unambiguous language — no idioms or metaphors
- Exactly 4 answer options per question
- One clearly correct answer; three plausible but wrong distractors
- Short encouraging explanation for the correct answer (1-2 sentences)
- Match the student's grade level

RESPONSE FORMAT — return ONLY valid JSON:
{
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correct": "...",
      "explanation": "..."
    }
  ]
}"""


def generate_quiz_from_chapter_content(
    grade: int,
    subject: str,
    chapter_title: str,
    chapter_content: str,
    num_questions: int = 5,
) -> Optional[List[Dict]]:
    """Generate quiz questions from a specific textbook chapter's content."""
    try:
        from utils.llm import get_openai_client
        client = get_openai_client()
        if not client:
            return None

        user_prompt = (
            f"Grade: {grade} | Subject: {subject} | Chapter: {chapter_title}\n\n"
            f"CHAPTER CONTENT:\n{chapter_content}\n\n"
            f"Generate {num_questions} quiz questions based ONLY on this chapter."
        )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _CHAPTER_QUIZ_SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=1800,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content or ""
        data = json.loads(raw)
        questions = data.get("questions", [])

        valid = []
        for q in questions:
            if (
                isinstance(q, dict)
                and q.get("question")
                and isinstance(q.get("options"), list)
                and len(q["options"]) == 4
                and q.get("correct")
                and q.get("explanation")
                and q["correct"] in q["options"]
            ):
                valid.append(q)

        return valid if valid else None

    except Exception as exc:
        print(f"[quiz_engine] chapter quiz generation failed: {exc}")
        return None


_CHAT_QUIZ_SYSTEM = """You are a quiz generator for an educational app for students with autism.

A student just had a tutoring session. Read their conversation and create quiz questions
that test whether they understood the key concepts discussed.

RULES:
- Questions must be DIRECTLY based on what was discussed in the chat — nothing outside it
- Use simple, clear, unambiguous language — no idioms or metaphors
- Exactly 4 answer options per question
- One clearly correct answer; three plausible but wrong distractors
- Short encouraging explanation for the correct answer (1-2 sentences)
- Match the student's grade level

RESPONSE FORMAT — return ONLY valid JSON:
{
  "topic_summary": "Brief title of what was learned (e.g. 'Addition of small numbers')",
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correct": "...",
      "explanation": "..."
    }
  ]
}"""


def generate_quiz_from_chat(
    grade: int,
    subject: str,
    chat_history: List[Dict],
    num_questions: int = 5,
) -> Optional[Dict]:
    """
    Generate a quiz specifically based on the topics discussed in a chat session.

    Args:
        grade: Student's grade (e.g. 4)
        subject: Subject of the chat (e.g. "Maths")
        chat_history: List of {"role": "user"|"assistant", "content": "..."} dicts
        num_questions: How many questions to generate

    Returns:
        Dict with "topic_summary" and "questions" list, or None on failure.
    """
    try:
        from utils.llm import get_openai_client
        client = get_openai_client()
        if not client:
            return None

        # Build a readable transcript from the last 20 messages (to stay within token limits)
        recent = [m for m in chat_history if m.get("role") in ("user", "assistant")][-20:]
        transcript_lines = []
        for m in recent:
            role = "Student" if m["role"] == "user" else "Tutor"
            content = (m.get("content") or "").strip()
            if content:
                transcript_lines.append(f"{role}: {content}")
        transcript = "\n".join(transcript_lines)

        if not transcript:
            return None

        user_prompt = (
            f"Grade: {grade} | Subject: {subject}\n\n"
            f"CHAT TRANSCRIPT:\n{transcript}\n\n"
            f"Generate {num_questions} quiz questions based ONLY on the topics in this chat."
        )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _CHAT_QUIZ_SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=1800,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content or ""
        data = json.loads(raw)
        questions = data.get("questions", [])

        # Validate
        valid = []
        for q in questions:
            if (
                isinstance(q, dict)
                and q.get("question")
                and isinstance(q.get("options"), list)
                and len(q["options"]) == 4
                and q.get("correct")
                and q.get("explanation")
                and q["correct"] in q["options"]
            ):
                valid.append(q)

        if not valid:
            return None

        return {
            "topic_summary": data.get("topic_summary", subject),
            "questions": valid,
        }

    except Exception as exc:
        print(f"[quiz_engine] chat quiz generation failed: {exc}")
        return None
