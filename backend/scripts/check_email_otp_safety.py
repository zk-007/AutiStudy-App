"""
Part 6 — Safety / ops checks for email OTP.

Run from the backend folder:

    cd releases/comprehension-production-stable-v6/backend
    python scripts/check_email_otp_safety.py

Exit codes:
  0 = all critical checks passed
  1 = one or more failures
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT
# Walk up to find git root if present
for p in [ROOT, *ROOT.parents]:
    if (p / ".git").exists():
        REPO = p
        break

os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

from utils.email_otp import (  # noqa: E402
    _load_smtp_config,
    allow_dev_otp_exposure,
    is_dev_email_mode,
    is_production,
    redact_secrets_for_log,
)


def _git_tracked(rel: str) -> bool | None:
    """Return True if git tracks the file, False if not, None if git unavailable."""
    try:
        r = subprocess.run(
            ["git", "-C", str(REPO), "ls-files", "--error-unmatch", rel],
            capture_output=True,
            text=True,
        )
        return r.returncode == 0
    except Exception:
        return None


def _git_ignored(rel: str) -> bool | None:
    try:
        r = subprocess.run(
            ["git", "-C", str(REPO), "check-ignore", "-q", rel],
            capture_output=True,
            text=True,
        )
        return r.returncode == 0
    except Exception:
        return None


def main() -> int:
    print("AutiStudy email OTP safety check")
    print("Backend:", ROOT)
    print("Repo:   ", REPO)
    print()

    fails: list[str] = []
    warns: list[str] = []

    secrets = ROOT / "config" / "secrets.toml"
    example = ROOT / "config" / "secrets.toml.example"
    otp_store = ROOT / "data" / "email_otps.json"

    # 1) Example file present (safe to commit)
    if example.exists():
        print("[ok] secrets.toml.example present")
    else:
        fails.append("Missing config/secrets.toml.example")
        print("[FAIL] secrets.toml.example missing")

    # 2) Real secrets must not be tracked
    rel_secrets = str(secrets.relative_to(REPO)).replace("\\", "/")
    tracked = _git_tracked(rel_secrets)
    ignored = _git_ignored(rel_secrets)
    if tracked is True:
        fails.append(f"{rel_secrets} is tracked by git — untrack it immediately")
        print(f"[FAIL] {rel_secrets} is TRACKED by git")
    elif tracked is False:
        print(f"[ok] {rel_secrets} is not tracked")
    else:
        warns.append("Could not run git ls-files")
        print("[warn] git unavailable — skipped track check")

    if secrets.exists():
        if ignored is True:
            print(f"[ok] {rel_secrets} is gitignored")
        elif ignored is False:
            fails.append(f"{rel_secrets} exists but is NOT gitignored")
            print(f"[FAIL] {rel_secrets} is NOT gitignored")
        else:
            print("[warn] could not verify gitignore for secrets.toml")
    else:
        warns.append("config/secrets.toml not found (DEV mode until SMTP is set)")
        print("[warn] config/secrets.toml not found — local DEV email mode")

    # 3) OTP store should not be tracked
    rel_otp = str(otp_store.relative_to(REPO)).replace("\\", "/")
    if otp_store.exists():
        if _git_tracked(rel_otp) is True:
            fails.append(f"{rel_otp} is tracked — remove from git")
            print(f"[FAIL] {rel_otp} is TRACKED")
        else:
            print(f"[ok] {rel_otp} not tracked")
        if _git_ignored(rel_otp) is True:
            print(f"[ok] {rel_otp} is gitignored")
        elif _git_ignored(rel_otp) is False:
            warns.append(f"{rel_otp} should be gitignored")
            print(f"[warn] {rel_otp} not gitignored")
    else:
        print("[ok] data/email_otps.json not present yet")

    # 4) Runtime mode
    prod = is_production()
    cfg = _load_smtp_config()
    print()
    print(f"is_production():           {prod}")
    print(f"SMTP configured:           {bool(cfg)}")
    print(f"is_dev_email_mode():       {is_dev_email_mode()}")
    print(f"allow_dev_otp_exposure():  {allow_dev_otp_exposure()}")

    if prod and not cfg:
        fails.append("Production mode but SMTP is not configured")
        print("[FAIL] production requires SMTP")
    elif prod and allow_dev_otp_exposure():
        fails.append("Production still allows dev_otp exposure")
        print("[FAIL] production must not expose OTP in API")
    else:
        print("[ok] OTP exposure rules look correct for this environment")

    # 5) Redaction sanity
    sample = "Code 123456 and FAM-82K7Q"
    red = redact_secrets_for_log(sample)
    if "123456" in red or "82K7Q" in red:
        fails.append("redact_secrets_for_log failed")
        print(f"[FAIL] redaction broken: {red}")
    else:
        print(f"[ok] log redaction: {sample!r} -> {red!r}")

    if cfg:
        print()
        print("SMTP (password hidden):")
        print(f"  host={cfg['host']} port={cfg['port']} user={cfg['user']}")

    print()
    if warns:
        print("Warnings:")
        for w in warns:
            print(f"  - {w}")
    if fails:
        print("Failures:")
        for f in fails:
            print(f"  - {f}")
        return 1

    print("All critical Part 6 safety checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
