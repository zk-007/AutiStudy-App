"""
Build ChromaDB chunks for Maths markdown textbooks (Grade 7 first).

Uses ``book_parser._parse_chapters`` for reliable chapter boundaries, then
applies the same paragraph chunking pipeline as Computer Science indexing.
Each chunk gets ``unit=<chapter number>`` metadata for filtering.
"""

from __future__ import annotations

import hashlib
import re
from html import unescape
from pathlib import Path
from typing import Any, Dict, List

from utils.book_parser import _parse_chapters
from utils.chroma_computer_index import (
    EMBED_MODEL_NAME,
    chunk_text,
    detect_block_type,
)

HEADING_RE = re.compile(r"^(#{1,3})\s+(.*)\s*$")
CHAPTER_LINE_RE = re.compile(r"^CHAPTER\s*$", re.IGNORECASE)


def _clean_md_blob(text: str) -> str:
    text = (text or "").replace("\r\n", "\n")

    def repl_table(match: re.Match) -> str:
        table_html = match.group(0)
        rows = re.findall(r"<tr.*?>(.*?)</tr>", table_html, flags=re.DOTALL | re.IGNORECASE)
        out_rows: List[str] = []
        for r in rows:
            cells = re.findall(r"<t[dh].*?>(.*?)</t[dh]>", r, flags=re.DOTALL | re.IGNORECASE)
            cells = [unescape(re.sub(r"<.*?>", "", c)) for c in cells]
            cells = [re.sub(r"\s+", " ", c).strip() for c in cells if c.strip()]
            if cells:
                out_rows.append(" | ".join(cells))
        return "\n" + "\n".join(out_rows) + "\n" if out_rows else "\n"

    text = re.sub(r"<table.*?>.*?</table>", repl_table, text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"\[(The image shows.*?)\]", r"IMAGE: \1", text, flags=re.IGNORECASE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _map_math_block_type(computer_type: str, h2: str, h3: str, text: str) -> str:
    """Map computer-style types to math retrieval block types."""
    title = f"{h2} {h3}".lower()
    t0 = (text[:400] if text else "").lower()
    if computer_type == "EXERCISE" or "exercise" in title:
        return "question" if re.search(r"^\s*\d+[\.)]", t0, re.M) else "practice"
    if computer_type == "SLO":
        return "explanation"
    if computer_type in {"GLOSSARY"}:
        return "glossary"
    if computer_type == "KEY_POINTS" or "key fact" in title or "remember" in t0[:120]:
        return "rule"
    if "try yourself" in title or "try it" in title:
        return "practice"
    return "explanation"


def _blocks_in_chapter(chapter_text: str, chapter_h1: str) -> List[Dict[str, str]]:
    """Parse ## / ### sections inside a chapter slice; h1 is fixed."""
    blocks: List[Dict[str, str]] = []
    h1 = chapter_h1
    h2 = h3 = ""
    buff: List[str] = []

    def flush() -> None:
        nonlocal buff
        text = "\n".join(buff).strip()
        if text:
            blocks.append({"h1": h1, "h2": h2, "h3": h3, "text": text})
        buff = []

    for line in chapter_text.splitlines():
        stripped = line.strip()
        if not stripped:
            buff.append(line)
            continue
        if CHAPTER_LINE_RE.match(stripped):
            continue
        if re.match(r"^CHAPTER\s+\d", stripped, re.I):
            continue
        if re.match(r"^#\s+CHAPTER\s", stripped, re.I):
            continue

        m = HEADING_RE.match(line)
        if m:
            lvl = len(m.group(1))
            title = m.group(2).strip()
            if lvl == 1:
                # skip inner h1 duplicates
                continue
            flush()
            if lvl == 2:
                h2, h3 = title, ""
            else:
                h3 = title
            continue
        buff.append(line)
    flush()
    return blocks


def sha1_text(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8", errors="ignore")).hexdigest()


def build_chunks_from_md(
    md_path: Path,
    *,
    doc_id: str,
    grade: int,
    subject: str = "mathematics",
    book: str | None = None,
) -> List[Dict[str, Any]]:
    book = book or doc_id
    raw = md_path.read_text(encoding="utf-8", errors="ignore")
    lines = raw.splitlines()
    chapters = _parse_chapters(raw, min_start_line=0, grade=grade)

    chunks: List[Dict[str, Any]] = []
    for ch in chapters:
        num = int(ch["number"])
        title = ch["title"].strip()
        chapter_h1 = f"CHAPTER {num} — {title}"
        unit = str(num)
        slice_text = "\n".join(lines[ch["start_line"]: ch["end_line"] + 1])
        slice_text = _clean_md_blob(slice_text)
        if not slice_text:
            continue

        blocks = _blocks_in_chapter(slice_text, chapter_h1)
        if not blocks:
            blocks = [{"h1": chapter_h1, "h2": "", "h3": "", "text": slice_text}]

        for b in blocks:
            ctype = detect_block_type(b["h1"], b["h2"], b["h3"], b["text"])
            block_type = _map_math_block_type(ctype, b["h2"], b["h3"], b["text"])
            section = (b["h2"] or b["h3"] or "").strip()
            for piece in chunk_text(b["text"], max_chars=1200, overlap=180):
                h = sha1_text(piece)
                chunk_id = f"{doc_id}__{len(chunks):06d}__{h[:8]}"
                chunks.append({
                    "chunk_id": chunk_id,
                    "doc_id": doc_id,
                    "grade": grade,
                    "subject": subject,
                    "book": book,
                    "unit": unit,
                    "chapter": chapter_h1,
                    "section": section,
                    "block_type": block_type,
                    "source_type": "markdown_clean",
                    "source_pdf": "",
                    "text": piece,
                    "text_hash": h,
                })
    return chunks


def verify_unit_coverage(chunks: List[Dict[str, Any]], expected_units: List[int]) -> Dict[str, Any]:
    present = sorted({int(c["unit"]) for c in chunks if str(c.get("unit", "")).isdigit()})
    missing = sorted(set(expected_units) - set(present))
    counts = {u: sum(1 for c in chunks if c.get("unit") == str(u)) for u in expected_units}
    return {
        "expected": expected_units,
        "present": present,
        "missing": missing,
        "counts": counts,
        "total_chunks": len(chunks),
    }
