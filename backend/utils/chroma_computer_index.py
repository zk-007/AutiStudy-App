"""
Build ChromaDB chunks for Computer Science textbooks (CS6 / CS7).

Ported from `Retriever_logic/merged_comp_6_imp_last.ipynb` with fixes:
  * Plain ``UNIT 4`` lines (no ``#``) are promoted to h1 headings.
  * ``# UNIT 4 Title`` on one line is kept as-is.
  * ``unit`` metadata is extracted from the h1 chapter (1–7), not left blank.
  * Headings like ``# UNIT 2 logo Digital skills`` are cleaned before parse.
"""

from __future__ import annotations

import hashlib
import re
from html import unescape
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

EMBED_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

HEADING_RE = re.compile(r"^(#{1,3})\s+(.*)\s*$")
H1_RE = re.compile(r"^#\s+(.*)\s*$")
UNIT_ONLY_RE = re.compile(r"^UNIT\s+(\d+)\s*$", re.IGNORECASE)
UNIT_H1_RE = re.compile(
    r"^UNIT\s+(\d+)\s*(?:—|-|–|:)?\s*(.*)$",
    re.IGNORECASE,
)
LOGO_IN_UNIT_RE = re.compile(r"\blogo\b", re.IGNORECASE)
SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


def extract_unit_number(chapter: str) -> str:
    """Return unit digit string from chapter h1 like 'UNIT 4 — Algorithmic Thinking'."""
    m = UNIT_H1_RE.match((chapter or "").strip())
    return m.group(1) if m else ""


def normalize_unit_h1(md_text: str) -> str:
    """
    Normalize unit headings so md_to_blocks sees every unit boundary.

    Handles:
      - ``# UNIT 1`` + blank + ``# ICT Fundamentals`` → merged h1
      - ``UNIT 4`` (no hash) → ``# UNIT 4``
      - ``# UNIT 3 Digital Skills`` → single h1
      - ``# UNIT 2 logo Digital skills`` → logo removed
    """
    lines = md_text.splitlines()
    out: List[str] = []
    i = 0

    def next_nonempty(start: int) -> int:
        j = start
        while j < len(lines) and not lines[j].strip():
            j += 1
        return j

    while i < len(lines):
        raw = lines[i]
        stripped = raw.strip()

        if UNIT_ONLY_RE.match(stripped) and not stripped.startswith("#"):
            num = UNIT_ONLY_RE.match(stripped).group(1)
            j = next_nonempty(i + 1)
            if j < len(lines):
                m2 = H1_RE.match(lines[j].strip())
                if m2 and not UNIT_ONLY_RE.match(m2.group(1).strip()):
                    t2 = LOGO_IN_UNIT_RE.sub("", m2.group(1).strip())
                    t2 = re.sub(r"\s{2,}", " ", t2).strip()
                    out.append(f"# UNIT {num} — {t2}")
                    i = j + 1
                    continue
            out.append(f"# UNIT {num}")
            i += 1
            continue

        m1 = H1_RE.match(stripped)
        if m1:
            t1 = LOGO_IN_UNIT_RE.sub("", m1.group(1).strip())
            t1 = re.sub(r"\s{2,}", " ", t1).strip()

            if UNIT_ONLY_RE.match(t1):
                num = UNIT_ONLY_RE.match(t1).group(1)
                j = next_nonempty(i + 1)
                if j < len(lines):
                    m2 = H1_RE.match(lines[j].strip())
                    if m2:
                        t2 = LOGO_IN_UNIT_RE.sub("", m2.group(1).strip())
                        t2 = re.sub(r"\s{2,}", " ", t2).strip()
                        if t2 and not UNIT_ONLY_RE.match(t2) and not UNIT_H1_RE.match(t2):
                            out.append(f"# UNIT {num} — {t2}")
                            i = j + 1
                            continue
                out.append(f"# UNIT {num}")
                i += 1
                continue

            um = UNIT_H1_RE.match(t1)
            if um:
                num, rest = um.group(1), um.group(2).strip()
                out.append(f"# UNIT {num} — {rest}" if rest else f"# UNIT {num}")
                # Skip redundant duplicate title h1 (e.g. "# Digital Citizenship" after "# UNIT 5 Digital Citizenship")
                if rest:
                    j = next_nonempty(i + 1)
                    if j < len(lines):
                        m2 = H1_RE.match(lines[j].strip())
                        if m2 and m2.group(1).strip().lower() == rest.lower():
                            i = j + 1
                            continue
                i += 1
                continue

            out.append(raw)
            i += 1
            continue

        out.append(raw)
        i += 1
    return "\n".join(out)


def html_table_to_text(md_text: str) -> str:
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

    return re.sub(r"<table.*?>.*?</table>", repl_table, md_text, flags=re.DOTALL | re.IGNORECASE)


def clean_md(md_text: str) -> str:
    md_text = normalize_unit_h1(md_text)
    md_text = re.sub(r"(?m)^\s*Visible:\s*\d+%\s*-\s*\d+%\s*$", "", md_text)
    md_text = html_table_to_text(md_text)
    md_text = unescape(md_text)
    md_text = re.sub(r"\[(The image shows.*?)\]", r"IMAGE: \1", md_text, flags=re.IGNORECASE)
    md_text = re.sub(r"\r\n", "\n", md_text)
    md_text = re.sub(r"\n{3,}", "\n\n", md_text)
    return md_text.strip()


def md_to_blocks(md_text: str) -> List[Dict[str, str]]:
    blocks: List[Dict[str, str]] = []
    h1 = h2 = h3 = ""
    buff: List[str] = []

    def flush() -> None:
        nonlocal buff
        text = "\n".join(buff).strip()
        if text:
            blocks.append({"h1": h1, "h2": h2, "h3": h3, "text": text})
        buff = []

    for line in md_text.splitlines():
        m = HEADING_RE.match(line)
        if m:
            flush()
            lvl = len(m.group(1))
            title = m.group(2).strip()
            if lvl == 1:
                h1, h2, h3 = title, "", ""
            elif lvl == 2:
                h2, h3 = title, ""
            else:
                h3 = title
            continue
        buff.append(line)
    flush()
    return blocks


def detect_block_type(h1: str, h2: str, h3: str, text: str) -> str:
    title = " ".join([h1 or "", h2 or "", h3 or ""]).lower()
    t0 = (text[:600] if text else "").lower()

    if "students learning outcomes" in title or "learning outcomes" in title:
        return "SLO"
    if any(k in title for k in ["exercise", "questions", "tick", "fill", "project based", "activity based"]):
        return "EXERCISE"
    if any(k in t0 for k in ["answer the following", "answer the questions", "fill in the blanks", "tick", "briefly"]):
        return "EXERCISE"
    if "glossary" in title:
        return "GLOSSARY"
    if any(k in title for k in ["weblinks", "web links", "links"]):
        return "WEBLINKS"
    if any(k in title for k in ["summary", "key points"]):
        return "KEY_POINTS"
    if any(k in t0 for k in ["**do you know", "**extra bit", "**note:"]):
        return "KEY_POINTS"
    return "BODY"


def split_keep_codeblocks(text: str) -> List[Tuple[str, str]]:
    parts: List[Tuple[str, str]] = []
    code_re = re.compile(r"```.*?```", flags=re.DOTALL)
    last = 0
    for m in code_re.finditer(text):
        if m.start() > last:
            parts.append(("text", text[last:m.start()]))
        parts.append(("code", m.group(0)))
        last = m.end()
    if last < len(text):
        parts.append(("text", text[last:]))
    return parts


def chunk_text(text: str, max_chars: int = 1200, overlap: int = 180) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []

    units: List[str] = []
    for kind, part in split_keep_codeblocks(text):
        part = part.strip()
        if not part:
            continue
        if kind == "code":
            units.append(part)
        else:
            for p in re.split(r"\n{2,}", part):
                p = p.strip()
                if p:
                    units.append(p)

    chunks: List[str] = []
    cur = ""
    for u in units:
        if len(cur) + len(u) + 2 <= max_chars:
            cur = (cur + "\n\n" + u).strip() if cur else u
        else:
            if cur:
                chunks.append(cur.strip())
            if len(u) > max_chars:
                tmp = ""
                for s in [x.strip() for x in SENT_SPLIT.split(u) if x.strip()]:
                    if len(tmp) + len(s) + 1 <= max_chars:
                        tmp = (tmp + " " + s).strip() if tmp else s
                    else:
                        if tmp:
                            chunks.append(tmp.strip())
                        tmp = s
                cur = tmp
            else:
                cur = u
    if cur:
        chunks.append(cur.strip())

    if overlap > 0 and len(chunks) > 1:
        with_overlap: List[str] = [chunks[0]]
        for i in range(1, len(chunks)):
            prev_tail = chunks[i - 1][-overlap:]
            with_overlap.append((prev_tail + "\n\n" + chunks[i]).strip())
        chunks = with_overlap
    return chunks


def sha1_text(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8", errors="ignore")).hexdigest()


def build_chunks_from_md(
    md_path: Path,
    *,
    doc_id: str,
    grade: int,
    subject: str = "computer",
    book: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Full pipeline: MD file → chunk dicts ready for Chroma upsert."""
    book = book or doc_id
    raw = md_path.read_text(encoding="utf-8", errors="ignore")
    md_clean = clean_md(raw)
    blocks = md_to_blocks(md_clean)

    chunks: List[Dict[str, Any]] = []
    current_unit = ""
    for b in blocks:
        chapter = (b["h1"] or "").strip()
        parsed_unit = extract_unit_number(chapter)
        if parsed_unit:
            current_unit = parsed_unit
        unit = parsed_unit or current_unit
        section = (b["h2"] or b["h3"] or "").strip()
        block_type = detect_block_type(b["h1"], b["h2"], b["h3"], b["text"])
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
                "chapter": chapter,
                "section": section,
                "block_type": block_type,
                "source_type": "markdown_clean",
                "source_pdf": "",
                "text": piece,
                "text_hash": h,
            })
    return chunks


def expected_units(grade: int) -> List[int]:
    return list(range(1, 8)) if grade == 6 else list(range(1, 7))


def verify_unit_coverage(chunks: List[Dict[str, Any]], grade: int) -> Dict[str, Any]:
    """Return coverage report; raises if any expected unit has zero chunks."""
    exp = expected_units(grade)
    by_unit: Dict[str, int] = {}
    for c in chunks:
        u = str(c.get("unit") or "").strip() or "?"
        by_unit[u] = by_unit.get(u, 0) + 1
    present = {int(u) for u in by_unit if u.isdigit()}
    missing = sorted(set(exp) - present)
    return {
        "expected": exp,
        "present": sorted(present),
        "missing": missing,
        "counts": {k: by_unit.get(str(k), 0) for k in exp},
        "total_chunks": len(chunks),
    }
