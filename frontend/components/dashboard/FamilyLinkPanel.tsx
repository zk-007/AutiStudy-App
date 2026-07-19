"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, CheckCircle2, Copy, Loader2, Mail, Users, X } from "lucide-react";
import {
  ApiError,
  familyApi,
  type FamilyLinkStatus,
} from "@/lib/api/client";
import { validateEmail } from "@/lib/validation/email";

export function FamilyLinkPanel({
  isUr = false,
  embedded = false,
}: {
  isUr?: boolean;
  /** Compact layout for Settings modal */
  embedded?: boolean;
}) {
  const [status, setStatus] = useState<FamilyLinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [emailWarn, setEmailWarn] = useState<string | null>(null);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [emailedTo, setEmailedTo] = useState<string | null>(null);
  const [parentEmail, setParentEmail] = useState("");
  const [sendByEmail, setSendByEmail] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await familyApi.status();
      setStatus(s);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not load family status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createInvite = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    setEmailWarn(null);
    setEmailedTo(null);
    try {
      let email: string | undefined;
      if (sendByEmail) {
        const trimmed = parentEmail.trim();
        if (!trimmed) {
          setError(
            isUr
              ? "والدین کی ای میل درج کریں، یا ای میل بھیجنا بند کریں۔"
              : "Enter a parent email, or turn off “Email the code”.",
          );
          setBusy(false);
          return;
        }
        const err = validateEmail(trimmed);
        if (err) {
          setError(err);
          setBusy(false);
          return;
        }
        email = trimmed;
      }

      const res = await familyApi.createInvite(email);
      setFreshCode(res.code);

      if (email) {
        if (res.email_sent) {
          setEmailedTo(res.emailed_to);
          setInfo(
            res.email_detail ||
              (isUr
                ? `دعوت کوڈ ${res.emailed_to} پر بھیج دیا گیا۔ Inbox اور Spam چیک کریں۔`
                : `Invitation emailed to ${res.emailed_to}. Ask them to check Inbox and Spam.`),
          );
        } else {
          setEmailWarn(
            res.email_detail ||
              (isUr
                ? "کوڈ بن گیا، مگر ای میل نہیں بھیجی جا سکی۔ کوڈ خود شیئر کریں۔"
                : "Code created, but the email could not be sent. Share the code manually."),
          );
        }
      } else {
        setInfo(
          isUr
            ? "دعوت کوڈ تیار ہے۔ اسے کاپی کر کے والدین کے ساتھ شیئر کریں۔"
            : "Invitation code ready. Copy it and share with your parent.",
        );
      }

      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not create invite.");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!freshCode) return;
    try {
      await navigator.clipboard.writeText(freshCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const approve = async (inviteId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await familyApi.approve(inviteId);
      setStatus(res.status);
      setFreshCode(null);
      setInfo(isUr ? "والدین کامیابی سے منسلک ہو گئے۔" : "Parent linked successfully.");
      setEmailWarn(null);
      setEmailedTo(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Approve failed.");
    } finally {
      setBusy(false);
    }
  };

  const emailAgain = async (inviteId: string) => {
    setBusy(true);
    setError(null);
    setEmailWarn(null);
    try {
      const res = await familyApi.emailPendingAgain(inviteId);
      setInfo(res.detail);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not send email.");
    } finally {
      setBusy(false);
    }
  };

  const reject = async (inviteId: string) => {
    setBusy(true);
    try {
      const res = await familyApi.reject(inviteId);
      setStatus(res.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Reject failed.");
    } finally {
      setBusy(false);
    }
  };

  const cancelActive = async (inviteId: string) => {
    setBusy(true);
    try {
      const res = await familyApi.cancelInvite(inviteId);
      setStatus(res.status);
      setFreshCode(null);
      setInfo(null);
      setEmailWarn(null);
      setEmailedTo(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Cancel failed.");
    } finally {
      setBusy(false);
    }
  };

  const t = {
    title: isUr ? "والدین کو مدعو کریں" : "Invite Parent",
    sub: isUr
      ? "عارضی Family Invitation Code بنائیں — کاپی کریں یا والدین کی Gmail پر بھیجیں۔"
      : "Create a temporary Family Invitation Code — copy it, or email it to your parent.",
    create: isUr ? "دعوت کوڈ بنائیں" : "Create invitation code",
    emailToggle: isUr ? "کوڈ والدین کی ای میل پر بھیجیں" : "Email the code to my parent",
    emailPlaceholder: isUr ? "والدین کی ای میل (مثلاً name@gmail.com)" : "Parent email (e.g. name@gmail.com)",
    pending: isUr ? "منظوری کی درخواست" : "Approval request",
    pendingHint: isUr
      ? "بنیادی طور پر اپنی ای میل میں Approve لنک سے منظور کریں۔ یہاں بھی Approve کر سکتے ہیں۔"
      : "Prefer Approve from the link in your email. You can also Approve here.",
    emailMe: isUr ? "مجھے ای میل دوبارہ بھیجیں" : "Email me the Approve link again",
    approve: isUr ? "منظور" : "Approve",
    reject: isUr ? "مسترد" : "Reject",
    linked: isUr ? "منسلک والدین" : "Linked parents",
    unlink: isUr ? "لنک ختم کریں" : "Unlink",
    cancel: isUr ? "کوڈ منسوخ" : "Cancel code",
    copy: isUr ? "کاپی" : "Copy",
    expires: isUr ? "میعاد" : "Expires",
    father: isUr ? "والد" : "Father",
    mother: isUr ? "والدہ" : "Mother",
    slotsFull: isUr
      ? "دونوں سلاٹ (والد اور والدہ) بھر چکے ہیں۔ نئی دعوت سے پہلے ایک ان لنک کریں۔"
      : "Both Father and Mother slots are filled. Unlink one before inviting again.",
  };

  const relLabel = (rel?: string) =>
    rel === "mother" ? t.mother : t.father;

  const linkedParents =
    status?.linked_parents?.length
      ? status.linked_parents
      : status?.linked_parent
        ? [status.linked_parent]
        : [];
  const canInviteMore = status?.can_invite_more ?? status?.slots?.can_invite_more ?? linkedParents.length < 2;

  if (loading) {
    return (
      <div className={`rounded-2xl animate-pulse h-32 ${embedded ? "bg-glacier-50" : "glass-strong shadow-soft"}`} />
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={
        embedded
          ? "rounded-2xl border border-glacier-100 bg-white/90 p-4 md:p-5"
          : "mt-8 rounded-3xl glass-strong p-6 md:p-7 shadow-soft"
      }
    >
      {!embedded && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-200 to-cyan-300 text-deep">
            <Users size={18} />
          </div>
          <div>
            <h2 className="font-display text-xl font-extrabold text-deep">{t.title}</h2>
            <p className="text-sm text-deep-soft">{t.sub}</p>
          </div>
        </div>
      )}
      {embedded && (
        <div className="mb-3">
          <h3 className="font-display text-base font-extrabold text-deep">{t.title}</h3>
          <p className="text-xs text-deep-soft mt-0.5">{t.sub}</p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}
      {info && !error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800" role="status">
          <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
          <span>{info}</span>
        </p>
      )}
      {emailWarn && !error && (
        <p className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900" role="status">
          {emailWarn}
        </p>
      )}

      {/* Pending approval */}
      {(status?.pending_requests?.length ?? 0) > 0 && (
        <div className="mt-4 space-y-3">
          {status!.pending_requests.map((req) => (
            <div
              key={req.invite_id}
              className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-4"
            >
              <p className="text-sm font-bold text-amber-900">{t.pending}</p>
              <p className="mt-1 text-sm text-amber-800">
                {isUr
                  ? `${req.parent_name} (${req.parent_email}) آپ کے اکاؤنٹ سے ${relLabel(req.relationship)} کے طور پر جڑنا چاہتے ہیں۔`
                  : `${req.parent_name} (${req.parent_email}) wants to connect as your ${relLabel(req.relationship)}.`}
              </p>
              <p className="mt-1.5 text-xs text-amber-700/90">{t.pendingHint}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => approve(req.invite_id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
                >
                  <Check size={14} /> {t.approve}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => reject(req.invite_id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700"
                >
                  <X size={14} /> {t.reject}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => emailAgain(req.invite_id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-glacier-50 border border-glacier-300 px-4 py-2 text-sm font-bold text-glacier-700"
                >
                  <Mail size={14} /> {t.emailMe}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Linked parents (Father / Mother slots) */}
      {linkedParents.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-bold text-emerald-900">{t.linked}</p>
          {linkedParents.map((lp) => (
            <div
              key={lp.invite_id || lp.email}
              className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                  {relLabel(lp.relationship)}
                </p>
                <p className="text-sm font-bold text-emerald-900 truncate">
                  {lp.name || lp.email}
                </p>
                <p className="text-xs text-emerald-800 truncate">{lp.email}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await familyApi.unlink({
                      invite_id: lp.invite_id,
                      parent_email: lp.email,
                    });
                    setStatus(res.status);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.detail : "Unlink failed.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="text-xs font-bold text-emerald-800 underline flex-shrink-0"
              >
                {t.unlink}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create invite — while an open Father/Mother slot remains */}
      {canInviteMore ? (
        <div className="mt-5 space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendByEmail}
              onChange={(e) => {
                setSendByEmail(e.target.checked);
                setError(null);
              }}
              className="mt-1 h-4 w-4 rounded border-glacier-300 text-glacier-600 focus:ring-glacier-300"
            />
            <span className="text-sm text-deep-soft leading-snug">
              <span className="inline-flex items-center gap-1.5 font-bold text-deep">
                <Mail size={14} className="text-glacier-600" />
                {t.emailToggle}
              </span>
              <span className="block text-xs text-deep-muted mt-0.5">
                {isUr
                  ? "اختیاری — کوڈ والدین کی انباکس میں بھیج دیا جائے گا (Spam بھی چیک کریں)۔"
                  : "Optional — we’ll email the FAM code to their inbox (they should also check Spam)."}
              </span>
            </span>
          </label>

          {sendByEmail && (
            <input
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              autoComplete="email"
              className="w-full rounded-2xl border border-glacier-200 bg-white/80 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-200"
            />
          )}

          <button
            type="button"
            disabled={busy}
            onClick={createInvite}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-glacier-600 to-deep px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : sendByEmail ? <Mail size={14} /> : null}
            {t.create}
          </button>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-glacier-50 border border-glacier-200 px-3 py-2 text-xs text-deep-soft">
          {t.slotsFull}
        </p>
      )}

      {freshCode && (
        <div className="mt-4 rounded-2xl bg-glacier-50 border-2 border-glacier-300 px-5 py-4 text-center">
          <p className="text-xs font-bold text-deep-soft uppercase tracking-wider mb-1">
            Family Invitation Code
          </p>
          <p className="font-mono text-3xl font-extrabold text-deep tracking-widest">{freshCode}</p>
          <p className="mt-2 text-xs text-deep-muted">
            {t.expires}: 48h · single-use
          </p>
          {emailedTo && (
            <p className="mt-2 text-xs font-semibold text-glacier-700">
              {isUr ? `ای میل بھیجی گئی: ${emailedTo}` : `Emailed to ${emailedTo}`}
            </p>
          )}
          <button
            type="button"
            onClick={copyCode}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white border border-glacier-200 px-4 py-1.5 text-xs font-bold text-deep"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {t.copy}
          </button>
        </div>
      )}

      {/* Active invites list */}
      {(status?.active_invites?.length ?? 0) > 0 && (
        <ul className="mt-4 space-y-2">
          {status!.active_invites.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-xs text-deep-soft"
            >
              <span>
                Active · {t.expires}{" "}
                {inv.expires_at ? new Date(inv.expires_at).toLocaleString() : "—"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => cancelActive(inv.id)}
                className="font-bold text-rose-600"
              >
                {t.cancel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
