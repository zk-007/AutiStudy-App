"""
Book Parser for AutiStudy
=========================
Reads grade-wise markdown textbooks and extracts chapters/units
so the quiz engine can generate questions from specific content.

Books live in frontend/books_mds/ with these heading styles:

  Maths (Gr 4–5)   : Unit 1 Whole Numbers        (no #, plain line)
                     Unit 8: Perimeter and Area
                     # Unit 5 Distance and Time  (with #, mixed in same book)
  Maths (Gr 6)     : # Sub-Domain 1: FACTORS
                     80 | Sub-Domain-6: ALGEBRA  (page header, no #)
  Maths (Gr 7)     : CHAPTER 1  /  CHAPTER  (bare) + # CHAPTER 8 TITLE
  Science          : # Chapter 01  + title on next line
                     # 03 Flowers and Seeds
                     # O2 Microorganisms  (OCR: zero read as letter O)
                     ## Q1 Classification…  (Grade 5 ch 1)
  Computer         : # UNIT 1 Emerging Technologies
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ── Book location ──────────────────────────────────────────────────────────────
# Monorepo layout: AutiStudy-App/{backend, frontend}
# Backend lives at  …/AutiStudy-App/backend/
# Books live at     …/AutiStudy-App/frontend/books_mds/
# Docker/Railway sets BOOKS_DIR=/app/books_mds (see backend/Dockerfile).
_BACKEND_DIR = Path(__file__).parent.parent          # …/AutiStudy-App/backend
_DEFAULT_BOOKS = _BACKEND_DIR.parent / "frontend" / "books_mds"
BOOKS_DIR = Path(os.getenv("BOOKS_DIR", str(_DEFAULT_BOOKS)))

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
    (7, "Maths"):            "Grade 7/math/math_parse_7.md",
}

# ── Heading patterns ───────────────────────────────────────────────────────────
# Each pattern: group 1 = number string, group 2 = inline title (may be empty)
_PATTERNS = [
    # OCR typo: "# O2 Microorganisms" (zero read as letter O in Grade 5 Science)
    re.compile(r"^#\s+O(\d)\s+(.+)$", re.IGNORECASE),
    # Grade 7 Maths: "# CHAPTER 8 ALGEBRAIC EXPRESSIONS"
    re.compile(r"^#\s+CHAPTER\s+0*(\d+)[:\s]*(.*)$", re.IGNORECASE),
    # Grade 7 Maths: "CHAPTER 1" / "CHAPTER 11"
    re.compile(r"^CHAPTER\s+0*(\d+)\s*$", re.IGNORECASE),
    # Plain Unit (no hash) — Grade 4/5 Maths: "Unit 1 Whole Numbers", "Unit 8: Perimeter"
    re.compile(r"^Unit\s+0*(\d+)\s*[:.]?\s+(.+)$", re.IGNORECASE),
    # Sub-Domain page header — Grade 6 Maths: "80 | Sub-Domain-6: ALGEBRAIC EXPRESSIONS"
    re.compile(r"^(?:\d+\s*\|\s*)?Sub-Domain[-\s]+0*(\d+)\s*:\s*(.+)$", re.IGNORECASE),
    # "# Chapter 01: Heat"  or  "# Chapter 5 Fractions"  or  "# Chapter 01"
    re.compile(r"^#{1,3}\s+Chapter\s+0*(\d+)[:\s]*(.*)$", re.IGNORECASE),
    # "# Unit 1 Whole Numbers"  or  "## Unit 3 Fractions"  (not ### — that's end TOC)
    re.compile(r"^#{1,2}\s+Unit\s+0*(\d+)[:\s]*(.*)$", re.IGNORECASE),
    # "# UNIT 1 Emerging Technologies"  or  "# UNIT 1"
    re.compile(r"^#{1,2}\s+UNIT\s+0*(\d+)[:\s]*(.*)$", re.IGNORECASE),
    # "# Sub-Domain 1: FACTORS" or "# Sub-Domain 8 SURFACE AREA" (Grade 6 Maths)
    re.compile(r"^#{1,3}\s+Sub-Domain\s+0*(\d+)\s*:?\s*(.*)$", re.IGNORECASE),
    # "# 01 Cellular Organization"  or  "# 03 Flowers and Seeds"  (Grade 5/6 Science)
    re.compile(r"^#\s+0*(\d+)\s+([A-Z].+)$"),
    # "## Q1 Classification of Living Organisms"  (Grade 5 Science)
    re.compile(r"^#{1,3}\s+Q0*(\d+)\s+(.+)$", re.IGNORECASE),
]

_CHAPTER_ONLY = re.compile(r"^CHAPTER\s*$", re.IGNORECASE)
_CHAPTER_ICON = re.compile(r"^Chapter\s+0*(\d+)\s+icon", re.IGNORECASE)
_SKIP_TITLE_PREFIXES = ("Student Learning", "After studying", "Animation ", "Students Learning", "Students' Learning")
_JUNK_TITLE_RE = re.compile(
    r"^(COMPUTER SCIENCE|MATHEMATICS|GENERAL SCIENCE|MATH)\s*\d*$",
    re.IGNORECASE,
)


def _resolve_chapter_title(lines: List[str], start_idx: int, num: int, title: str) -> str:
    """Fill in a chapter title when the heading line has none (Grade 7 style)."""
    if title and not title.isdigit():
        return title

    j = start_idx + 1
    while j < len(lines) and j < start_idx + 10:
        cand = lines[j].strip()
        if not cand or _CHAPTER_ONLY.match(cand):
            j += 1
            continue
        if _CHAPTER_ICON.match(cand):
            j += 1
            continue
        if cand.startswith("#"):
            candidate = cand.lstrip("#").strip()
            if candidate.isdigit():
                j += 1
                continue
            if candidate and len(candidate) < 120 and not candidate.startswith("*"):
                if not any(candidate.startswith(p) for p in _SKIP_TITLE_PREFIXES):
                    return candidate
        elif (
            cand.isupper()
            and 2 < len(cand) < 80
            and not cand.startswith("*")
            and not any(cand.startswith(p) for p in _SKIP_TITLE_PREFIXES)
        ):
            return cand
        j += 1

    return title if title and not title.isdigit() else f"Chapter {num}"


def _is_junk_hit(num: int, title: str, start_line: int, grade: int) -> bool:
    """Drop cover-page false positives (e.g. '# 7 COMPUTER SCIENCE' on page 1)."""
    t = title.strip()
    if _JUNK_TITLE_RE.match(t):
        return True
    if start_line < 80 and t.isdigit() and int(t) == grade:
        return True
    return False


def _parse_chapter_block(lines: List[str], start_idx: int) -> Optional[Dict]:
    """Parse Grade 7 blocks that start with a bare 'CHAPTER' line."""
    num: Optional[int] = None
    title = ""
    j = start_idx + 1

    while j < len(lines) and j < start_idx + 12:
        cand = lines[j].strip()
        if not cand:
            j += 1
            continue
        if _CHAPTER_ONLY.match(cand):
            break

        icon = _CHAPTER_ICON.match(cand)
        if icon:
            num = int(icon.group(1))
            j += 1
            continue

        m_num_title = re.match(r"^#\s+0*(\d+)\s+(.+)$", cand)
        if m_num_title:
            num = int(m_num_title.group(1))
            title = m_num_title.group(2).strip()
            break

        m_hash_num = re.match(r"^#\s+0*(\d+)\s*$", cand)
        if m_hash_num and num is None:
            num = int(m_hash_num.group(1))
            j += 1
            continue

        m_plain_num = re.match(r"^0*(\d+)\s*$", cand)
        if m_plain_num and num is None:
            num = int(m_plain_num.group(1))
            j += 1
            continue

        if cand.startswith("#"):
            candidate = cand.lstrip("#").strip()
            if candidate and not candidate.isdigit() and len(candidate) < 120:
                if not any(candidate.startswith(p) for p in _SKIP_TITLE_PREFIXES):
                    title = candidate
                    if num is not None:
                        break
        elif (
            cand.isupper()
            and 2 < len(cand) < 80
            and not cand.startswith("*")
            and not any(cand.startswith(p) for p in _SKIP_TITLE_PREFIXES)
        ):
            title = cand
            if num is not None:
                break
        j += 1

    if num is None:
        return None
    return {"number": num, "title": title or f"Chapter {num}", "start_line": start_idx}


_SUBJECT_ALIASES = {
    "Computer": "Computer Science",
}


def normalize_book_subject(subject: str) -> str:
    """Map API subject labels to BOOK_MAP keys."""
    return _SUBJECT_ALIASES.get(subject, subject)


def _get_book_path(grade: int, subject: str) -> Optional[Path]:
    key = (grade, normalize_book_subject(subject))
    rel = BOOK_MAP.get(key)
    if rel is None:
        return None
    p = BOOKS_DIR / rel
    return p if p.exists() else None


def _parse_chapters(
    text: str,
    min_start_line: int = 0,
    grade: int = 0,
) -> List[Dict]:
    """
    Return a list of dicts:
      { "number": int, "title": str, "start_line": int, "end_line": int }

    Finds heading lines matching chapter/unit patterns, then keeps the earliest
    occurrence of each chapter number (skips duplicate TOC entries at book end).
    """
    lines = text.splitlines()
    hits: List[Dict] = []

    i = 0
    while i < len(lines):
        line = lines[i].rstrip()

        if _CHAPTER_ONLY.match(line):
            block = _parse_chapter_block(lines, i)
            if block and not _is_junk_hit(block["number"], block["title"], block["start_line"], grade):
                hits.append(block)
            i += 1
            continue

        for pat in _PATTERNS:
            m = pat.match(line)
            if m:
                num = int(m.group(1))
                title = m.group(2).strip() if len(m.groups()) >= 2 else ""
                title = _resolve_chapter_title(lines, i, num, title)
                if not _is_junk_hit(num, title, i, grade):
                    hits.append({"number": num, "title": title, "start_line": i})
                break
        i += 1

    if not hits:
        return []

    hits = [h for h in hits if h["start_line"] >= min_start_line]
    if not hits:
        return []

    # Keep the earliest occurrence of each chapter number (real content beats end TOC)
    best: Dict[int, Dict] = {}
    for h in hits:
        n = h["number"]
        if n not in best or h["start_line"] < best[n]["start_line"]:
            best[n] = h

    unique = sorted(best.values(), key=lambda c: c["start_line"])

    for idx, ch in enumerate(unique):
        ch["end_line"] = unique[idx + 1]["start_line"] - 1 if idx + 1 < len(unique) else len(lines) - 1

    return unique


def format_book_units_list(
    grade: int,
    subject: str,
    language: str = "en",
    max_items: int = 24,
) -> str:
    """Format chapter/unit titles from the textbook for off-topic tutor replies."""
    chapters = get_chapters(grade, subject)
    if not chapters:
        return ""

    heading = (
        f"Grade {grade} {subject} book topics:"
        if language == "en"
        else f"جماعت {grade} {subject} کتاب کے موضوعات:"
    )
    lines = [heading]
    for ch in chapters[:max_items]:
        lines.append(f"  {ch['number']}. {ch['title']}")
    if len(chapters) > max_items:
        extra = len(chapters) - max_items
        if language == "en":
            lines.append(f"  … and {extra} more")
        else:
            lines.append(f"  … اور {extra} مزید")
    return "\n".join(lines)


def get_chapters(grade: int, subject: str) -> Optional[List[Dict]]:
    """
    Public API: return a list of chapter dicts for this grade+subject,
    each with keys: number (int), title (str).
    Returns None if no book file found.
    """
    subject = normalize_book_subject(subject)
    path = _get_book_path(grade, subject)
    if path is None:
        return None
    text = path.read_text(encoding="utf-8", errors="ignore")
    chapters = _parse_chapters(text, min_start_line=0, grade=grade)
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
    chapters = _parse_chapters(text, min_start_line=0, grade=grade)

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
