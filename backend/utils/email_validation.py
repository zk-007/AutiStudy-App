"""Validate email addresses for signup and registration."""
from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Optional

# Practical email format (local@domain.tld) — not full RFC 5322, but catches obvious junk.
_EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9](?:[a-zA-Z0-9._+-]*[a-zA-Z0-9])?"
    r"@"
    r"(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$"
)

_DOMAIN_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")

# Real consumer email domains — used for typo detection, NOT a typo list.
KNOWN_FREE_PROVIDERS = frozenset({
    "gmail.com",
    "googlemail.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "yahoo.com",
    "ymail.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
})

# Wrong TLD when the domain stem clearly matches a known provider (gmail.co → gmail.com).
_TYPO_TLDS = frozenset({"co", "con", "cm", "om", "comm", "coml", "cpm"})

# Min similarity (0–1) to flag a likely typo vs a known provider (same TLD only).
_TYPO_SIMILARITY = 0.82


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def _suggest_provider_typo(domain: str) -> Optional[str]:
    """
    If domain looks like a misspelled gmail/hotmail/etc., return the real domain.
    Uses fuzzy string match — no hardcoded typo dictionary.
    """
    if domain in KNOWN_FREE_PROVIDERS:
        return None

    labels = domain.split(".")
    if len(labels) < 2:
        return None

    stem, tld = labels[0], labels[-1]

    # gmail.co, hotmail.con, etc.
    if tld in _TYPO_TLDS:
        for known in KNOWN_FREE_PROVIDERS:
            known_stem = known.split(".")[0]
            if _similarity(stem, known_stem) >= _TYPO_SIMILARITY:
                return known

    # gmaill.com, gma.com, gmailw.com — same TLD as provider, fuzzy full-domain match
    best_match: Optional[str] = None
    best_ratio = 0.0
    for known in KNOWN_FREE_PROVIDERS:
        known_tld = known.rsplit(".", 1)[-1]
        if tld != known_tld:
            continue
        ratio = _similarity(domain, known)
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = known

    if best_match and best_ratio >= _TYPO_SIMILARITY and domain != best_match:
        return best_match

    return None


def validate_email(email: str) -> Optional[str]:
    """
    Return an error message if the email is invalid, else None.
    Accepts real domains (gmail.com, school.edu.pk, company.org, etc.).
    Flags likely typos of common free providers via fuzzy matching.
    """
    raw = (email or "").strip()
    if not raw:
        return "Please enter an email address."

    if len(raw) > 254:
        return "Email address is too long."

    if " " in raw or ".." in raw:
        return "Please enter a valid email address."

    if raw.count("@") != 1:
        return "Please enter a valid email address (e.g. name@gmail.com)."

    local, domain = raw.rsplit("@", 1)
    domain = domain.lower()
    local = local.strip()

    if not _EMAIL_RE.fullmatch(f"{local}@{domain}"):
        return "Please enter a valid email address (e.g. name@gmail.com)."

    labels = domain.split(".")
    for label in labels:
        if not label or len(label) > 63:
            return "Please enter a valid email domain."
        if not _DOMAIN_LABEL_RE.fullmatch(label):
            return "Please enter a valid email domain."

    suggested = _suggest_provider_typo(domain)
    if suggested:
        return f"That email domain looks misspelled. Did you mean {local}@{suggested}?"

    return None
