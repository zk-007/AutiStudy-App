"""Normalize names/CNICs and generate family codes for parent–child linking."""
from __future__ import annotations

import random
import re
from typing import Optional


def normalize_name(name: Optional[str]) -> str:
    """Lowercase, collapse whitespace."""
    if not name:
        return ""
    return " ".join(name.strip().lower().split())


def normalize_cnic(cnic: Optional[str]) -> str:
    """Digits only (13-digit CNIC without dashes)."""
    if not cnic:
        return ""
    return re.sub(r"\D", "", cnic.strip())


def format_cnic(raw: str) -> str:
    """Format 13-digit CNIC as xxxxx-xxxxxxx-x."""
    digits = normalize_cnic(raw)
    if len(digits) != 13:
        raise ValueError("CNIC must be exactly 13 digits")
    return f"{digits[:5]}-{digits[5:12]}-{digits[12]}"


def validate_cnic(raw: str, field_label: str = "CNIC") -> str:
    """Return formatted CNIC or raise ValueError."""
    digits = normalize_cnic(raw)
    if not re.fullmatch(r"\d{13}", digits):
        raise ValueError(f"{field_label} must be exactly 13 digits")
    return format_cnic(digits)


def names_match(a: Optional[str], b: Optional[str]) -> bool:
    return normalize_name(a) == normalize_name(b)


def cnic_match(a: Optional[str], b: Optional[str]) -> bool:
    return normalize_cnic(a) == normalize_cnic(b)


def generate_family_code(existing_codes: set[str]) -> str:
    """Generate a unique 6-digit family code."""
    for _ in range(200):
        code = f"{random.randint(0, 999999):06d}"
        if code not in existing_codes:
            return code
    raise RuntimeError("Could not generate a unique family code")
