"""
Part 1 — verify Gmail SMTP config is loaded (and optionally send a test email).

Run from the backend folder:

    cd releases/comprehension-production-stable-v6/backend
    python scripts/test_smtp_config.py

Optional real send:

    python scripts/test_smtp_config.py --to you@gmail.com
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

from utils.email_otp import (  # noqa: E402
    _load_smtp_config,
    allow_dev_otp_exposure,
    is_dev_email_mode,
    is_production,
    send_email,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Test AutiStudy Gmail SMTP config")
    parser.add_argument(
        "--to",
        default="",
        help="If set, send a real test email to this address",
    )
    args = parser.parse_args()

    cfg = _load_smtp_config()
    print("Working directory:", ROOT)
    print("secrets.toml:", (ROOT / "config" / "secrets.toml").exists())
    print("production:", is_production())
    print("DEV email mode:", is_dev_email_mode())
    print("API may return dev_otp:", allow_dev_otp_exposure())

    if not cfg:
        print()
        print("SMTP NOT configured yet.")
        print("Edit config/secrets.toml and fill the [smtp] section:")
        print('  host = "smtp.gmail.com"')
        print('  port = 587')
        print('  user = "your.gmail@gmail.com"')
        print('  password = "your 16-char app password"')
        print('  from = "your.gmail@gmail.com"')
        print()
        print("Use a Gmail App Password (not your normal password).")
        return 1

    print()
    print("SMTP configured:")
    print(f"  host = {cfg['host']}")
    print(f"  port = {cfg['port']}")
    print(f"  user = {cfg['user']}")
    print(f"  from = {cfg['from']}")
    print(f"  password = {'*' * 8} (hidden, length={len(cfg['password'])})")

    if not args.to:
        print()
        print("Config looks ready. To send a test email:")
        print(f'  python scripts/test_smtp_config.py --to {cfg["user"]}')
        return 0

    ok, detail = send_email(
        args.to.strip(),
        "AutiStudy SMTP test",
        "If you received this, Gmail SMTP for AutiStudy OTP is working.\n",
    )
    print()
    if ok:
        print(f"Test email sent to {args.to} ({detail}). Check inbox + Spam.")
        return 0
    print(f"Send failed: {detail}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
