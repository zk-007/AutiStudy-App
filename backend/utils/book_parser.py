"""
Book Parser for AutiStudy
=========================
Reads grade-wise markdown textbooks and extracts chapters/units
so the quiz engine can generate questions from specific content.

Books live in AutiStudy-React/books_mds/ and follow three heading patterns:

  Science (gs)      : # Chapter 01  →  next # line = title
  Maths             : # Unit 1 Whole Numbers  (title in same line)
  Computer Science  : # UNIT 1  →  next # line = title
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ── Book location ──────────────────────────────────────────────────────────────
# Monorepo layout: AutiStudy-App/{backend, frontend}
# Backend lives at  …/AutiStudy-App/backend/
# Books live at     …/AutiStudy-App/frontend/books_mds/
_BACKEND_DIR = Path(__file__).parent.parent          # …/AutiStudy-App/backend
BOOKS_DIR = _BACKEND_DIR.parent / "frontend" / "books_mds"

# ── File map: (grade, subject) → relative path inside BOOKS_DIR ───────────────
BOOK_MAP: Dict[Tuple[int, str], str] = {
    (4, "Maths"):            "Grade 4/math/math_4_parse.md",
    (4, "General Science"):  "Grade 4/gs/gs_4.md",
    (5, "Maths"):            "Grade 5/math/math_5.md",
    (5, "General Science"):  "Grade 5/gs/gs_5.md",
    (6, "Maths"):            "Grade 6/math/math_6.md",
    (6, "General Science"):  "Grade 6/gs/gs_6.md",
    (6, "Computer Science"): "Grade 6/comp/comp_6.md",
    (7, "General Science"):  "Grade 7/gs/gs_7.md",
    (7, "Computer Science"): "Grade 7/comp/comp_7.md",
}

# ── Heading patterns ───────────────────────────────────────────────────────────
# Each pattern: group 1 = number string, group 2 = inline title (may be empty)
_PATTERNS = [
    # "# Chapter 01: Heat"  or  "# Chapter 5 Fractions"  or  "# Chapter 01"
    re.compile(r"^#{1,3}\s+Chapter\s+0*(\d+)[:\s]*(.*)$", re.IGNORECASE),
    # "# Unit 1 Whole Numbers"  or  "## Unit 3 Fractions"  or  "# Unit 5"
    re.compile(r"^#{1,3}\s+Unit\s+0*(\d+)[:\s]*(.*)$", re.IGNORECASE),
    # "# UNIT 1 Emerging Technologies"  or  "# UNIT 1"
    re.compile(r"^#{1,3}\s+UNIT\s+0*(\d+)[:\s]*(.*)$", re.IGNORECASE),
    # "# Sub-Domain 1: FACTORS"  (Grade 6 Maths)
    re.compile(r"^#{1,3}\s+Sub-Domain\s+0*(\d+)[:\s]*(.*)$", re.IGNORECASE),
    # "# 01 Cellular Organization"  or  "# 03 Flowers and Seeds"  (Grade 5/6 Science)
    re.compile(r"^#\s+0*(\d+)\s+([A-Z].+)$"),
    # "## Q1 Classification of Living Organisms"  (Grade 5 Science)
    re.compile(r"^#{1,3}\s+Q0*(\d+)\s+(.+)$", re.IGNORECASE),
]


def _get_book_path(grade: int, subject: str) -> Optional[Path]:
    key = (grade, subject)
    rel = BOOK_MAP.get(key)
    if rel is None:
        return None
    p = BOOKS_DIR / rel
    return p if p.exists() else None


def _parse_chapters(text: str) -> List[Dict]:
    """
    Return a list of dicts:
      { "number": int, "title": str, "start_line": int, "end_line": int }

    We do two passes:
      Pass 1 — find all heading lines that match a chapter/unit pattern.
      Pass 2 — for headings without an inline title, look ahead one non-blank line.
    """
    lines = text.splitlines()
    hits: List[Dict] = []  # raw hits before deduplication

    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        for pat in _PATTERNS:
            m = pat.match(line)
            if m:
                num = int(m.group(1))
                # Try inline title first
                title = m.group(2).strip() if len(m.groups()) >= 2 else ""
                # If no inline title, grab the next non-blank heading line
                if not title:
                    j = i + 1
                    while j < len(lines) and not lines[j].strip():
                        j += 1
                    if j < len(lines):
                        candidate = lines[j].lstrip("#").strip()
                        # Accept as title if it looks like a proper title
                        # (not too long, not a bullet, not a number-only line)
                        if candidate and len(candidate) < 120 and not candidate.startswith(("*", "-", "1.", "2.")):
                            title = candidate
                if not title:
                    title = f"Chapter {num}"
                hits.append({"number": num, "title": title, "start_line": i})
                break
        i += 1

    if not hits:
        return []

    # Filter out false positives that appear in the first 100 lines (title pages,
    # cover descriptions, etc.).  Real chapters always start deeper in the file.
    hits = [h for h in hits if h["start_line"] >= 100]

    if not hits:
        return []

    # Deduplicate: keep only the FIRST occurrence of each chapter number
    # (some books repeat the TOC at the end)
    seen: set = set()
    unique: List[Dict] = []
    for h in hits:
        if h["number"] not in seen:
            seen.add(h["number"])
            unique.append(h)

    # Set end_line for each chapter
    for idx, ch in enumerate(unique):
        ch["end_line"] = unique[idx + 1]["start_line"] - 1 if idx + 1 < len(unique) else len(lines) - 1

    return unique


def get_chapters(grade: int, subject: str) -> Optional[List[Dict]]:
    """
    Public API: return a list of chapter dicts for this grade+subject,
    each with keys: number (int), title (str).
    Returns None if no book file found.
    """
    path = _get_book_path(grade, subject)
    if path is None:
        return None
    text = path.read_text(encoding="utf-8", errors="ignore")
    chapters = _parse_chapters(text)
    # Clean up titles: remove HTML artifacts and sort by chapter number
    cleaned = []
    for ch in chapters:
        title = ch["title"].strip()
        if title.startswith("<") or not title:
            continue
        cleaned.append({"number": ch["number"], "title": title})
    cleaned.sort(key=lambda c: c["number"])
    return cleaned


def get_chapter_content(grade: int, subject: str, chapter_number: int, max_chars: int = 6000) -> Optional[str]:
    """
    Return the raw markdown text of a specific chapter, truncated to max_chars
    so it fits comfortably in a GPT-4o-mini context window.
    Returns None if not found.
    """
    path = _get_book_path(grade, subject)
    if path is None:
        return None
    text = path.read_text(encoding="utf-8", errors="ignore")
    chapters = _parse_chapters(text)

    target = next((ch for ch in chapters if ch["number"] == chapter_number), None)
    if target is None:
        return None

    lines = text.splitlines()
    chunk = "\n".join(lines[target["start_line"]: target["end_line"] + 1])

    # Trim image descriptions and very long table dumps to save tokens
    # Remove lines that are pure table HTML tags
    cleaned_lines = []
    for ln in chunk.splitlines():
        stripped = ln.strip()
        if stripped in ("<table>", "</table>", "<tbody>", "</tbody>", "<tr>", "</tr>", "<td>", "</td>"):
            continue
        cleaned_lines.append(ln)
    chunk = "\n".join(cleaned_lines)

    return chunk[:max_chars] if len(chunk) > max_chars else chunk
