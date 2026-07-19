"""
Email OTP helpers for signup verification (V6 auth redesign).

- 6-digit codes, hashed at rest (never store plaintext).
- SMTP send when configured; otherwise DEV mode may log the code and
  return it to the client for local testing.
- Production (AUTISTUDY_ENV=production): never log or return OTP plaintext.
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import random
import re
import secrets
import smtplib
import threading
from datetime import datetime, timedelta
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

OTP_FILE = Path("data/email_otps.json")
_lock = threading.Lock()

OTP_TTL_MINUTES = 15
PASSWORD_RESET_OTP_TTL_MINUTES = 10
PASSWORD_RESET_GRANT_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SEC = 60
OTP_MAX_ATTEMPTS = 5
OTP_MAX_SENDS_PER_HOUR = 8

# Matches standalone 6-digit codes (OTP) for log redaction.
_OTP_PLAIN_RE = re.compile(r"\b\d{6}\b")
# Family invite codes like FAM-82K7Q
_FAM_CODE_RE = re.compile(r"\bFAM-[A-Z0-9]{5}\b", re.IGNORECASE)


def _now() -> datetime:
    return datetime.now()


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def is_production() -> bool:
    """True when running as a production deployment (no OTP in logs/API)."""
    if os.environ.get("AUTH_PRODUCTION", "").strip().lower() in ("1", "true", "yes"):
        return True
    env = (
        os.environ.get("AUTISTUDY_ENV")
        or os.environ.get("ENVIRONMENT")
        or os.environ.get("NODE_ENV")
        or ""
    ).strip().lower()
    return env in ("production", "prod")


def redact_secrets_for_log(text: str) -> str:
    """Strip OTP / FAM codes from strings before printing to console/logs."""
    if not text:
        return text
    out = _OTP_PLAIN_RE.sub("******", text)
    out = _FAM_CODE_RE.sub("FAM-*****", out)
    return out


def _load() -> Dict[str, Any]:
    if not OTP_FILE.exists():
        return {}
    try:
        data = json.loads(OTP_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save(data: Dict[str, Any]) -> None:
    OTP_FILE.parent.mkdir(parents=True, exist_ok=True)
    OTP_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _key(role: str, email: str) -> str:
    return f"{role}:{email.strip().lower()}"


def _is_placeholder(value: str) -> bool:
    v = (value or "").strip().lower()
    if not v:
        return True
    markers = (
        "paste_",
        "your_",
        "your@",
        "xxx",
        "changeme",
        "app-password-here",
        "your-app-password",
        "example.com",
    )
    return any(m in v for m in markers)


def _load_smtp_config() -> Optional[Dict[str, Any]]:
    """Read SMTP from env or config/secrets.toml [smtp]. Returns None if incomplete."""
    host = os.environ.get("SMTP_HOST", "").strip()
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "").strip()
    port = int(os.environ.get("SMTP_PORT", "587") or 587)
    from_addr = os.environ.get("SMTP_FROM", user).strip()

    if not host or not user or not password:
        secrets_path = Path("config/secrets.toml")
        if secrets_path.exists():
            try:
                text = secrets_path.read_text(encoding="utf-8")
                cfg: Dict[str, str] = {}
                in_smtp = False
                for line in text.splitlines():
                    s = line.strip()
                    if not s or s.startswith("#"):
                        continue
                    if s.startswith("[") and s.endswith("]"):
                        in_smtp = s.lower() == "[smtp]"
                        continue
                    if in_smtp and "=" in s:
                        k, v = s.split("=", 1)
                        cfg[k.strip().lower()] = v.strip().strip('"').strip("'")
                host = host or cfg.get("host", "")
                user = user or cfg.get("user", "")
                password = password or cfg.get("password", "")
                from_addr = from_addr or cfg.get("from", "") or user
                if cfg.get("port"):
                    port = int(cfg.get("port") or 587)
            except Exception:
                pass

    from_addr = from_addr or user
    if (
        _is_placeholder(host)
        or _is_placeholder(user)
        or _is_placeholder(password)
        or _is_placeholder(from_addr)
    ):
        return None

    # Gmail App Passwords are often copied with spaces.
    password = password.replace(" ", "")

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from": from_addr,
    }


def is_dev_email_mode() -> bool:
    """
    Local/dev fallback when SMTP is not configured.
    Never true in production — even if AUTH_DEV_OTP is set.
    """
    if is_production():
        return False
    return _load_smtp_config() is None


def allow_dev_otp_exposure() -> bool:
    """
    Whether the API may return plaintext OTP (dev_otp) to the client.
    - Production: never
    - SMTP missing (local): yes
    - SMTP configured: only if AUTH_DEV_OTP=1 (local debug override)
    """
    if is_production():
        return False
    if _load_smtp_config() is None:
        return True
    return os.environ.get("AUTH_DEV_OTP", "").strip().lower() in ("1", "true", "yes")


def _friendly_smtp_error(err: Exception) -> str:
    msg = str(err).lower()
    if "authentication" in msg or "username and password" in msg or "535" in msg:
        return (
            "Email login failed. Check the Gmail App Password in config/secrets.toml "
            "(use an App Password, not your normal Gmail password)."
        )
    if "connection" in msg or "timed out" in msg or "getaddrinfo" in msg:
        return "Could not reach the email server. Check your internet connection and try again."
    if "recipient" in msg or "550" in msg:
        return "That email address could not receive mail. Please check it and try again."
    return "Could not send the verification email. Please try again in a moment."


def send_email(
    to: str,
    subject: str,
    body: str,
    *,
    html_body: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Send email via SMTP. Returns (ok, detail).
    Local DEV (no SMTP): prints to console and returns (True, "dev").
    Production without SMTP: fails closed — never prints OTP bodies.
    """
    cfg = _load_smtp_config()
    if not cfg:
        if is_production():
            print(
                f"[email_otp] SMTP not configured in production — "
                f"refusing to send or log mail body for {to}"
            )
            return False, (
                "Email delivery is not configured on this server. "
                "Please contact support."
            )
        # Local only — plaintext OK for developers without SMTP.
        print(f"\n[DEV EMAIL → {to}]\nSubject: {subject}\n{body}\n")
        return True, "dev"

    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = f"AutiStudy <{cfg['from']}>"
        msg["To"] = to
        msg["Reply-To"] = cfg["from"]
        msg.set_content(body)
        if html_body:
            msg.add_alternative(html_body, subtype="html")

        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as smtp:
            smtp.starttls()
            if cfg.get("user") and cfg.get("password"):
                # Gmail App Passwords are often copied with spaces — strip them.
                smtp.login(cfg["user"], cfg["password"].replace(" ", ""))
            smtp.send_message(msg)
        print(f"[email_otp] Sent to {to} ({redact_secrets_for_log(subject)})")
        return True, "sent"
    except Exception as err:
        # Never log the OTP / full body when SMTP is configured.
        safe_err = redact_secrets_for_log(f"{type(err).__name__}: {err}")
        print(f"[email_otp] SMTP failed to {to}: {safe_err}")
        return False, _friendly_smtp_error(err)


def _otp_email_content(*, role: str, code: str, purpose: str = "signup") -> Tuple[str, str, str]:
    """Return (subject, plain_text, html)."""
    who = "student" if role == "child" else "parent"
    ttl = PASSWORD_RESET_OTP_TTL_MINUTES if purpose == "password_reset" else OTP_TTL_MINUTES
    if purpose == "email_change":
        subject = "Confirm your new AutiStudy email"
        reason = f"confirm your new {who} email address"
        ignore = "If you did not request an email change, you can ignore this email."
    elif purpose == "password_reset":
        subject = "Reset your AutiStudy password"
        reason = f"reset your {who} password"
        ignore = "If you did not request a password reset, you can ignore this email."
    else:
        subject = "Your AutiStudy verification code"
        reason = f"verify your {who} account"
        ignore = "If you did not create an AutiStudy account, you can ignore this email."
    plain = (
        "AutiStudy\n"
        "────────────\n\n"
        f"Hi! Use this code to {reason}:\n\n"
        f"    {code}\n\n"
        f"This code expires in {ttl} minutes.\n\n"
        f"{ignore}\n\n"
        "— The AutiStudy team\n"
    )
    safe_code = html.escape(code)
    html_body = f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f7fc;font-family:Segoe UI,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f7fc;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #dbe7f3;">
        <tr><td>
          <div style="font-size:22px;font-weight:800;color:#0f2744;margin-bottom:8px;">AutiStudy</div>
          <div style="font-size:15px;color:#3d5a73;line-height:1.5;margin-bottom:20px;">
            Use this code to {html.escape(reason)}:
          </div>
          <div style="text-align:center;letter-spacing:0.35em;font-size:32px;font-weight:800;color:#0f2744;
                      background:#eef6ff;border-radius:12px;padding:16px 12px;margin:0 0 20px;">
            {safe_code}
          </div>
          <div style="font-size:13px;color:#64748b;line-height:1.5;">
            This code expires in <strong>{ttl} minutes</strong>.<br/>
            {html.escape(ignore)}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""
    return subject, plain, html_body


def create_and_send_otp(
    *,
    role: str,
    email: str,
    purpose: str = "signup",
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Generate a 6-digit OTP, store hash, send email.
    Returns { ok, detail, expires_in_sec, retry_after_sec, dev_otp? }
    """
    email = email.strip().lower()
    role = role.strip().lower()
    purpose = (purpose or "signup").strip().lower()
    key = _key(role, email)
    now = _now()

    with _lock:
        data = _load()
        previous = data.get(key)
        entry = previous or {}

        last_sent = entry.get("last_sent")
        if last_sent:
            try:
                elapsed = (now - datetime.fromisoformat(last_sent)).total_seconds()
                if elapsed < OTP_RESEND_COOLDOWN_SEC:
                    wait = max(1, int(OTP_RESEND_COOLDOWN_SEC - elapsed))
                    return {
                        "ok": False,
                        "detail": f"Please wait {wait}s before requesting another code.",
                        "retry_after_sec": wait,
                    }
            except Exception:
                pass

        sends = list(entry.get("send_history") or [])
        cutoff_dt = now - timedelta(hours=1)
        cutoff = cutoff_dt.isoformat()
        sends = [s for s in sends if s >= cutoff]
        if len(sends) >= OTP_MAX_SENDS_PER_HOUR:
            wait = 3600
            try:
                oldest = min(datetime.fromisoformat(s) for s in sends)
                wait = max(1, int((oldest + timedelta(hours=1) - now).total_seconds()))
            except Exception:
                pass
            return {
                "ok": False,
                "detail": (
                    f"Too many verification emails. Try again in "
                    f"{max(1, wait // 60)} minute(s)."
                ),
                "retry_after_sec": wait,
            }

        code = f"{random.randint(0, 999999):06d}"
        ttl_min = (
            PASSWORD_RESET_OTP_TTL_MINUTES
            if purpose == "password_reset"
            else OTP_TTL_MINUTES
        )
        expires = now + timedelta(minutes=ttl_min)
        sent_at = now.isoformat()
        sends.append(sent_at)
        data[key] = {
            "code_hash": _hash(code),
            "expires_at": expires.isoformat(),
            "attempts": 0,
            "last_sent": sent_at,
            "send_history": sends[-20:],
            "purpose": purpose,
            "role": role,
            "email": email,
            "meta": meta or {},
        }
        _save(data)

    subject, plain, html_body = _otp_email_content(role=role, code=code, purpose=purpose)
    ok, detail = send_email(email, subject, plain, html_body=html_body)
    if not ok:
        # Don't burn cooldown / hourly quota when SMTP fails.
        with _lock:
            data = _load()
            if previous:
                data[key] = previous
            else:
                data.pop(key, None)
            _save(data)
        return {
            "ok": False,
            "detail": detail,
            "dev_mode": False,
        }

    ttl_min = (
        PASSWORD_RESET_OTP_TTL_MINUTES
        if purpose == "password_reset"
        else OTP_TTL_MINUTES
    )
    out: Dict[str, Any] = {
        "ok": True,
        "detail": "Verification code sent to your email. Check your inbox (and Spam).",
        "expires_in_sec": ttl_min * 60,
        "retry_after_sec": OTP_RESEND_COOLDOWN_SEC,
        "dev_mode": allow_dev_otp_exposure(),
    }
    # Never expose plaintext OTP in production / when real SMTP is in use
    # (unless AUTH_DEV_OTP=1 locally for debugging).
    if allow_dev_otp_exposure():
        out["dev_otp"] = code
    return out


SUPPORT_INBOX = "supportAutistudy@gmail.com"


def send_contact_form_email(
    *,
    name: str,
    from_email: str,
    role: str,
    subject: str,
    message: str,
) -> Tuple[bool, str]:
    """
    Forward a Contact-page message to the AutiStudy support inbox.
    Reply-To is set to the visitor's email so the team can reply directly.
    """
    to = os.environ.get("CONTACT_INBOX", SUPPORT_INBOX).strip() or SUPPORT_INBOX
    safe_name = (name or "Visitor").strip() or "Visitor"
    safe_role = (role or "other").strip() or "other"
    safe_subject = (subject or "Contact").strip() or "Contact"
    mail_subject = f"[AutiStudy Contact] {safe_subject}"
    plain = (
        "AutiStudy — new contact message\n"
        "──────────────────────────────\n\n"
        f"From: {safe_name} <{from_email}>\n"
        f"Role: {safe_role}\n"
        f"Subject: {safe_subject}\n\n"
        f"{message.strip()}\n\n"
        "──────────────────────────────\n"
        "Reply to this email to answer the sender "
        f"(Reply-To: {from_email}).\n"
    )
    html_body = f"""\
<html><body style="margin:0;padding:0;background:#f0f7fc;font-family:Segoe UI,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;padding:28px 24px;border:1px solid #dbeafe;">
        <tr><td>
          <p style="margin:0 0 6px;font-size:13px;color:#0284c7;font-weight:700;letter-spacing:.04em;">AUTISTUDY CONTACT</p>
          <h1 style="margin:0 0 16px;font-size:20px;color:#0f2744;">{html.escape(safe_subject)}</h1>
          <p style="margin:0 0 8px;font-size:14px;color:#334155;">
            <strong>From:</strong> {html.escape(safe_name)} &lt;{html.escape(from_email)}&gt;<br/>
            <strong>Role:</strong> {html.escape(safe_role)}
          </p>
          <div style="margin:16px 0;padding:14px 16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;line-height:1.55;white-space:pre-wrap;">
{html.escape(message.strip())}
          </div>
          <p style="margin:0;font-size:12px;color:#64748b;">
            Reply to this email to answer the sender.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""
    return _send_email_with_reply_to(
        to=to,
        subject=mail_subject,
        body=plain,
        html_body=html_body,
        reply_to=from_email,
    )


def _send_email_with_reply_to(
    *,
    to: str,
    subject: str,
    body: str,
    html_body: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> Tuple[bool, str]:
    """Like send_email, but allows a custom Reply-To (contact form)."""
    cfg = _load_smtp_config()
    if not cfg:
        if is_production():
            print(
                f"[email_otp] SMTP not configured — cannot deliver contact mail to {to}"
            )
            return False, "Email delivery is not configured on this server."
        print(f"\n[DEV CONTACT EMAIL → {to}]\nSubject: {subject}\n{body}\n")
        return True, "dev"

    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = f"AutiStudy <{cfg['from']}>"
        msg["To"] = to
        msg["Reply-To"] = (reply_to or cfg["from"]).strip()
        msg.set_content(body)
        if html_body:
            msg.add_alternative(html_body, subtype="html")

        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as smtp:
            smtp.starttls()
            if cfg.get("user") and cfg.get("password"):
                smtp.login(cfg["user"], cfg["password"].replace(" ", ""))
            smtp.send_message(msg)
        print(f"[email_otp] Contact forwarded to {to}")
        return True, "sent"
    except Exception as err:
        safe_err = redact_secrets_for_log(f"{type(err).__name__}: {err}")
        print(f"[email_otp] Contact email failed: {safe_err}")
        return False, _friendly_smtp_error(err)


def send_family_invite_email(
    *,
    to: str,
    child_name: str,
    code: str,
    expires_in_hours: int,
) -> Tuple[bool, str]:
    """Optional parent invite email — same SMTP stack as OTP."""
    child = (child_name or "Your child").strip() or "Your child"
    subject = f"{child} invited you to AutiStudy"
    plain = (
        "AutiStudy\n"
        "────────────\n\n"
        f"{child} invited you to link as a parent on AutiStudy.\n\n"
        f"Your Family Invitation Code:\n\n"
        f"    {code}\n\n"
        f"This code expires in {expires_in_hours} hours and can be used once.\n\n"
        "How to connect:\n"
        "1) Open AutiStudy and sign up or log in as a Parent\n"
        "2) Enter this Family Invitation Code\n"
        "3) Wait for your child to Approve the link\n\n"
        "If you did not expect this email, you can ignore it.\n\n"
        "— The AutiStudy team\n"
    )
    safe_child = html.escape(child)
    safe_code = html.escape(code)
    html_body = f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f7fc;font-family:Segoe UI,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f7fc;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #dbe7f3;">
        <tr><td>
          <div style="font-size:22px;font-weight:800;color:#0f2744;margin-bottom:8px;">AutiStudy</div>
          <div style="font-size:15px;color:#3d5a73;line-height:1.5;margin-bottom:8px;">
            <strong>{safe_child}</strong> invited you to link as a parent.
          </div>
          <div style="font-size:13px;color:#64748b;margin-bottom:18px;">
            Use this Family Invitation Code on AutiStudy:
          </div>
          <div style="text-align:center;letter-spacing:0.18em;font-size:28px;font-weight:800;color:#0f2744;
                      background:#eef6ff;border-radius:12px;padding:16px 12px;margin:0 0 20px;font-family:Consolas,monospace;">
            {safe_code}
          </div>
          <div style="font-size:13px;color:#64748b;line-height:1.6;">
            Expires in <strong>{expires_in_hours} hours</strong> · single-use<br/><br/>
            1. Sign up or log in as a <strong>Parent</strong><br/>
            2. Enter this code when asked<br/>
            3. Wait for your child to <strong>Approve</strong><br/><br/>
            If you did not expect this email, you can ignore it.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""
    return send_email(to, subject, plain, html_body=html_body)


def send_parent_link_request_email(
    *,
    to: str,
    child_name: str,
    parent_name: str,
    parent_email: str,
    approve_url: str,
    reject_url: str,
) -> Tuple[bool, str]:
    """Notify the student that a parent asked to link — Approve/Reject via email links."""
    child = (child_name or "there").strip() or "there"
    pname = (parent_name or "A parent").strip() or "A parent"
    pemail = (parent_email or "").strip().lower()
    subject = f"{pname} wants to link as your parent on AutiStudy"
    plain = (
        "AutiStudy\n"
        "────────────\n\n"
        f"Hi {child},\n\n"
        f"{pname} ({pemail}) entered your Family Invitation Code and wants to link "
        "as your parent on AutiStudy.\n\n"
        f"Approve: {approve_url}\n"
        f"Reject:  {reject_url}\n\n"
        "You can also Approve or Reject anytime in AutiStudy → Settings → Family.\n\n"
        "If you did not expect this, tap Reject.\n\n"
        "— The AutiStudy team\n"
    )
    safe_child = html.escape(child)
    safe_parent = html.escape(pname)
    safe_pemail = html.escape(pemail)
    safe_approve = html.escape(approve_url)
    safe_reject = html.escape(reject_url)
    html_body = f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f7fc;font-family:Segoe UI,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f7fc;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #dbe7f3;">
        <tr><td>
          <div style="font-size:22px;font-weight:800;color:#0f2744;margin-bottom:8px;">AutiStudy</div>
          <div style="font-size:15px;color:#3d5a73;line-height:1.55;margin-bottom:18px;">
            Hi <strong>{safe_child}</strong>,<br/><br/>
            <strong>{safe_parent}</strong> ({safe_pemail}) wants to link as your parent.
          </div>
          <div style="text-align:center;margin:0 0 12px;">
            <a href="{safe_approve}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;
               font-weight:800;font-size:15px;padding:14px 28px;border-radius:999px;">
              Approve parent
            </a>
          </div>
          <div style="text-align:center;margin:0 0 20px;">
            <a href="{safe_reject}" style="display:inline-block;color:#be123c;text-decoration:none;
               font-weight:700;font-size:14px;padding:10px 20px;">
              Reject request
            </a>
          </div>
          <div style="font-size:13px;color:#64748b;line-height:1.55;">
            You can also open AutiStudy → <strong>Settings → Family</strong> to Approve or Reject.<br/>
            If you did not expect this email, tap Reject.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""
    return send_email(to, subject, plain, html_body=html_body)


def verify_otp(
    *,
    role: str,
    email: str,
    code: str,
    expected_purpose: Optional[str] = None,
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Verify OTP. Returns (ok, detail, meta).
    meta is only present on success (may be empty dict).
    """
    email = email.strip().lower()
    code = (code or "").strip()
    if not re_fullmatch_digits(code):
        return False, "Enter the 6-digit code from your email.", None

    key = _key(role, email)
    with _lock:
        data = _load()
        entry = data.get(key)
        if not entry:
            return False, "No code found for this email. Tap Resend code to get a new one.", None

        if expected_purpose:
            purpose = (entry.get("purpose") or "signup").strip().lower()
            if purpose != expected_purpose.strip().lower():
                return False, "Invalid verification code for this action.", None

        try:
            exp = datetime.fromisoformat(entry["expires_at"])
        except Exception:
            return False, "This code has expired. Tap Resend code for a new one.", None

        if _now() > exp:
            return False, "This code has expired. Tap Resend code for a new one.", None

        attempts = int(entry.get("attempts") or 0)
        if attempts >= OTP_MAX_ATTEMPTS:
            return False, "Too many incorrect tries. Tap Resend code for a new one.", None

        if _hash(code) != entry.get("code_hash"):
            entry["attempts"] = attempts + 1
            data[key] = entry
            _save(data)
            left = OTP_MAX_ATTEMPTS - entry["attempts"]
            if left <= 0:
                return False, "Too many incorrect tries. Tap Resend code for a new one.", None
            return False, f"That code is incorrect. {left} attempt(s) left.", None

        meta = entry.get("meta") if isinstance(entry.get("meta"), dict) else {}
        # success — consume
        data.pop(key, None)
        _save(data)
        return True, "verified", meta


def re_fullmatch_digits(code: str) -> bool:
    return len(code) == 6 and code.isdigit()


def _reset_grant_key(role: str, email: str) -> str:
    return f"pwdreset:{role.strip().lower()}:{email.strip().lower()}"


def issue_password_reset_grant(*, role: str, email: str) -> str:
    """
    After a successful password-reset OTP verify, issue a one-time grant token
    so the client can set a new password without re-sending the OTP.
    Returns the plaintext token (show once to the client).
    """
    email = email.strip().lower()
    role = role.strip().lower()
    token = secrets.token_urlsafe(32)
    key = _reset_grant_key(role, email)
    expires = _now() + timedelta(minutes=PASSWORD_RESET_GRANT_TTL_MINUTES)
    with _lock:
        data = _load()
        data[key] = {
            "token_hash": _hash(token),
            "expires_at": expires.isoformat(),
            "purpose": "password_reset_grant",
            "role": role,
            "email": email,
        }
        _save(data)
    return token


def consume_password_reset_grant(*, role: str, email: str, token: str) -> Tuple[bool, str]:
    """Validate and consume a password-reset grant. One-time use."""
    email = email.strip().lower()
    role = role.strip().lower()
    token = (token or "").strip()
    if not token:
        return False, "Reset session expired. Please request a new code."

    key = _reset_grant_key(role, email)
    with _lock:
        data = _load()
        entry = data.get(key)
        if not entry or (entry.get("purpose") or "") != "password_reset_grant":
            return False, "Reset session expired. Please request a new code."
        try:
            exp = datetime.fromisoformat(entry["expires_at"])
        except Exception:
            data.pop(key, None)
            _save(data)
            return False, "Reset session expired. Please request a new code."
        if _now() > exp:
            data.pop(key, None)
            _save(data)
            return False, "Reset session expired. Please request a new code."
        if _hash(token) != entry.get("token_hash"):
            return False, "Reset session invalid. Please request a new code."
        data.pop(key, None)
        _save(data)
    return True, "ok"
