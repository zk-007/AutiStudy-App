# Email OTP — Safety / Ops Checklist (Part 6)

Use this before demos or any production-like deploy.

## Secrets (never commit)

- [ ] Real keys live only in `backend/config/secrets.toml` (gitignored)
- [ ] Commit only `config/secrets.toml.example` (placeholders)
- [ ] Gmail uses an **App Password** (16 chars), not the normal password
- [ ] `SMTP user` / `from` match the Gmail account that owns the App Password
- [ ] Verify ignore:

```bash
cd releases/comprehension-production-stable-v6/backend
python scripts/check_email_otp_safety.py
```

```bash
# from repo root — should print an ignore rule, not "not ignored"
git check-ignore -v releases/comprehension-production-stable-v6/backend/config/secrets.toml
```

## OTP plaintext rules

| Environment | SMTP | API `dev_otp` | Console body |
|-------------|------|---------------|--------------|
| Local       | off  | yes           | yes (DEV)    |
| Local       | on   | no*           | no           |
| Production (`AUTISTUDY_ENV=production` or `AUTH_PRODUCTION=1`) | required | never | never |

\* Local override: `AUTH_DEV_OTP=1` can still return `dev_otp` when SMTP is on — **do not set this in production**.

OTP codes are stored hashed in `data/email_otps.json` (gitignored).

## Production env

```bash
set AUTISTUDY_ENV=production
# or
set AUTH_PRODUCTION=1
```

Restart API after changing env or `secrets.toml`.

## Manual test checklist

### Student signup OTP
- [ ] Signup → code arrives in Gmail (check Spam)
- [ ] Wrong code rejected; after several fails, locked
- [ ] Resend works after cooldown; Inbox gets a new code
- [ ] Verify → login / dashboard works

### Parent signup OTP
- [ ] Parent signup asks Father/Mother
- [ ] OTP email arrives; verify succeeds
- [ ] Cannot signup parent with an existing student email (and vice versa)

### Family invite email
- [ ] Child Settings → Family → create code (optional email to parent)
- [ ] Parent receives FAM code (or child shares manually)
- [ ] Parent redeems → child gets Approve email
- [ ] Approve → parent sees child dashboard
- [ ] Cannot email invite to the child’s own address

### Email change
- [ ] Student/parent change email → OTP on **new** inbox
- [ ] Parent email change clears child link (must re-invite)

### Safety smoke
- [ ] `python scripts/check_email_otp_safety.py` exits 0
- [ ] With SMTP on, signup API response has **no** `dev_otp`
- [ ] Server logs show `[email_otp] Sent to …` without the 6-digit code

## Quick SMTP test

```bash
cd releases/comprehension-production-stable-v6/backend
python scripts/test_smtp_config.py
python scripts/test_smtp_config.py --to your.gmail@gmail.com
```
