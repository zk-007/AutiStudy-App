"""
utils/ocr.py  —  EasyOCR-based NADRA CRC / B-Form scanner
===========================================================

Validation logic (any ONE is sufficient):
  A. Text "crc" detected by OCR
  B. CRC number pattern found  (e.g. 100626-11-0001663-03)
  C. 3 or more distinct 13-digit CNIC numbers found in the image
     → Only a genuine NADRA CRC can have that many CNICs

CNIC column extraction (right-to-left position):
  On every NADRA CRC table:
    col rightmost  → children's own CNICs  (ignored)
    col 2nd right  → Father's CNIC
    col 3rd right  → Mother's CNIC  (may be absent → "0")
"""
from __future__ import annotations

import io
import logging
import re
import sys
from typing import Optional

logger = logging.getLogger(__name__)

# ── Patterns ──────────────────────────────────────────────────────────────────
_CNIC_RE   = re.compile(r"(\d{5}[-\s]?\d{7}[-\s]?\d{1})")
_CRC_NO_RE = re.compile(r"\d{6}-\d{2}-\d{7}-\d{2}")   # e.g. 100626-11-0001663-03


def _norm(raw: str) -> str:
    d = re.sub(r"\D", "", raw)
    return f"{d[:5]}-{d[5:12]}-{d[12]}" if len(d) == 13 else raw


# ── Singleton reader ──────────────────────────────────────────────────────────
_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        try:
            import easyocr  # type: ignore
        except ImportError:
            raise RuntimeError("Run: pip install easyocr")

        # Windows: suppress Unicode block chars in progress bars
        if hasattr(sys.stdout, "buffer"):
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer,
                                          encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "buffer"):
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer,
                                          encoding="utf-8", errors="replace")

        logger.info("Loading EasyOCR model…")
        _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        logger.info("EasyOCR ready.")
    return _reader


# ── Image pre-processing ──────────────────────────────────────────────────────

def _preprocess(image_bytes: bytes) -> bytes:
    """
    Boost contrast and sharpen the image so OCR can read faint/low-res scans.
    Returns JPEG bytes of the processed image.
    """
    try:
        import cv2          # type: ignore
        import numpy as np

        buf   = np.frombuffer(image_bytes, dtype=np.uint8)
        img   = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if img is None:
            return image_bytes

        # 1. Grayscale
        gray  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 2. Upscale small images (min 1500px wide for clean digit OCR)
        h, w  = gray.shape
        if w < 1500:
            scale = 1500 / w
            gray  = cv2.resize(gray, None, fx=scale, fy=scale,
                               interpolation=cv2.INTER_CUBIC)

        # 3. Adaptive threshold to handle uneven lighting
        gray  = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=31, C=10
        )

        # 4. Slight dilation to thicken thin characters
        kernel = np.ones((1, 1), np.uint8)
        gray   = cv2.dilate(gray, kernel, iterations=1)

        ok, encoded = cv2.imencode(".jpg", gray,
                                   [cv2.IMWRITE_JPEG_QUALITY, 95])
        return encoded.tobytes() if ok else image_bytes

    except Exception as e:
        logger.warning("Pre-processing skipped: %s", e)
        return image_bytes


# ── Main public function ──────────────────────────────────────────────────────

def extract_cnic_from_bform(image_bytes: bytes) -> dict:
    """
    Returns:
        {
          "is_bform":    bool,
          "father_cnic": str | None,
          "mother_cnic": str,       # "0" if absent
          "raw_text":    str,
          "error":       str | None,
        }
    """
    import tempfile, os

    result: dict = {
        "is_bform":    False,
        "father_cnic": None,
        "mother_cnic": "0",
        "raw_text":    "",
        "error":       None,
    }

    # Pre-process to improve OCR accuracy
    processed = _preprocess(image_bytes)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(processed)
        tmp_path = tmp.name

    try:
        reader     = _get_reader()
        detections = reader.readtext(tmp_path, detail=1)   # [[bbox, text, conf]]
    except Exception as exc:
        result["error"] = f"OCR engine error: {exc}"
        return result
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    if not detections:
        result["error"] = "Could not read any text. Try a clearer, well-lit photo."
        return result

    all_texts = [str(d[1]) for d in detections]
    full_text  = " ".join(all_texts).lower()
    result["raw_text"] = full_text

    # ── Validation ────────────────────────────────────────────────────────────
    all_cnic_raw   = _CNIC_RE.findall(full_text)
    unique_cnics   = list(dict.fromkeys(_norm(m) for m in all_cnic_raw))

    has_crc_text   = "crc" in full_text or "b-form" in full_text or "b form" in full_text
    has_crc_number = bool(_CRC_NO_RE.search(full_text))
    has_many_cnics = len(unique_cnics) >= 3   # 3+ CNICs = definitely a NADRA family doc

    if not has_crc_text and not has_crc_number and not has_many_cnics:
        result["error"] = (
            "Could not confirm this is a NADRA CRC / B-Form.\n"
            "Please upload a clear photo of your Family Registration Certificate "
            "or B-Form. Make sure the document is flat and well-lit."
        )
        return result

    result["is_bform"] = True

    if not unique_cnics:
        result["error"] = (
            "Document recognised but no CNIC numbers could be read. "
            "Please try a clearer, well-lit photo."
        )
        return result

    # ── Frequency-based parent CNIC extraction ───────────────────────────────
    # On a NADRA CRC, the parent's CNIC repeats once per child row.
    # Children's CNICs each appear exactly once.
    # → Most frequent CNIC(s) = parent(s). Single-occurrence = children (skip).

    from collections import Counter
    freq = Counter(_norm(m) for m in _CNIC_RE.findall(full_text)
                   if len(re.sub(r"\D", "", m)) == 13)

    if not freq:
        result["error"] = (
            "Document recognised but no CNIC numbers could be read. "
            "Please try a clearer, well-lit photo."
        )
        return result

    # Sort by frequency descending
    ranked = freq.most_common()  # [(cnic, count), ...]

    # Also exclude the child's own CNIC (already entered by the child during signup)
    # so it doesn't get picked as a "parent"
    # We can't know it here, so just trust frequency:
    # parent CNIC appears N times (N = number of children listed), children appear once.

    # Separate: repeating CNICs (count > 1) = parents; singletons = children
    repeating = [(c, n) for c, n in ranked if n > 1]
    singletons = [(c, n) for c, n in ranked if n == 1]

    if repeating:
        # Father = most frequent repeating CNIC
        result["father_cnic"] = repeating[0][0]
        # Mother = second repeating CNIC (if exists)
        if len(repeating) >= 2:
            result["mother_cnic"] = repeating[1][0]
        # else mother_cnic stays "0"
    else:
        # All CNICs appear only once (low-quality scan or small family).
        # Fall back: most frequent overall = most likely the parent.
        result["father_cnic"] = ranked[0][0]
        if len(ranked) >= 2:
            result["mother_cnic"] = ranked[1][0]

    return result
