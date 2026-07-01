"""
Visual-aid router for the AutiStudy AI tutor.
=============================================

When a student clicks "Show me a picture", we don't always want to draw the
same kind of thing. A request like *"What is 2 + 4?"* benefits from a
countable picture (4 stars, plus, 2 stars, equals, 6 stars). A request like
*"What is 2/4 + 5/6?"* does not — DALL·E miscounts and miswrites fractions,
and the student can't physically count "two-quarters of an apple" anyway.

This module routes every visual request into one of three tracks:

  ┌──────────────┬─────────────────────────────────────┬─────────────────────┐
  │ Track        │ Triggered by                        │ Renders as          │
  ├──────────────┼─────────────────────────────────────┼─────────────────────┤
  │ countable    │ small whole-number arithmetic       │ DALL·E illustration │
  │              │ (+, -, ×) with values ≤ 10          │ with countable      │
  │              │                                     │ objects (stars,     │
  │              │                                     │ pencils, balls, …)  │
  │ symbolic     │ fractions, decimals, percentages,   │ Step-by-step LaTeX  │
  │              │ algebra, anything you can't         │ "solution card"     │
  │              │ physically count                    │ rendered inline     │
  │              │                                     │ via KaTeX           │
  │ concept      │ everything else (definitions,       │ DALL·E illustration │
  │              │ workflows, comparisons)             │ via existing        │
  │              │                                     │ enhance_image_prompt│
  └──────────────┴─────────────────────────────────────┴─────────────────────┘

The router is **deterministic where it can be** (regex on the question text)
and only escalates to GPT for the symbolic step extraction. Classification
itself is rule-based so it adds zero latency and zero cost.

Public API:
  * `classify_visual_request(question, history, subject) -> Track`
  * `build_countable_image_prompt(question) -> Optional[CountablePlan]`
  * `generate_math_steps(question, history, language, client) -> Optional[StepCard]`
"""

from __future__ import annotations

import json
import random
import re
from collections import Counter
from dataclasses import dataclass, field
from fractions import Fraction as PyFraction
from math import gcd
from typing import Any, Dict, List, Optional


Track = str  # "countable"|"factor_tree"|"fraction_bar"|"number_line"|"bar_chart"|"symbolic"|"concept"


# ────────────────────────────────────────────────────────────────────────────
# 1. CLASSIFIER — pure regex, no LLM call
# ────────────────────────────────────────────────────────────────────────────

# Symbolic-math indicators: if ANY of these appear in the question OR the
# previous turn's recap, we route to the LaTeX step card.
_SYMBOLIC_PATTERNS = [
    r"\\frac",                       # already-LaTeXed fractions
    r"\d+\s*/\s*\d+",                # 2/4, 5 / 6  (also matches division)
    r"\d+\s*÷\s*\d+",                # 63 ÷ 3, 1263 ÷ 3 (always show as steps)
    r"\d+\.\d+",                     # decimals
    r"\d+\s*%",                      # percentages
    r"\^\s*\d",                      # exponents like 2^3
    r"\bx\b\s*[=+\-*/]",             # algebra: x = …, x + …
    r"\b[a-z]\s*[+\-*/=]\s*\d",      # algebra letter on the left
    r"\bsqrt\b|√",                   # square roots
    r"\d{3,}\s*[*×x]\s*\d+",         # multi-digit multiplication (column method)
    r"\d{3,}\s*[+\-]\s*\d{3,}",      # multi-digit add/subtract (column method)
]
_SYMBOLIC_KEYWORDS = {
    "fraction", "fractions", "denominator", "numerator",
    "decimal", "decimals",
    "percentage", "percentages", "percent",
    "algebra", "equation", "variable", "exponent",
    "ratio", "ratios",
    "long division", "long-division", "divide", "division",
    "quotient", "remainder", "dividend", "divisor",
}

# Pure countable arithmetic: two small whole numbers joined by +, -, × (or *).
# Division between whole numbers is intentionally excluded — it almost always
# produces a fraction, which doesn't render well as a count of objects.
_COUNTABLE_OPERATORS = r"[+\-×x*]"  # not /, not ÷
_COUNTABLE_REGEX = re.compile(
    rf"(?<!\d)(\d{{1,2}})\s*({_COUNTABLE_OPERATORS})\s*(\d{{1,2}})(?!\d)",
    re.IGNORECASE,
)
_MAX_COUNTABLE_VALUE = 10  # don't ask DALL·E to draw 17 stars — it will miscount


def _has_symbolic_signal(text: str) -> bool:
    if not text:
        return False
    lowered = text.lower()
    if any(kw in lowered for kw in _SYMBOLIC_KEYWORDS):
        return True
    return any(re.search(p, text) for p in _SYMBOLIC_PATTERNS)


def _extract_countable_expr(text: str) -> Optional[Dict[str, Any]]:
    """Return {n1, n2, op, result} if the text contains a small whole-number
    arithmetic expression we can illustrate with countable objects."""
    if not text:
        return None
    match = _COUNTABLE_REGEX.search(text)
    if not match:
        return None
    n1 = int(match.group(1))
    op_raw = match.group(2)
    n2 = int(match.group(3))
    if n1 > _MAX_COUNTABLE_VALUE or n2 > _MAX_COUNTABLE_VALUE:
        return None

    if op_raw in {"+",}:
        op = "+"
        result = n1 + n2
    elif op_raw == "-":
        op = "-"
        result = n1 - n2
        if result < 0:
            return None  # negative results don't count as objects
    elif op_raw in {"×", "x", "X", "*"}:
        op = "×"
        result = n1 * n2
        if result > _MAX_COUNTABLE_VALUE * 2:
            return None  # 8 × 9 = 72 dots is too many to draw cleanly
    else:
        return None
    return {"n1": n1, "n2": n2, "op": op, "result": result}


def _is_adaptation_stub(text: str) -> bool:
    """Short system/adaptation lines — not the substantive tutor explanation."""
    t = (text or "").strip()
    if len(t) < 60:
        return True
    lowered = t.lower()
    stubs = (
        "let me read this out loud",
        "here's a picture to help",
        "let me show you another way",
        "did you understand",
        "great job",
        "well done",
        "awesome work",
        "let's take a breath",
        "let's try a quick quiz",
        "almost there",
    )
    return any(lowered.startswith(s) for s in stubs)


def _substantive_assistant_text(
    history: List[Dict[str, Any]], chars: int = 600,
) -> str:
    """Most recent tutor explanation, skipping adaptation ladder stubs."""
    for msg in reversed(history or []):
        if msg.get("role") != "assistant":
            continue
        content = str(msg.get("content") or "").strip()
        if not content or _is_adaptation_stub(content):
            continue
        return content[:chars]
    return ""


def last_assistant_index(history: List[Dict[str, Any]]) -> int:
    """Index of the most recent assistant message (for adaptation stubs + visuals)."""
    if not history:
        return 0
    for idx in range(len(history) - 1, -1, -1):
        if history[idx].get("role") == "assistant":
            return idx
    return len(history) - 1


def substantive_assistant_index(history: List[Dict[str, Any]]) -> int:
    """Index of the tutor's main answer bubble for attaching visual aids."""
    if not history:
        return 0
    for idx in range(len(history) - 1, -1, -1):
        msg = history[idx]
        if msg.get("role") != "assistant":
            continue
        content = str(msg.get("content") or "").strip()
        if content and not _is_adaptation_stub(content):
            return idx
    return last_assistant_index(history)


def _last_assistant_text(history: List[Dict[str, Any]], chars: int = 400) -> str:
    """Grab a snippet of the most recent substantive assistant reply.

    A user saying just "show me" / "how" / "draw it" means *the previous topic*,
    so we look at the assistant's recap to detect symbolic math sneakily hiding
    in the conversation context. Adaptation-ladder stub lines are skipped.
    """
    return _substantive_assistant_text(history, chars)


# ── New-track signal detectors (added for grades 4-6 curriculum) ─────────────

_FACTOR_KW = {
    "hcf", "h.c.f", "highest common factor",
    "lcm", "l.c.m", "least common multiple",
    "prime factor", "factor tree", "prime factori",
    "common factor", "common multiple", "divisibility",
    "prime number", "composite number",
}
_FACTOR_RX = re.compile(
    r"\b(hcf|h\.c\.f|lcm|l\.c\.m|prime\s+factor|factor\s+tree|"
    r"highest\s+common\s+factor|least\s+common\s+multiple|"
    r"common\s+factor|common\s+multiple)\b",
    re.IGNORECASE,
)

_NUMBER_LINE_KW = {
    "number line", "on a line", "mark on", "plot on",
    "integer", "integers", "negative number", "show on number",
}

_FRACTION_VISUAL_KW = {
    "show", "draw", "picture", "visual", "represent",
    "shade", "diagram", "what does", "show me", "illustrate",
}
_FRACTION_RX = re.compile(r"\d+\s*/\s*\d+")

_PERCENT_KW = {"percent", "percentage", "% of", "percent of"}
_PERCENT_RX = re.compile(r"(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*percent", re.IGNORECASE)

_TIMES_TABLE_KW = {
    "times table", "multiplication table", "table of",
    "multiply by", "multiples of",
}
_TIMES_TABLE_RX = re.compile(
    r"\b(?:table\s+of\s+(\d+)|(\d+)\s*(?:times|multiplication)\s+table|"
    r"multiples\s+of\s+(\d+))\b", re.IGNORECASE,
)

_GEOMETRY_KW = {
    "triangle", "rectangle", "square", "circle", "angle",
    "perimeter", "area of", "right angle", "polygon",
    "quadrilateral", "parallelogram", "rhombus", "degrees",
}

_RATIO_KW = {
    "ratio", "rate", "proportion", "simplify the ratio",
    "in the ratio", "share in ratio",
}

_CHART_KW = {
    "bar chart", "bar graph", "pie chart", "pie graph",
    "line graph", "histogram", "pictograph", "tally",
}


def _has_factor_signal(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in _FACTOR_KW) or bool(_FACTOR_RX.search(text))


def _has_number_line_signal(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in _NUMBER_LINE_KW)


def _has_fraction_visual_signal(text: str) -> bool:
    lower = text.lower()
    has_fraction = bool(_FRACTION_RX.search(text))
    has_visual = any(kw in lower for kw in _FRACTION_VISUAL_KW)
    return has_fraction and has_visual


def _has_chart_signal(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in _CHART_KW)


def _has_percent_signal(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in _PERCENT_KW) or bool(_PERCENT_RX.search(text))


def _has_times_table_signal(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in _TIMES_TABLE_KW) or bool(_TIMES_TABLE_RX.search(text))


def _has_geometry_signal(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in _GEOMETRY_KW)


def _detect_geometry_focus(text: str) -> str:
    """What to emphasise in the diagram: perimeter, area, both, or neutral shape."""
    lower = (text or "").lower()
    has_perimeter = bool(
        re.search(r"\bperimeter\b|\bcircumference\b|\baround\b|\bboundary\b", lower)
    )
    has_area = bool(re.search(r"\barea\b|\bsurface\b|\binside\b|\bsquare units\b", lower))
    if has_perimeter and not has_area:
        return "perimeter"
    if has_area and not has_perimeter:
        return "area"
    if has_perimeter and has_area:
        return "both"
    return "shape"


def _detect_measure_unit(text: str) -> str:
    if re.search(r"\bcm\b|\bcentimet", text, re.I):
        return "cm"
    if re.search(r"\bmm\b|\bmillimet", text, re.I):
        return "mm"
    if re.search(r"\bm\b|\bmetre|\bmeter", text, re.I):
        return "m"
    return ""


def should_use_ai_concept_image(question: str, subject: str) -> bool:
    """For Maths prefer coded SVG; AI only when the question is abstract."""
    sub = (subject or "").lower()
    if "math" not in sub:
        return True
    q = (question or "").lower()
    if _extract_countable_expr(q):
        return False
    if _has_geometry_signal(q):
        return False
    if _has_fraction_visual_signal(q):
        return False
    if _has_number_line_signal(q):
        return False
    if _has_factor_signal(q):
        return False
    if _has_chart_signal(q):
        return False
    if _has_percent_signal(q):
        return False
    if _has_times_table_signal(q):
        return False
    if _has_ratio_signal(q):
        return False
    if _has_symbolic_signal(q):
        return False
    return True


def _has_ratio_signal(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in _RATIO_KW)


def classify_visual_request(
    question: str,
    history: Optional[List[Dict[str, Any]]] = None,
    subject: str = "",
) -> Track:
    """Decide which visual track to use for this 'Show me a picture' click.

    Priority order (first match wins):
      1. countable    — small whole-number +/-/× in the QUESTION ITSELF (always
                        wins so history keywords never hijack a simple "7 - 2")
      2. factor_tree  — HCF, LCM, prime factors
      3. number_line  — integers, negative numbers, number line questions
      4. bar_chart    — explicit chart/graph requests (question only)
      5. percentage_bar
      6. times_table
      7. geometry
      8. ratio
      9. fraction_bar
     10. symbolic     — fractions to solve, algebra, decimals, division
     11. concept      — everything else → DALL·E
    """
    q = (question or "").strip()
    history_text = _last_assistant_text(history or [])

    # 1. Countable arithmetic — checked FIRST so "7 - 2" always wins, even if
    #    history contains words like "bar" or "chart" from a previous answer.
    if _extract_countable_expr(q):
        return "countable"

    # 2. Factor tree (HCF / LCM / prime factors)
    if _has_factor_signal(q) or _has_factor_signal(history_text):
        return "factor_tree"

    # 3. Number line / integers
    if _has_number_line_signal(q) or _has_number_line_signal(history_text):
        return "number_line"

    # 4. Charts / data handling — only trigger on the question itself (not history)
    #    to avoid hijacking simple arithmetic when a previous answer mentioned charts.
    if _has_chart_signal(q):
        return "bar_chart"

    # 5. Percentage bar
    if _has_percent_signal(q) or _has_percent_signal(history_text):
        return "percentage_bar"

    # 6. Multiplication / times table grid
    if _has_times_table_signal(q) or _has_times_table_signal(history_text):
        return "times_table"

    # 7. Geometry shapes
    if _has_geometry_signal(q) or _has_geometry_signal(history_text):
        return "geometry"

    # 8. Ratio / balance scale
    if _has_ratio_signal(q) or _has_ratio_signal(history_text):
        return "ratio"

    # 9. Fraction visual ("show me 1/3 as a picture") — only when a VISUAL
    #    keyword is present so plain "1/3 + 1/4 = ?" still goes to symbolic
    if _has_fraction_visual_signal(q) or _has_fraction_visual_signal(history_text):
        return "fraction_bar"

    # 10. Symbolic (solve fractions, algebra, decimals, long division)
    if _has_symbolic_signal(q) or _has_symbolic_signal(history_text):
        return "symbolic"

    # Short "draw it" / "show me" follow-ups — inherit previous question's track
    if len(q.split()) <= 4 and history:
        for msg in reversed(history):
            if msg.get("role") == "user" and msg.get("content") and msg["content"] != q:
                inherited = classify_visual_request(msg["content"], None, subject)
                if inherited == "symbolic" or _has_symbolic_signal(history_text):
                    return "symbolic"
                return inherited

    # 11. Generic concept image
    return "concept"


# ────────────────────────────────────────────────────────────────────────────
# 2. COUNTABLE TRACK — pure browser emoji illustration (no DALL·E)
# ────────────────────────────────────────────────────────────────────────────
#
# Instead of asking DALL·E to render objects (which miscounts, takes 10+ s,
# and costs money), we return structured data that the React frontend
# renders as an animated SVG/emoji counting illustration directly in the
# browser. The result is instant, 100% accurate, and works offline.
#
# Each emoji pair is chosen so the two groups look visually distinct
# (different colour/shape) while still being immediately recognisable.

# (emoji, label) pairs — cute, culturally neutral, clearly countable.
_EMOJI_PAIRS: List[tuple] = [
    ("🍎", "apple"),
    ("🌟", "star"),
    ("🎈", "balloon"),
    ("🍊", "orange"),
    ("🌸", "flower"),
    ("🎯", "target"),
    ("🍇", "grape"),
    ("🐟", "fish"),
    ("🧩", "puzzle"),
    ("🦋", "butterfly"),
    ("🍦", "ice cream"),
    ("⚽", "ball"),
]


@dataclass
class EmojiCountingPlan:
    """Structured data for the in-browser animated emoji counting view.

    The React ``EmojiCountingView`` component reads this and renders:
      • Addition (+): Group A | + | Group B | = | Combined
      • Subtraction (−): All objects, with n2 crossed out, n2 remaining
      • Multiplication (×): n1 rows of n2 objects each, then combined total
    """
    n1: int
    n2: int
    op: str            # "+", "-", "×"
    result: int
    emoji: str         # single emoji character for Group A (and result)
    emoji2: str        # single emoji character for Group B (addition only)
    label: str         # human-readable label, e.g. "apple"
    label2: str        # label for second emoji
    title: str         # e.g. "3 + 5 = 8"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "n1": self.n1,
            "n2": self.n2,
            "op": self.op,
            "result": self.result,
            "emoji": self.emoji,
            "emoji2": self.emoji2,
            "label": self.label,
            "label2": self.label2,
            "title": self.title,
        }


def build_countable_emoji_data(
    question: str, *, rng: Optional[random.Random] = None
) -> Optional[EmojiCountingPlan]:
    """Extract arithmetic from *question* and return an ``EmojiCountingPlan``.

    Returns ``None`` if the question isn't a small-number arithmetic expression
    that can be shown with countable objects (e.g. it has fractions, or the
    numbers are too large).
    """
    expr = _extract_countable_expr(question)
    if not expr:
        return None
    rng = rng or random
    # Pick two *different* emoji so Group A and Group B look distinct.
    pair_a, pair_b = rng.sample(_EMOJI_PAIRS, 2)
    emoji_a, label_a = pair_a
    emoji_b, label_b = pair_b
    n1, n2, op, result = expr["n1"], expr["n2"], expr["op"], expr["result"]
    return EmojiCountingPlan(
        n1=n1, n2=n2, op=op, result=result,
        emoji=emoji_a, emoji2=emoji_b,
        label=label_a, label2=label_b,
        title=f"{n1} {op} {n2} = {result}",
    )


# Keep the old name as an alias so existing call-sites don't break while we
# migrate. It now returns a dummy object — callers should switch to
# build_countable_emoji_data which is what chat_engine actually calls.
@dataclass
class CountablePlan:
    """Kept for back-compat only; no longer used for image generation."""
    prompt: str = ""
    title: str = ""
    aspect_ratio: str = "1:1"
    math_info: Dict[str, Any] = field(default_factory=dict)
    object_label: str = ""


def build_countable_image_prompt(
    question: str, *, rng: Optional[random.Random] = None
) -> Optional[CountablePlan]:
    """Deprecated shim — kept so old imports compile. chat_engine now calls
    ``build_countable_emoji_data`` instead."""
    return None


_NUMBER_WORDS = {
    0: "zero", 1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
    6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
    11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen",
    16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen", 20: "twenty",
}


def _words(n: int) -> str:
    """English word for small integers (used to *also* spell the count out
    in the DALL·E prompt — redundancy helps the model get the count right)."""
    return _NUMBER_WORDS.get(n, str(n))


# ────────────────────────────────────────────────────────────────────────────
# 3. SYMBOLIC TRACK — GPT extracts a step-by-step worked solution as LaTeX
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class StepCard:
    """A KaTeX-renderable worked solution. Each step has a short caption and
    a LaTeX expression. The frontend stacks them inside a calm card UI."""
    title: str
    steps: List[Dict[str, str]] = field(default_factory=list)
    final_answer: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "steps": self.steps,
            "final_answer": self.final_answer,
        }


_STEP_BUILDER_SYSTEM_PROMPT = """You are MathStepBuilder for an autism-friendly tutor app for grades 4-7.

Your job:
Given a math question (and optionally the tutor's prior explanation), produce a
SHORT, calm, step-by-step worked solution in JSON, where every step's
mathematical content is written in LaTeX so a frontend can typeset it cleanly.

STRICT RULES:
1. Use 3 to 6 steps total. Never more than 6.
2. Each step has:
   - "caption": a single short sentence (≤ 12 words). No emojis. The caption
     explains WHY this step happens (e.g. "Make the denominators equal").
     Keep the caption in PLAIN words. If you absolutely must mention a math
     expression, wrap it in single dollar signs so it typesets, e.g.
     "Convert $\\frac{1}{2}$ to sixths". Never write raw \\frac in a caption
     without $ ... $ around it.
   - "latex": the math for this step, written in pure LaTeX with NO surrounding
     dollar signs. Use \\frac{a}{b}, \\times, \\div, ^, _ and standard symbols.
3. CRITICAL JSON ESCAPING: every backslash in your LaTeX must appear as TWO
   backslashes in the JSON string. Write "\\\\frac{a}{b}", "\\\\times",
   "\\\\div", "\\\\sqrt{x}". A single backslash will be silently swallowed by
   the JSON parser and the math will render as broken text.
4. The final step's "latex" should clearly show the answer (e.g. = \\\\frac{4}{3}).
5. Also return:
   - "title": a 2-4 word heading for the card (e.g. "Adding fractions").
   - "final_answer": just the answer in LaTeX, no equation, e.g. "\\\\frac{4}{3}".
6. Do NOT include any prose outside the JSON.
7. Do NOT use \\(  \\)  or \\[  \\] anywhere.

PICK THE RIGHT METHOD FOR THE PROBLEM (this is critical):

For DIVISION:
  - For two-digit ÷ single-digit (e.g. 63 ÷ 3, 84 ÷ 7), use SHORT DIVISION,
    digit by digit from the LEFT. Example for 63 ÷ 3:
      Step 1: "Divide the first digit." latex: "6 \\\\div 3 = 2"
      Step 2: "Divide the next digit."  latex: "3 \\\\div 3 = 1"
      Step 3: "Combine the digits."     latex: "63 \\\\div 3 = 21"
  - For three-digit or larger ÷ any divisor (e.g. 1263 ÷ 3, 456 ÷ 12), use
    the FULL LONG DIVISION ALGORITHM: divide → multiply → subtract → bring
    down → repeat. Example for 1263 ÷ 3:
      Step 1: "Divide 12 by 3."           latex: "12 \\\\div 3 = 4"
      Step 2: "Bring down the 6, divide." latex: "6 \\\\div 3 = 2"
      Step 3: "Bring down the 3, divide." latex: "3 \\\\div 3 = 1"
      Step 4: "Combine all digits."       latex: "1263 \\\\div 3 = 421"
  - NEVER list every multiple of the divisor (3 × 1, 3 × 2, …, 3 × 21) as
    "the steps". That is the wrong method for any divisor whose multiples
    exceed the times tables the student already knows.

For MULTI-DIGIT MULTIPLICATION (e.g. 234 × 6, 34 × 27): use the column
method, showing partial products. NOT a list of "× 1, × 2, × 3, ..." lookups.

For MULTI-DIGIT ADDITION / SUBTRACTION: column method, lining up place
values, with carrying / borrowing as needed.

For FRACTIONS: simplify, find a common denominator, do the operation,
simplify again — exactly as in your existing fraction examples.

Return JSON ONLY in this exact schema:
{
  "title": "...",
  "steps": [
    {"caption": "...", "latex": "..."},
    {"caption": "...", "latex": "..."}
  ],
  "final_answer": "..."
}
"""


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    return cleaned


def _extract_json_object(text: str) -> Dict[str, Any]:
    cleaned = _strip_code_fences(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def _sanitize_latex(raw: str) -> str:
    """Strip stray $ delimiters and `\\(...\\)` wrappers, then restore any
    JSON-control characters that GPT meant to be LaTeX commands.

    Why the control-char dance:
      GPT-4o-mini sometimes emits `"\frac{a}{b}"` inside the JSON response
      (a single backslash instead of the proper `"\\frac"`). The JSON
      parser sees `\f` as a valid escape — the form-feed character (U+000C) —
      and silently swallows it, leaving `<U+000C>rac{a}{b}` in the
      resulting Python string. KaTeX then renders that as a parse error
      (red `rac{a}{b}` text), which is what made the step card look broken.

      We restore the most common LaTeX-command starts back to `\X` so the
      step card typesets correctly even when GPT skips the double-escape.
    """
    s = (raw or "").strip()
    s = s.strip("$").strip()
    s = re.sub(r"^\\\((.*)\\\)$", r"\1", s).strip()
    s = re.sub(r"^\\\[(.*)\\\]$", r"\1", s).strip()

    # Restore JSON control chars that almost certainly came from a missing
    # backslash. These have no legitimate use inside a math expression.
    control_to_command = {
        "\x0c": "\\f",   # form feed → \f (almost always \frac, \forall)
        "\x08": "\\b",   # backspace → \b
        "\t":   "\\t",   # tab       → \t (\\times, \\text…)
        "\n":   "\\n",   # newline   → \n (or could be a real newline; safer to escape)
        "\r":   "\\r",
        "\x07": "\\a",   # bell      → \a
        "\x0b": "\\v",   # vert tab  → \v (rarely meaningful)
    }
    for control_char, command in control_to_command.items():
        if control_char in s:
            s = s.replace(control_char, command)
    return s


# Same control-char restoration map as `_sanitize_latex`, used for captions
# too. Pulled out so we don't keep two copies in sync.
_CAPTION_CONTROL_RESTORE = {
    "\x0c": "\\f",
    "\x08": "\\b",
    "\x07": "\\a",
    "\x0b": "\\v",
    # Tabs / newlines inside a caption ARE often legitimate whitespace, so
    # we collapse them to a single space rather than turning them into "\n".
}


def _sanitize_caption(raw: str) -> str:
    """Same idea as `_sanitize_latex` but for the human-readable caption.

    Three cleanups happen here, in order:

      1. Restore JSON control chars that came from missing `\\` escapes
         (e.g. `\\f` → form-feed glyph) back to their backslash form.
      2. Collapse stray tabs / CRLFs (almost always JSON whitespace
         artifacts, not deliberate layout) into single spaces.
      3. Auto-wrap *bare* LaTeX commands like `\\frac{1}{2}` or `\\sqrt{x}`
         in `$ $` so the frontend's KaTeX renderer typesets them. GPT is
         instructed to do this itself, but it ignores the rule about
         half the time, and an unwrapped `\\frac{1}{2}` shows up as raw
         text on the card.
    """
    if not raw:
        return ""
    s = raw
    for control_char, command in _CAPTION_CONTROL_RESTORE.items():
        if control_char in s:
            s = s.replace(control_char, command)
    s = re.sub(r"[\t\r\n]+", " ", s)

    # Auto-wrap bare LaTeX commands so KaTeX renders them. We only wrap
    # when the command isn't already inside a $...$ pair on the same line.
    # Conservative pattern: `\name{...}` possibly followed by `{...}`.
    def _wrap(match: re.Match[str]) -> str:
        token = match.group(0)
        # Already inside $...$? Leave it alone.
        start = match.start()
        before = s[:start]
        # An odd count of $ before us means we're already in math mode.
        if before.count("$") % 2 == 1:
            return token
        return f"${token}$"

    latex_cmd = re.compile(r"\\[a-zA-Z]+(?:\{[^{}]*\})+")
    s = latex_cmd.sub(_wrap, s)
    return s.strip()


# ────────────────────────────────────────────────────────────────────────────
# 4. FACTOR TREE TRACK — prime factorization + HCF / LCM
#    All computation is pure Python (math.gcd). No LLM call needed.
# ────────────────────────────────────────────────────────────────────────────

def _prime_factors(n: int) -> List[int]:
    """Return sorted list of prime factors of n (with repetition)."""
    factors: List[int] = []
    d = 2
    while d * d <= n:
        while n % d == 0:
            factors.append(d)
            n //= d
        d += 1
    if n > 1:
        factors.append(n)
    return factors


def _division_ladder(n: int) -> List[Dict[str, int]]:
    """Return [{divisor, quotient}, …] steps for prime factorization."""
    steps: List[Dict[str, int]] = []
    d = 2
    while n > 1:
        if n % d == 0:
            steps.append({"divisor": d, "quotient": n // d})
            n //= d
        else:
            d += 1
    return steps


def _extract_integers(text: str, min_val: int = 2, max_val: int = 9999) -> List[int]:
    return [int(m) for m in re.findall(r"\b(\d+)\b", text)
            if min_val <= int(m) <= max_val]


@dataclass
class FactorTreeData:
    title: str
    task: str                        # "hcf" | "lcm" | "factorize"
    numbers: List[int]
    ladders: List[List[Dict[str, int]]]  # one per number
    prime_factors: List[List[int]]       # one per number
    hcf: Optional[int]
    lcm: Optional[int]
    common_factors: List[int]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "task": self.task,
            "numbers": self.numbers,
            "ladders": self.ladders,
            "prime_factors": self.prime_factors,
            "hcf": self.hcf,
            "lcm": self.lcm,
            "common_factors": self.common_factors,
        }


def build_factor_tree_data(question: str, history_text: str = "") -> Optional[FactorTreeData]:
    text = question + " " + history_text
    lower = text.lower()

    if "hcf" in lower or "highest common factor" in lower or "h.c.f" in lower:
        task = "hcf"
    elif "lcm" in lower or "least common multiple" in lower or "l.c.m" in lower:
        task = "lcm"
    else:
        task = "factorize"

    nums = _extract_integers(question)
    nums = nums[:4]  # cap at 4 numbers

    if not nums:
        return None
    if task in ("hcf", "lcm") and len(nums) < 2:
        # Try pulling numbers from history too
        nums = _extract_integers(text)[:4]
        if len(nums) < 2:
            return None

    if task == "factorize":
        nums = nums[:2]

    ladders = [_division_ladder(n) for n in nums]
    pf_list = [_prime_factors(n) for n in nums]

    h: Optional[int] = None
    l: Optional[int] = None
    common: List[int] = []

    if len(nums) >= 2:
        h = nums[0]
        for n in nums[1:]:
            h = gcd(h, n)
        l = nums[0]
        for n in nums[1:]:
            l = l * n // gcd(l, n)
        counts = [Counter(pf) for pf in pf_list]
        common_counter = counts[0].copy()
        for c in counts[1:]:
            common_counter &= c
        for prime, cnt in sorted(common_counter.items()):
            common.extend([prime] * cnt)

    if task == "hcf":
        title = f"HCF of {' and '.join(str(n) for n in nums)}"
    elif task == "lcm":
        title = f"LCM of {' and '.join(str(n) for n in nums)}"
    else:
        title = f"Prime Factors of {' and '.join(str(n) for n in nums)}"

    return FactorTreeData(
        title=title, task=task, numbers=nums,
        ladders=ladders, prime_factors=pf_list,
        hcf=h, lcm=l, common_factors=common,
    )


# ────────────────────────────────────────────────────────────────────────────
# 5. FRACTION BAR TRACK — visual shaded rectangle representation
#    Handles single fractions and simple +/− operations.
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class FractionBarData:
    title: str
    fractions: List[Dict[str, int]]  # [{"num":1,"den":3}, …]
    op: Optional[str]                # "+"|"-"|"*"|"/"|None
    result: Optional[Dict[str, int]] # {"num":7,"den":12} or None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "fractions": self.fractions,
            "op": self.op,
            "result": self.result,
        }


def build_fraction_bar_data(question: str) -> Optional[FractionBarData]:
    matches = re.findall(r"(\d+)\s*/\s*(\d+)", question)
    if not matches:
        return None
    fractions = [{"num": int(n), "den": int(d)} for n, d in matches[:4]
                 if int(d) > 0 and int(d) <= 20 and int(n) <= int(d) * 4]
    if not fractions:
        return None

    lower = question.lower()
    op: Optional[str] = None
    if re.search(r"[+]|add|sum|plus", lower):
        op = "+"
    elif re.search(r"[-]|subtract|minus", lower):
        op = "-"
    elif re.search(r"[×*]|multipl|times", lower):
        op = "*"
    elif re.search(r"[÷]|divid", lower) and len(fractions) >= 2:
        op = "/"

    result: Optional[Dict[str, int]] = None
    if op and len(fractions) >= 2:
        try:
            a = PyFraction(fractions[0]["num"], fractions[0]["den"])
            b = PyFraction(fractions[1]["num"], fractions[1]["den"])
            r = (a + b if op == "+" else a - b if op == "-"
                 else a * b if op == "*" else a / b)
            result = {"num": r.numerator, "den": r.denominator}
        except Exception:
            pass

    if len(fractions) == 1:
        f = fractions[0]
        title = f"Fraction: {f['num']}/{f['den']}"
    elif op and result:
        f1, f2 = fractions[0], fractions[1]
        op_sym = {"+" : "+", "-": "−", "*": "×", "/": "÷"}.get(op, op)
        title = f"{f1['num']}/{f1['den']} {op_sym} {f2['num']}/{f2['den']} = {result['num']}/{result['den']}"
    else:
        title = " and ".join(f"{f['num']}/{f['den']}" for f in fractions)

    return FractionBarData(title=title, fractions=fractions, op=op, result=result)


# ────────────────────────────────────────────────────────────────────────────
# 6. NUMBER LINE TRACK — integers and signed arithmetic on a line
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class NumberLineData:
    title: str
    points: List[int]
    min_val: int
    max_val: int
    op: Optional[str]     # "+" or "-" for arrow
    result: Optional[int]
    arrows: List[Dict[str, Any]]  # [{"from": -3, "to": 2, "label": "+5"}]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "points": self.points,
            "min_val": self.min_val,
            "max_val": self.max_val,
            "op": self.op,
            "result": self.result,
            "arrows": self.arrows,
        }


def build_number_line_data(question: str, history_text: str = "") -> Optional[NumberLineData]:
    # Extract signed integers (e.g. -3, +5, 7)
    raw = re.findall(r"[+-]?\d+", question + " " + history_text)
    integers = [int(m) for m in raw if abs(int(m)) <= 20]
    if not integers:
        return None

    lower = question.lower()
    op: Optional[str] = None
    result: Optional[int] = None
    arrows: List[Dict[str, Any]] = []

    if len(integers) >= 2:
        if re.search(r"[+]|add|sum|plus", lower):
            op = "+"
            result = integers[0] + integers[1]
            arrows = [{"from": integers[0], "to": result,
                       "label": f"+{integers[1]}"}]
        elif re.search(r"[-]|subtract|minus", lower):
            op = "-"
            result = integers[0] - integers[1]
            arrows = [{"from": integers[0], "to": result,
                       "label": f"−{integers[1]}"}]

    all_vals = integers[:6] + ([result] if result is not None else [])
    pad = 2
    min_val = max(min(all_vals) - pad, -20)
    max_val = min(max(all_vals) + pad, 20)

    if op and result is not None and len(integers) >= 2:
        op_sym = "+" if op == "+" else "−"
        title = f"{integers[0]} {op_sym} {integers[1]} = {result}"
    else:
        title = f"Number Line: {', '.join(str(i) for i in integers[:4])}"

    return NumberLineData(
        title=title, points=integers[:6],
        min_val=min_val, max_val=max_val,
        op=op, result=result, arrows=arrows,
    )


# ────────────────────────────────────────────────────────────────────────────
# 7. BAR CHART TRACK — extract data via LLM, render in React
# ────────────────────────────────────────────────────────────────────────────

_CHART_EXTRACTOR_PROMPT = """You are a data extractor for a school math app (grades 4-7).

Given a student question (and tutor context), extract chart data.

Return ONLY valid JSON — no prose outside the JSON:
{
  "title": "2–4 word chart title",
  "labels": ["Label1", "Label2", ...],
  "values": [5, 8, 3, ...],
  "x_label": "x-axis label or empty string",
  "y_label": "y-axis label or empty string",
  "chart_type": "bar"
}

Rules:
- Maximum 8 data points. Values must be positive numbers.
- If no clear numeric data is present, return {"error": "no_data"}.
- chart_type is always "bar" unless the question specifically says pie/pie chart → use "pie".
"""


@dataclass
class BarChartData:
    title: str
    labels: List[str]
    values: List[float]
    x_label: str
    y_label: str
    chart_type: str  # "bar" | "pie"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "labels": self.labels,
            "values": self.values,
            "x_label": self.x_label,
            "y_label": self.y_label,
            "chart_type": self.chart_type,
        }


def build_bar_chart_data(
    question: str, history_text: str, client: Any
) -> Optional[BarChartData]:
    if client is None:
        return None
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _CHART_EXTRACTOR_PROMPT},
                {"role": "user", "content":
                 f"Question: {question.strip()}\n"
                 f"Tutor context: {history_text[:500]}"},
            ],
            temperature=0.1,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        raw = (resp.choices[0].message.content or "").strip()
        data = _extract_json_object(raw)
        if "error" in data or not data.get("labels") or not data.get("values"):
            return None
        labels = [str(lb) for lb in data["labels"]]
        values = [float(v) for v in data["values"]]
        if len(labels) != len(values) or not labels:
            return None
        return BarChartData(
            title=str(data.get("title", "Data Chart")),
            labels=labels,
            values=values,
            x_label=str(data.get("x_label", "")),
            y_label=str(data.get("y_label", "")),
            chart_type=str(data.get("chart_type", "bar")),
        )
    except Exception as err:
        print(f"[visual_aids] bar_chart extraction failed: {err}")
        return None


# ────────────────────────────────────────────────────────────────────────────
# 8. PERCENTAGE BAR TRACK
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class PercentageBarData:
    title: str
    percentage: float   # e.g. 35.0
    total: float        # usually 100
    label: str

    def to_dict(self) -> Dict[str, Any]:
        return {"title": self.title, "percentage": self.percentage,
                "total": self.total, "label": self.label}


def build_percentage_bar_data(question: str, history_text: str = "") -> Optional[PercentageBarData]:
    text = question + " " + history_text
    match = _PERCENT_RX.search(text)
    if not match:
        return None
    pct = float(match.group(1) or match.group(2))
    if pct < 0 or pct > 100:
        return None

    # Check if "X% of Y" pattern
    of_match = re.search(
        r"(\d+(?:\.\d+)?)\s*%?\s*(?:of|percent\s+of)\s*(\d+(?:\.\d+)?)", text, re.IGNORECASE
    )
    if of_match:
        pct = float(of_match.group(1))
        total = float(of_match.group(2))
        shaded = pct / 100 * total
        label = f"{pct}% of {total} = {shaded}"
    else:
        total = 100.0
        label = f"{pct}%"

    return PercentageBarData(
        title=f"Percentage: {pct}%",
        percentage=pct,
        total=total,
        label=label,
    )


# ────────────────────────────────────────────────────────────────────────────
# 9. TIMES TABLE / MULTIPLICATION GRID TRACK
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class TimesTableData:
    title: str
    multiplier: int
    rows: List[Dict[str, int]]   # [{"factor": 1, "product": 5}, …]

    def to_dict(self) -> Dict[str, Any]:
        return {"title": self.title, "multiplier": self.multiplier, "rows": self.rows}


def build_times_table_data(question: str, history_text: str = "") -> Optional[TimesTableData]:
    text = question + " " + history_text
    m = _TIMES_TABLE_RX.search(text)
    n: Optional[int] = None
    if m:
        for g in m.groups():
            if g and g.isdigit():
                n = int(g)
                break
    if n is None:
        # Fallback: find any small number near "table" or "multiply"
        nums = _extract_integers(question, min_val=2, max_val=20)
        if nums:
            n = nums[0]
    if n is None or n > 20:
        return None

    rows = [{"factor": i, "product": n * i} for i in range(1, 13)]
    return TimesTableData(
        title=f"Table of {n}",
        multiplier=n,
        rows=rows,
    )


# ────────────────────────────────────────────────────────────────────────────
# 10. GEOMETRY SHAPES TRACK — LLM extracts shape + dimensions
# ────────────────────────────────────────────────────────────────────────────

_GEOMETRY_EXTRACTOR_PROMPT = """You are a geometry data extractor for a school math app (grades 4-7).

Given a student's question, extract the geometric shape and its dimensions.
Return ONLY valid JSON:
{
  "shape": "triangle" | "rectangle" | "square" | "circle" | "angle" | "parallelogram",
  "dimensions": {
    "base": 5, "height": 3,       (for triangle, parallelogram)
    "length": 6, "width": 4,      (for rectangle)
    "side": 5,                    (for square)
    "radius": 7,                  (for circle)
    "degrees": 45                 (for angle)
  },
  "area": 15.0,
  "perimeter": 18.0,
  "angles": [90, 45, 45]
}

Rules:
- Only include fields that are relevant for the shape.
- Compute area and perimeter if dimensions are given. Use null if not enough data.
- For angle, put the degrees value in dimensions.degrees.
- If no shape or no data found, return {"error": "no_data"}.
"""


@dataclass
class GeometryData:
    title: str
    shape: str
    dimensions: Dict[str, float]
    area: Optional[float]
    perimeter: Optional[float]
    angles: Optional[List[float]]
    focus: str = "shape"  # perimeter | area | both | shape
    unit: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "shape": self.shape,
            "dimensions": self.dimensions,
            "area": self.area,
            "perimeter": self.perimeter,
            "angles": self.angles,
            "focus": self.focus,
            "unit": self.unit,
        }


def build_geometry_data(question: str, history_text: str, client: Any) -> Optional[GeometryData]:
    # First try pure regex for simple cases
    combined = f"{question} {history_text}"
    lower = combined.lower()
    focus = _detect_geometry_focus(combined)
    unit = _detect_measure_unit(combined)
    shape: Optional[str] = None
    for s in ("triangle", "rectangle", "square", "circle", "parallelogram", "angle"):
        if s in lower:
            shape = s
            break

    nums = _extract_integers(question, min_val=1, max_val=999)

    # Try to build without LLM for simple cases
    dims: Dict[str, float] = {}
    area: Optional[float] = None
    perimeter: Optional[float] = None
    angles: Optional[List[float]] = None

    if shape == "square" and nums:
        s = float(nums[0])
        dims = {"side": s}
        area = s * s
        perimeter = 4 * s
        angles = [90, 90, 90, 90]
    elif shape == "rectangle" and len(nums) >= 2:
        l, w = float(nums[0]), float(nums[1])
        dims = {"length": l, "width": w}
        area = l * w
        perimeter = 2 * (l + w)
        angles = [90, 90, 90, 90]
    elif shape == "circle" and nums:
        r = float(nums[0])
        dims = {"radius": r}
        import math
        area = round(math.pi * r * r, 2)
        perimeter = round(2 * math.pi * r, 2)
    elif shape == "triangle" and len(nums) >= 2:
        dims = {"base": float(nums[0]), "height": float(nums[1])}
        area = round(0.5 * dims["base"] * dims["height"], 2)
    elif shape == "angle" and nums:
        dims = {"degrees": float(nums[0])}

    if shape and (dims or area):
        title_map = {
            "triangle": "Triangle", "rectangle": "Rectangle", "square": "Square",
            "circle": "Circle", "angle": "Angle", "parallelogram": "Parallelogram",
        }
        return GeometryData(
            title=title_map.get(shape, shape.capitalize()),
            shape=shape, dimensions=dims,
            area=area, perimeter=perimeter, angles=angles,
            focus=focus, unit=unit,
        )

    # Fall back to LLM for complex cases
    if client is None:
        return None
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _GEOMETRY_EXTRACTOR_PROMPT},
                {"role": "user", "content": f"Question: {question}\nContext: {history_text[:400]}"},
            ],
            temperature=0.1, max_tokens=300,
            response_format={"type": "json_object"},
        )
        data = _extract_json_object((resp.choices[0].message.content or "").strip())
        if "error" in data or not data.get("shape"):
            return None
        return GeometryData(
            title=data.get("shape", "Shape").capitalize(),
            shape=str(data["shape"]),
            dimensions={k: float(v) for k, v in data.get("dimensions", {}).items()},
            area=float(data["area"]) if data.get("area") is not None else None,
            perimeter=float(data["perimeter"]) if data.get("perimeter") is not None else None,
            angles=[float(a) for a in data["angles"]] if data.get("angles") else None,
            focus=str(data.get("focus") or _detect_geometry_focus(combined)),
            unit=str(data.get("unit") or unit),
        )
    except Exception as err:
        print(f"[visual_aids] geometry LLM extraction failed: {err}")
        return None


# ────────────────────────────────────────────────────────────────────────────
# 11. RATIO / BALANCE SCALE TRACK
# ────────────────────────────────────────────────────────────────────────────

_RATIO_EXTRACT_RX = re.compile(
    r"(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)"   # 3:2
    r"|(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)", # 3 to 2
    re.IGNORECASE,
)


@dataclass
class RatioData:
    title: str
    left_label: str
    left_value: float
    right_label: str
    right_value: float
    ratio_text: str    # e.g. "3:2"
    simplified: str    # e.g. "3:2" (after simplification)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "left_label": self.left_label,
            "left_value": self.left_value,
            "right_label": self.right_label,
            "right_value": self.right_value,
            "ratio_text": self.ratio_text,
            "simplified": self.simplified,
        }


def build_ratio_data(question: str, history_text: str = "") -> Optional[RatioData]:
    text = question + " " + history_text
    m = _RATIO_EXTRACT_RX.search(text)
    if not m:
        return None

    if m.group(1) and m.group(2):
        a, b = float(m.group(1)), float(m.group(2))
    else:
        a, b = float(m.group(3)), float(m.group(4))

    # Simplify ratio using GCD
    int_a, int_b = int(a), int(b)
    g = gcd(int_a, int_b) if int_a == a and int_b == b else 1
    sa, sb = int_a // g, int_b // g

    # Try to extract labels from question
    label_match = re.search(
        r"ratio\s+of\s+(\w+)\s+(?:to|and)\s+(\w+)", question, re.IGNORECASE
    )
    if label_match:
        left_label, right_label = label_match.group(1).capitalize(), label_match.group(2).capitalize()
    else:
        left_label, right_label = "Part A", "Part B"

    ratio_text = f"{int_a}:{int_b}"
    simplified = f"{sa}:{sb}"

    return RatioData(
        title=f"Ratio {ratio_text}",
        left_label=left_label,
        left_value=a,
        right_label=right_label,
        right_value=b,
        ratio_text=ratio_text,
        simplified=simplified,
    )


def generate_math_steps(
    question: str,
    history: Optional[List[Dict[str, Any]]],
    language: str,
    client: Any,
) -> Optional[StepCard]:
    """Call GPT-4o-mini to produce a worked solution as a JSON step card.

    Returns None if the model can't produce a valid card (the chat_engine
    will fall back to the regular DALL·E flow in that case).
    """
    if client is None:
        return None

    history_snippet = _last_assistant_text(history or [], chars=600)
    user_lang_note = (
        "Captions in Urdu (اردو). Math notation stays in standard LaTeX."
        if language == "ur"
        else "Captions in clear English."
    )

    user_prompt = (
        f"Student's question: {question.strip()}\n\n"
        + (f"Tutor's previous reply (for context):\n{history_snippet}\n\n" if history_snippet else "")
        + f"Language for captions: {user_lang_note}\n"
        + "Build the JSON step card now."
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _STEP_BUILDER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=700,
            response_format={"type": "json_object"},
        )
        raw = (response.choices[0].message.content or "").strip()
        data = _extract_json_object(raw)
    except Exception as err:
        print(f"[visual_aids] generate_math_steps failed: {err}")
        return None

    title = str(data.get("title", "Solution")).strip() or "Solution"
    raw_steps = data.get("steps", [])
    if not isinstance(raw_steps, list) or not raw_steps:
        return None

    steps: List[Dict[str, str]] = []
    for raw_step in raw_steps[:6]:
        if not isinstance(raw_step, dict):
            continue
        # GPT sometimes embeds LaTeX inside captions ("Convert \frac{1}{2}…"),
        # which means captions hit the same `\f`-as-form-feed JSON bug as the
        # latex field. Run the same restorer so they don't render as garbled
        # ↑rac{1}{2} text on the frontend.
        caption = _sanitize_caption(str(raw_step.get("caption", "")))
        latex = _sanitize_latex(str(raw_step.get("latex", "")))
        if not latex:
            continue
        steps.append({"caption": caption, "latex": latex})

    if not steps:
        return None

    final_answer = _sanitize_latex(str(data.get("final_answer", "")))
    return StepCard(title=title, steps=steps, final_answer=final_answer)
