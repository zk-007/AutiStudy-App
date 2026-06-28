"""
utils/ocr.py  —  EasyOCR-based NADRA CRC / B-Form scanner
===========================================================

Designed for phone camera photos (not scanner-quality images).
Extracts CNIC numbers and verifies the uploaded document looks like
a B-Form / CRC. Accepts signup when the child's typed CNIC appears
on the photo, even if OCR misses document headers.
"""
from __future__ import annotations

import io
import logging
import os
import re
import sys
import tempfile
from collections import Counter
from typing import List, Optional

logger = logging.getLogger(__name__)

_CNIC_RE = re.compile(r"(\d{5}[-\s]?\d{7}[-\s]?\d{1})")
_CRC_NO_RE = re.compile(r"\d{6}-\d{2}-\d{7}-\d{2}")
_BARE_13_RE = re.compile(r"\d{13}")

_DOC_KEYWORDS = (
    "crc", "b-form", "b form", "bform", "nadra", "registration",
    "certificate", "child registration", "family registration",
    "cnic", "identity", "pakistan", "form",
)

_reader = None


def _norm(raw: str) -> str:
    d = re.sub(r"\D", "", raw)
    return f"{d[:5]}-{d[5:12]}-{d[12]}" if len(d) == 13 else raw


def _digits(raw: str) -> str:
    return re.sub(r"\D", "", raw)


def preload_ocr() -> None:
    """Load EasyOCR at server startup so the first signup scan is fast."""
    try:
        _get_reader()
        print("[ocr] EasyOCR preloaded.")
    except Exception as exc:
        print(f"[ocr] EasyOCR preload skipped (non-fatal): {exc}")


def _get_reader():
    global _reader
    if _reader is not None:
        return _reader
    try:
        import easyocr  # type: ignore
    except ImportError:
        raise RuntimeError("Run: pip install easyocr")

    if hasattr(sys.stdout, "buffer"):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "buffer"):
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

    logger.info("Loading EasyOCR model…")
    _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    logger.info("EasyOCR ready.")
    return _reader


def _preprocess_variants(image_bytes: bytes) -> List[bytes]:
    """Return several image variants — OCR runs on each and results merge."""
    variants: List[bytes] = [image_bytes]
    try:
        import cv2  # type: ignore
        import numpy as np

        buf = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if img is None:
            return variants

        h, w = img.shape[:2]
        if w < 1200:
            scale = 1200 / w
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

        # Variant 1: mild contrast (good for phone photos / glare)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        ok, enc = cv2.imencode(".jpg", enhanced, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if ok:
            variants.append(enc.tobytes())

        # Variant 2: color upscaled (sometimes better for red/blue NADRA forms)
        ok2, enc2 = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if ok2:
            variants.append(enc2.tobytes())

    except Exception as exc:
        logger.warning("Pre-processing skipped: %s", exc)

    return variants


def _read_text_from_image(image_bytes: bytes) -> str:
    reader = _get_reader()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name
    try:
        detections = reader.readtext(tmp_path, detail=1)
        return " ".join(str(d[1]) for d in detections)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _collect_cnics(*texts: str) -> List[str]:
    seen: set[str] = set()
    ordered: List[str] = []
    for text in texts:
        for match in _CNIC_RE.findall(text):
            cnic = _norm(match)
            if len(_digits(cnic)) == 13 and cnic not in seen:
                seen.add(cnic)
                ordered.append(cnic)
        compact = re.sub(r"\s+", "", text)
        for bare in _BARE_13_RE.findall(compact):
            cnic = _norm(bare)
            if cnic not in seen:
                seen.add(cnic)
                ordered.append(cnic)
    return ordered


def _looks_like_bform(full_text: str, unique_cnics: List[str], expected_child_cnic: Optional[str]) -> bool:
    if expected_child_cnic:
        child_digits = _digits(expected_child_cnic)
        if child_digits and any(_digits(c) == child_digits for c in unique_cnics):
            return True

    lower = full_text.lower()
    if any(kw in lower for kw in _DOC_KEYWORDS):
        return len(unique_cnics) >= 1
    if _CRC_NO_RE.search(full_text):
        return True
    if len(unique_cnics) >= 3:
        return True
    if len(unique_cnics) >= 2:
        return True
    return False


def _pick_parent_cnics(unique_cnics: List[str], full_text: str, child_cnic: Optional[str]) -> tuple[Optional[str], str]:
    child_digits = _digits(child_cnic or "")
    others = [c for c in unique_cnics if _digits(c) != child_digits]

    if not others:
        return None, "0"

    freq = Counter(_norm(m) for m in _CNIC_RE.findall(full_text) if len(_digits(m)) == 13)
    for bare in _BARE_13_RE.findall(re.sub(r"\s+", "", full_text)):
        freq[_norm(bare)] += 1

    ranked = [(c, freq.get(c, 1)) for c in others]
    ranked.sort(key=lambda x: (-x[1], x[0]))

    repeating = [c for c, n in ranked if n > 1 and _digits(c) != child_digits]
    if repeating:
        father = repeating[0]
        mother = repeating[1] if len(repeating) > 1 else "0"
        return father, mother

    father = ranked[0][0]
    mother = ranked[1][0] if len(ranked) > 1 else "0"
    return father, mother


def extract_cnic_from_bform(image_bytes: bytes, expected_child_cnic: Optional[str] = None) -> dict:
    """
    Scan a B-Form / CRC photo and extract parent CNICs.

    expected_child_cnic: the CNIC the student typed at signup — if this
    number appears in the OCR output, the document is accepted even when
    headers like "CRC" are not read.
    """
    result: dict = {
        "is_bform": False,
        "father_cnic": None,
        "mother_cnic": "0",
        "raw_text": "",
        "error": None,
    }

    try:
        texts: List[str] = []
        for variant in _preprocess_variants(image_bytes):
            try:
                texts.append(_read_text_from_image(variant))
            except Exception as exc:
                logger.warning("OCR pass failed: %s", exc)

        full_text = " ".join(t for t in texts if t).strip()
        result["raw_text"] = full_text

        if not full_text:
            result["error"] = (
                "Could not read any text from the photo. "
                "Try again with even lighting and the full document in frame."
            )
            return result

        unique_cnics = _collect_cnics(full_text)

        if not _looks_like_bform(full_text, unique_cnics, expected_child_cnic):
            result["error"] = (
                "Could not verify this as your B-Form / CRC. "
                "Make sure the photo shows your full document and your CNIC number is visible."
            )
            return result

        if not unique_cnics and expected_child_cnic:
            unique_cnics = [_norm(expected_child_cnic)]

        if not unique_cnics:
            result["error"] = (
                "Document looks valid but no CNIC numbers were read. "
                "Please retake the photo closer to the CNIC line."
            )
            return result

        result["is_bform"] = True
        father, mother = _pick_parent_cnics(unique_cnics, full_text, expected_child_cnic)
        result["father_cnic"] = father
        result["mother_cnic"] = mother
        return result

    except Exception as exc:
        result["error"] = f"OCR engine error: {exc}"
        return result
