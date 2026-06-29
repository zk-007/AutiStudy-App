"""Normalize names/CNICs and generate family codes for parent–child linking."""
from __future__ import annotations

import random
import re
from typing import Any, Dict, Optional


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


def student_id_from_cnic(cnic: Optional[str]) -> str:
    """Primary student identifier — normalized 13-digit CNIC."""
    return normalize_cnic(cnic)


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


def find_student_by_identity(
    users: Dict[str, Any],
    student_name: str,
    student_cnic: str,
) -> Optional[dict]:
    """Lookup student by name + CNIC (primary identity for parent linking)."""
    for u in users.values():
        if names_match(u.get("name"), student_name) and cnic_match(u.get("cnic"), student_cnic):
            return u
    return None


def student_signup_conflict(
    users: Dict[str, Any],
    *,
    student_name: str,
    student_cnic: str,
    parent_name: str,
    parent_cnic: str,
    exclude_email: Optional[str] = None,
) -> Optional[str]:
    """
    Return an error message if signup breaks uniqueness rules, else None.

    Rules:
    1. Student CNIC is the unique student ID — no two accounts may share it.
    2. Same student name + same parent name + same parent CNIC cannot register twice
       (even with a different student CNIC).
    3. Siblings allowed: different student name, same parent — OK.
    4. Same student name allowed with different parent CNIC — OK.
    """
    child_id = student_id_from_cnic(student_cnic)
    if len(child_id) != 13:
        return "Student CNIC must be exactly 13 digits."

    name_key = normalize_name(student_name)
    parent_name_key = normalize_name(parent_name)
    parent_id = normalize_cnic(parent_cnic)

    for email, u in users.items():
        if exclude_email and email == exclude_email:
            continue

        existing_child_id = student_id_from_cnic(u.get("cnic"))
        if existing_child_id and existing_child_id == child_id:
            return "This CNIC is already registered."

        if not existing_child_id:
            continue

        if (
            normalize_name(u.get("name")) == name_key
            and normalize_name(u.get("parent_name")) == parent_name_key
            and normalize_cnic(u.get("parent_cnic")) == parent_id
        ):
            return (
                "A student with this name is already registered under this parent. "
                "Please log in to that account, or use the correct name if this is a different child."
            )

    return None


def generate_family_code(existing_codes: set[str]) -> str:
    """Generate a unique 6-digit family code."""
    for _ in range(200):
        code = f"{random.randint(0, 999999):06d}"
        if code not in existing_codes:
            return code
    raise RuntimeError("Could not generate a unique family code")
