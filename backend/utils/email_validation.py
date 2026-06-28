"""Validate email addresses for signup and registration."""
from __future__ import annotations

import re
from typing import Optional

# Common misspellings → suggested correction (shown in error message)
_DOMAIN_TYPOS: dict[str, str] = {
    "gmai.com": "gmail.com",
    "gmial.com": "gmail.com",
    "gmal.com": "gmail.com",
    "gmail.co": "gmail.com",
    "gmail.con": "gmail.com",
    "gmail.cm": "gmail.com",
    "gmail.om": "gmail.com",
    "gamil.com": "gmail.com",
    "gnail.com": "gmail.com",
    "gmsil.com": "gmail.com",
    "gmil.com": "gmail.com",
    "hotmial.com": "hotmail.com",
    "hotmal.com": "hotmail.com",
    "hotmail.con": "hotmail.com",
    "yaho.com": "yahoo.com",
    "yahooo.com": "yahoo.com",
    "outlok.com": "outlook.com",
    "outllok.com": "outlook.com",
    "iclod.com": "icloud.com",
    "icoud.com": "icloud.com",
}

_DOMAIN_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")


def validate_email(email: str) -> Optional[str]:
    """
    Return an error message if the email is invalid, else None.
    Accepts real domains (gmail.com, school.edu.pk, company.org, etc.).
    Rejects malformed addresses and common provider typos.
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

    if not local or not domain:
        return "Please enter a valid email address."

    if len(local) > 64:
        return "The part before @ is too long."

    if local.startswith(".") or local.endswith("."):
        return "Please enter a valid email address."

    if "." not in domain:
        return "Email must use a proper domain (e.g. gmail.com or school.edu.pk)."

    labels = domain.split(".")
    tld = labels[-1]
    if not re.fullmatch(r"[a-z]{2,63}", tld):
        return "Please use a valid domain extension (e.g. .com, .org, .edu, .pk)."

    for label in labels:
        if not label or len(label) > 63:
            return "Please enter a valid email domain."
        if not _DOMAIN_LABEL_RE.fullmatch(label):
            return "Please enter a valid email domain."

    if domain in _DOMAIN_TYPOS:
        suggested = _DOMAIN_TYPOS[domain]
        return f"That email domain looks misspelled. Did you mean {local}@{suggested}?"

    # Catch gmail-like typos not in the map
    if domain.endswith(".com") and "gmail" not in domain:
        stem = domain[:-4]
        if stem in ("gmai", "gmial", "gmal", "gamil", "gnail", "gmsil", "gmil"):
            return f"That email domain looks misspelled. Did you mean {local}@gmail.com?"

    if not re.fullmatch(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", f"{local}@{domain}"):
        return "Please enter a valid email address (e.g. name@gmail.com)."

    return None
