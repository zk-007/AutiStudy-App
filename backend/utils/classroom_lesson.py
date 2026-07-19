"""
Blackboard classroom lesson generator — Scene Planner Phase 1.
=============================================================

Turns a child's question into topic-specific diagram steps + voice script.
Same question on retry → different teaching style + different diagram (never new topic).

Public API:
  generate_classroom_lesson(question, grade, subject, retry_count, language, attempt_history)
"""

from __future__ import annotations

import json
import re
from fractions import Fraction
from typing import Any, Dict, List, Optional, Tuple

from utils.llm import get_openai_client

# Teaching ladder — each retry uses the NEXT unused style for the SAME concept.
TEACHING_STRATEGIES = [
    "definition",
    "real_life",
    "story",
    "diagram",
    "step_by_step",
]

DIAGRAM_BY_STRATEGY = {
    "definition": "write_heavy",
    "real_life": "real_world_objects",
    "story": "story_sequence",
    "diagram": "topic_diagram",
    "step_by_step": "step_breakdown",
}

CLASSROOM_SYSTEM_PROMPT = """You are a Scene Planner for an autism-friendly visual teacher.
The student asked ONE specific question. You must plan chalk-board scenes for THAT question only.

Return ONLY valid JSON:
{
  "title": "short title",
  "concept": "locked concept id (e.g. earth_layers, fraction_3_4, photosynthesis)",
  "teaching_style": "definition|real_life|story|diagram|step_by_step",
  "voice_script": "2-4 warm sentences matching the visuals",
  "analogy": "pizza|apples|chocolate|stars|water",
  "steps": [
    {"action": "write", "text": "...", "x": 60, "y": 50, "size": 28},
    {"action": "drawDiagram", "diagram": "earth_layers", "cx": 400, "cy": 240, "labels": ["Crust","Mantle","Core"]},
    {"action": "drawDiagram", "diagram": "pie_fraction", "numerator": 3, "denominator": 4, "cx": 400, "cy": 220},
    {"action": "drawDiagram", "diagram": "bar_fraction", "numerator": 3, "denominator": 4},
    {"action": "drawDiagram", "diagram": "water_cycle", "cx": 400, "cy": 240},
    {"action": "drawGroups", "groups": [{"count": 3}], "emoji": "🍎"},
    {"action": "drawDivision", "dividend": 24, "divisor": 3, "quotient": 8},
    {"action": "pause", "ms": 600}
  ]
}

Rules:
- Canvas 800x480. MUST use drawDiagram when the topic has a known diagram (earth, fractions, water).
- On RETRY: SAME concept, DIFFERENT diagram type and simpler words. Never change the topic.
- 4-8 steps. voice_script must describe what is drawn.
- JSON only, no markdown.
"""


def _extract_json(text: str) -> Dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(0))
    raise ValueError("No JSON object in model response")


def _pick_strategy(retry_count: int, attempt_history: List[Dict[str, Any]]) -> str:
    return TEACHING_STRATEGIES[min(retry_count, len(TEACHING_STRATEGIES) - 1)]


def _format_attempt_history(attempt_history: List[Dict[str, Any]]) -> str:
    if not attempt_history:
        return ""
    lines = ["Previous attempts on THIS SAME question (do NOT change topic):"]
    for i, a in enumerate(attempt_history, 1):
        style = a.get("teaching_style", "?")
        diagram = a.get("diagram", "?")
        lines.append(f"  Attempt {i}: style={style}, diagram={diagram} — student did NOT understand")
    lines.append("Use a DIFFERENT teaching_style and DIFFERENT diagram. Same concept only.")
    return "\n".join(lines)


def _parse_simple_arithmetic(question: str) -> Optional[Tuple[str, int, int, int]]:
    q = question.lower().replace("×", "x").replace("÷", "/")
    q = re.sub(r"\s+", " ", q).strip()
    patterns = [
        (r"(?:what\s+is\s+)?(\d+)\s*\+\s*(\d+)", "+"),
        (r"(?:what\s+is\s+)?(\d+)\s*plus\s+(\d+)", "+"),
        (r"(?:what\s+is\s+)?(\d+)\s*-\s*(\d+)", "-"),
        (r"(?:what\s+is\s+)?(\d+)\s*minus\s+(\d+)", "-"),
        (r"(?:what\s+is\s+)?(\d+)\s*[x*]\s*(\d+)", "*"),
        (r"(?:what\s+is\s+)?(\d+)\s*times\s+(\d+)", "*"),
        (r"(?:what\s+is\s+)?(\d+)\s*/\s*(\d+)", "/"),
        (r"(?:what\s+is\s+)?(\d+)\s*divided\s+by\s+(\d+)", "/"),
    ]
    for pat, op in patterns:
        m = re.search(pat, q)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if op == "+":
                return op, a, b, a + b
            if op == "-":
                return op, a, b, a - b
            if op == "*":
                return op, a, b, a * b
            if op == "/" and b != 0 and a % b == 0:
                return op, a, b, a // b
    return None


def _parse_fraction(question: str) -> Optional[Tuple[int, int]]:
    q = question.lower()
    m = re.search(r"(\d+)\s*/\s*(\d+)", q)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"(\d+)\s*out\s+of\s+(\d+)", q)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None


def _is_earth_question(question: str) -> bool:
    q = question.lower()
    keys = ("earth", "crust", "mantle", "core", "inside the planet", "layers of the")
    return any(k in q for k in keys)


def _is_water_cycle(question: str) -> bool:
    q = question.lower()
    return any(k in q for k in ("water cycle", "evaporation", "condensation", "rain cycle"))


def _build_earth_lesson(retry_count: int, strategy: str) -> Dict[str, Any]:
    diagrams = ["earth_layers", "earth_layers", "earth_cross_section"]
    diagram = diagrams[min(retry_count, len(diagrams) - 1)]
    voices = [
        "Let me draw the Earth on the board. It has three main layers: crust, mantle, and core.",
        "Think of the Earth like an egg! The shell is the crust, the white is the mantle, and the yolk is the core.",
        "Let's look inside the Earth. The core in the centre is very hot. The crust is where we live.",
    ]
    voice = voices[min(retry_count, len(voices) - 1)]
    steps: List[Dict[str, Any]] = [
        {"action": "write", "text": "Inside the Earth", "x": 80, "y": 50, "size": 30},
        {"action": "pause", "ms": 400},
        {
            "action": "drawDiagram",
            "diagram": diagram,
            "cx": 400,
            "cy": 240,
            "labels": ["Crust", "Mantle", "Core"],
            "durationMs": 2800,
        },
        {"action": "pause", "ms": 500},
        {"action": "write", "text": "Crust → Mantle → Core", "x": 80, "y": 400, "size": 22},
    ]
    return {
        "title": "Inside the Earth",
        "concept": "earth_layers",
        "teaching_style": strategy,
        "diagram_used": diagram,
        "voice_script": voice,
        "analogy": "egg",
        "steps": steps,
        "source": "scene_planner",
    }


def _build_fraction_lesson(num: int, den: int, retry_count: int, strategy: str) -> Dict[str, Any]:
    if den == 0:
        den = 4
    num = min(num, den)
    diagrams = ["pie_fraction", "bar_fraction", "fraction_groups"]
    diagram = diagrams[min(retry_count, len(diagrams) - 1)]
    analogies = ["pizza", "chocolate bar", "apples"]
    analogy = analogies[min(retry_count, len(analogies) - 1)]
    voices = [
        f"Let's draw a pizza cut into {den} slices. {num} slices are shaded — that's {num}/{den}.",
        f"Imagine a chocolate bar with {den} pieces. You have {num} pieces. That is {num} out of {den}.",
        f"Look at {den} apples in a row. We circle {num} of them. {num}/{den} means {num} out of {den}.",
    ]
    voice = voices[min(retry_count, len(voices) - 1)]
    steps: List[Dict[str, Any]] = [
        {"action": "write", "text": f"{num}/{den} = ?", "x": 80, "y": 55, "size": 32},
        {"action": "pause", "ms": 400},
        {
            "action": "drawDiagram",
            "diagram": diagram,
            "numerator": num,
            "denominator": den,
            "cx": 400,
            "cy": 220,
            "durationMs": 3000,
        },
        {"action": "pause", "ms": 500},
        {
            "action": "write",
            "text": f"{num} out of {den}",
            "x": 80,
            "y": 400,
            "size": 28,
        },
        {"action": "highlight", "x": 75, "y": 390, "w": 160, "h": 40},
    ]
    return {
        "title": f"Fraction {num}/{den}",
        "concept": f"fraction_{num}_{den}",
        "teaching_style": strategy,
        "diagram_used": diagram,
        "voice_script": voice,
        "analogy": analogy,
        "steps": steps,
        "source": "scene_planner",
    }


def _build_arithmetic_lesson(
    op: str,
    a: int,
    b: int,
    result: int,
    retry_count: int,
    strategy: str,
) -> Dict[str, Any]:
    sym = {"+": "+", "-": "−", "*": "×", "/": "÷"}[op]
    title = f"{a} {sym} {b}"
    analogies = ["stars", "apples", "cookies"]
    analogy = analogies[min(retry_count, len(analogies) - 1)]

    voices = [
        f"Let's solve {a} {sym} {b}. Watch the board — I'll count step by step.",
        f"Think of {analogy}! I'll show {a} {sym} {b} a different way on the board.",
        f"One more try with {analogy}. Same question, new picture!",
    ]
    voice = voices[min(retry_count, len(voices) - 1)]

    steps: List[Dict[str, Any]] = [
        {"action": "write", "text": f"{a} {sym} {b} = ?", "x": 80, "y": 55, "size": 32},
        {"action": "pause", "ms": 400},
    ]

    diagram_used = "drawGroups"
    if retry_count == 0 and op in ("+", "-"):
        emoji = {"stars": "⭐", "apples": "🍎", "cookies": "🍪"}.get(analogy, "⭐")
        steps.append({
            "action": "drawGroups",
            "groups": [{"count": min(a, 12)}, {"count": min(b, 12)}],
            "operator": "+" if op == "+" else "−",
            "emoji": emoji,
        })
    elif retry_count == 1 and op == "+":
        diagram_used = "number_line"
        steps.append({
            "action": "drawDiagram",
            "diagram": "number_line",
            "start": 0,
            "jumps": [a, b],
            "result": result,
            "cx": 400,
            "cy": 220,
            "durationMs": 2800,
        })
    elif retry_count >= 2 and op == "+":
        diagram_used = "ten_frame"
        steps.append({
            "action": "drawDiagram",
            "diagram": "ten_frame",
            "filled": min(result, 10),
            "cx": 400,
            "cy": 220,
            "durationMs": 2500,
        })
    elif op == "/":
        diagram_used = "drawDivision"
        steps.extend([
            {"action": "drawDivision", "dividend": a, "divisor": b, "quotient": result},
            {"action": "pause", "ms": 700},
        ])
    elif op == "*":
        diagram_used = "drawGroups"
        for i in range(min(a, 4)):
            steps.append({
                "action": "drawGroups",
                "groups": [{"count": min(b, 8)}],
                "emoji": "🍎",
                "yOffset": 160 + i * 42,
            })
    else:
        steps.append({
            "action": "drawGroups",
            "groups": [{"count": min(a, 12)}, {"count": min(b, 12)}],
            "operator": sym,
            "emoji": "⭐",
        })

    steps.extend([
        {"action": "pause", "ms": 600},
        {"action": "write", "text": f"= {result}", "x": 80, "y": 380, "size": 36},
        {"action": "highlight", "x": 75, "y": 370, "w": 120, "h": 48},
    ])

    return {
        "title": title,
        "concept": f"arithmetic_{a}_{op}_{b}",
        "teaching_style": strategy,
        "diagram_used": diagram_used,
        "voice_script": voice,
        "analogy": analogy,
        "steps": steps,
        "source": "scene_planner",
    }


def _build_water_cycle_lesson(retry_count: int, strategy: str) -> Dict[str, Any]:
    voices = [
        "The water cycle has four steps: evaporation, condensation, precipitation, and collection.",
        "Imagine the sun heating water. It rises as vapour, forms clouds, then falls as rain!",
    ]
    voice = voices[min(retry_count, len(voices) - 1)]
    return {
        "title": "Water Cycle",
        "concept": "water_cycle",
        "teaching_style": strategy,
        "diagram_used": "water_cycle",
        "voice_script": voice,
        "analogy": "rain",
        "steps": [
            {"action": "write", "text": "The Water Cycle", "x": 80, "y": 50, "size": 30},
            {"action": "pause", "ms": 400},
            {
                "action": "drawDiagram",
                "diagram": "water_cycle",
                "cx": 400,
                "cy": 240,
                "durationMs": 3500,
            },
            {"action": "write", "text": "Sun → Cloud → Rain → River", "x": 80, "y": 400, "size": 22},
        ],
        "source": "scene_planner",
    }


def _normalize_steps(raw_steps: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_steps, list):
        return []
    allowed = {
        "write", "drawLine", "drawCircle", "drawArrow", "highlight",
        "drawGroups", "drawDivision", "drawDiagram", "pause",
    }
    out: List[Dict[str, Any]] = []
    for step in raw_steps:
        if not isinstance(step, dict):
            continue
        action = str(step.get("action", "")).strip()
        if action not in allowed:
            continue
        out.append(step)
        if len(out) >= 12:
            break
    return out


def _lesson_via_llm(
    question: str,
    grade: int,
    subject: str,
    retry_count: int,
    language: str,
    context: str,
    attempt_history: List[Dict[str, Any]],
    strategy: str,
) -> Optional[Dict[str, Any]]:
    client = get_openai_client()
    if not client:
        return None

    history_note = _format_attempt_history(attempt_history)
    retry_note = ""
    if retry_count > 0:
        retry_note = (
            f"\nRETRY #{retry_count}. Teaching style for this attempt: {strategy}. "
            "SAME question, DIFFERENT diagram. Do NOT introduce a new topic."
        )

    user_prompt = (
        f"LOCKED QUESTION (must not change): {question}\n"
        f"Grade: {grade}\nSubject: {subject}\n"
        f"Teaching style this attempt: {strategy}\n"
        f"{retry_note}\n{history_note}\n"
    )
    if context and retry_count == 0:
        user_prompt += f"\nTextbook context (first attempt only):\n{context[:2000]}\n"

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": CLASSROOM_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.25 if retry_count == 0 else 0.45,
            max_tokens=1400,
            response_format={"type": "json_object"},
        )
        data = _extract_json(response.choices[0].message.content.strip())
        steps = _normalize_steps(data.get("steps"))
        if not steps:
            return None
        diagram_used = "custom"
        for s in steps:
            if s.get("action") == "drawDiagram":
                diagram_used = str(s.get("diagram", "custom"))
                break
        return {
            "title": str(data.get("title", question[:40])).strip() or "Lesson",
            "concept": str(data.get("concept", "general")).strip(),
            "teaching_style": str(data.get("teaching_style", strategy)).strip(),
            "diagram_used": diagram_used,
            "voice_script": str(data.get("voice_script", "")).strip()
            or f"Let me explain {question} on the board.",
            "analogy": str(data.get("analogy", "example")).strip(),
            "steps": steps,
            "source": "llm_scene_planner",
        }
    except Exception as err:
        print(f"[classroom_lesson] LLM error: {err}")
        return None


def generate_classroom_lesson(
    question: str,
    grade: int = 4,
    subject: str = "Maths",
    retry_count: int = 0,
    language: str = "en",
    attempt_history: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Build a scene-planned blackboard lesson for the given question."""
    q = (question or "").strip()
    if not q:
        raise ValueError("Question cannot be empty.")

    retry_count = max(0, min(retry_count, 5))
    attempt_history = attempt_history or []
    strategy = _pick_strategy(retry_count, attempt_history)

    context = ""
    if retry_count == 0:
        try:
            from utils.rag import query_knowledge_base, format_context_for_prompt

            result = query_knowledge_base(q, grade=grade, subject=subject, n_results=3)
            docs = result.get("documents", []) if isinstance(result, dict) else []
            if docs:
                context = format_context_for_prompt(docs)
        except Exception as err:
            print(f"[classroom_lesson] RAG skipped: {err}")

    lesson: Optional[Dict[str, Any]] = None

    if _is_earth_question(q):
        lesson = _build_earth_lesson(retry_count, strategy)
    elif _is_water_cycle(q):
        lesson = _build_water_cycle_lesson(retry_count, strategy)
    else:
        frac = _parse_fraction(q)
        if frac:
            lesson = _build_fraction_lesson(frac[0], frac[1], retry_count, strategy)
        else:
            parsed = _parse_simple_arithmetic(q)
            if parsed:
                op, a, b, result = parsed
                lesson = _build_arithmetic_lesson(op, a, b, result, retry_count, strategy)

    if not lesson:
        lesson = _lesson_via_llm(
            q, grade, subject, retry_count, language, context, attempt_history, strategy
        )

    if not lesson:
        lesson = {
            "title": "Let's learn",
            "concept": "general",
            "teaching_style": strategy,
            "diagram_used": "write_only",
            "voice_script": f"Let me explain your question: {q}",
            "analogy": "example",
            "steps": [
                {"action": "write", "text": q[:80], "x": 60, "y": 60, "size": 26},
                {"action": "pause", "ms": 600},
            ],
            "source": "fallback",
        }

    lesson["question"] = q
    lesson["retry_count"] = retry_count
    lesson["grade"] = grade
    lesson["subject"] = subject
    lesson["locked_concept"] = lesson.get("concept", "general")
    return lesson
