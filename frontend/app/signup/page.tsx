"use client";

import { FormEvent, Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, GraduationCap, Lock, Mail,
  User, Eye, EyeOff, CheckCircle2,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { DancingButton } from "@/components/primitives/DancingButton";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { resolveReturnUrl, clearReturnUrl } from "@/lib/auth/redirect";
import {
  ApiError,
  authVerifyApi,
  parentApi,
  saveSession,
  setParentToken,
} from "@/lib/api/client";
import { validateEmail } from "@/lib/validation/email";

export default function SignupPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-deep-soft">Loading…</main>}>
      <SignupInner />
    </Suspense>
  );
}

type Role = "child" | "parent";
type Phase = "pick" | "form";

function SignupInner() {
  const { t } = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const { refresh, isAuthenticated, isLoading: authLoading } = useAuth();
  const nextUrl = resolveReturnUrl(search?.get("next"));

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace(nextUrl);
    }
  }, [authLoading, isAuthenticated, nextUrl, router]);

  const [role, setRole] = useState<Role | null>(null);

  return (
    <main className="relative min-h-screen flex flex-col">
      <NavBar />
      <div className="flex-1 flex items-center justify-center px-6 pt-32 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <AnimatePresence mode="wait">
            {!role ? (
              <motion.div
                key="picker"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-3xl glass-strong p-8 md:p-10 shadow-soft text-center"
              >
                <p className="font-display text-sm font-bold uppercase tracking-[0.18em] text-glacier-600 mb-2">
                  AutiStudy
                </p>
                <h1 className="font-display text-3xl md:text-4xl font-extrabold text-deep mb-2">
                  Join AutiStudy
                </h1>
                <p className="text-deep-soft mb-8">Create your account as…</p>

                <div className="grid grid-cols-2 gap-4">
                  <RoleCard
                    icon="🎒"
                    label="Student"
                    sub="I am a child who wants to learn"
                    onClick={() => setRole("child")}
                    color="from-sky-500 to-cyan-500"
                  />
                  <RoleCard
                    icon="👨‍👩‍👧"
                    label="Parent"
                    sub="I want to track my child's progress"
                    onClick={() => setRole("parent")}
                    color="from-violet-500 to-purple-600"
                  />
                </div>

                <p className="mt-8 text-center text-sm text-deep-soft">
                  Already have an account?{" "}
                  <Link href="/login" className="font-bold text-glacier-700 hover:text-deep">
                    Log in
                  </Link>
                </p>
              </motion.div>
            ) : role === "child" ? (
              <motion.div key="child" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <ChildSignupForm
                  onBack={() => setRole(null)}
                  refresh={refresh}
                  nextUrl={nextUrl}
                  router={router}
                />
              </motion.div>
            ) : (
              <motion.div key="parent" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <ParentSignupForm onBack={() => setRole(null)} router={router} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
      <Footer />
    </main>
  );
}

// ── Child signup form (V6: email OTP, no CNIC) ────────────────────────────────

function ChildSignupForm({
  onBack, refresh, nextUrl, router,
}: {
  onBack: () => void;
  refresh: () => Promise<void>;
  nextUrl: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [step, setStep] = useState<"form" | "otp">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [grade, setGrade] = useState(4);
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [expiresInSec, setExpiresInSec] = useState<number | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    setSubmitting(true);
    try {
      const res = await parentApi.childSignup({ name, email, password, grade });
      setDevOtp(res.dev_mode ? (res.dev_otp ?? null) : null);
      setCooldownSec(res.retry_after_sec ?? 60);
      setExpiresInSec(res.expires_in_sec ?? 15 * 60);
      setInfo(null);
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Signup failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const res = await authVerifyApi.verifyEmail({
        email,
        code: otp.trim(),
        role: "child",
      });
      if ("token" in res && res.token) {
        saveSession(res.token, res.user as Parameters<typeof saveSession>[1]);
        await refresh();
        clearReturnUrl();
        router.push(nextUrl);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Verification failed.");
      setOtp("");
      setSubmitting(false);
    }
  };

  const onResend = useCallback(async () => {
    if (cooldownSec > 0) return;
    setError(null);
    setInfo(null);
    try {
      const res = await authVerifyApi.resendOtp({ email, role: "child" });
      setDevOtp(res.dev_mode ? (res.dev_otp ?? null) : null);
      setCooldownSec(res.retry_after_sec ?? 60);
      setExpiresInSec(res.expires_in_sec ?? 15 * 60);
      setInfo("New code sent — check your inbox and Spam folder.");
      setOtp("");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.retryAfterSec) setCooldownSec(err.retryAfterSec);
        setError(err.detail);
      } else {
        setError("Could not resend code.");
      }
    }
  }, [cooldownSec, email]);

  if (step === "otp") {
    return (
      <OtpPanel
        email={email}
        otp={otp}
        setOtp={setOtp}
        devOtp={devOtp}
        error={error}
        info={info}
        submitting={submitting}
        cooldownSec={cooldownSec}
        setCooldownSec={setCooldownSec}
        expiresInSec={expiresInSec}
        onSubmit={onVerify}
        onResend={onResend}
        onBack={() => setStep("form")}
      />
    );
  }

  return (
    <div className="rounded-3xl glass-strong p-8 md:p-10 shadow-deep">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 border border-glacier-200 text-deep-soft hover:text-deep hover:bg-white transition-all"
        >
          ←
        </button>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎒</span>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-deep leading-tight">Student Sign Up</h1>
            <p className="text-xs text-deep-soft">We&apos;ll verify your email next</p>
          </div>
        </div>
      </div>

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field icon={<User size={18} />} placeholder="Your name" type="text" value={name} onChange={setName} required autoComplete="name" />
        <Field icon={<Mail size={18} />} placeholder="Email address" type="email" value={email} onChange={setEmail} required autoComplete="email" />
        <PasswordField value={password} onChange={setPassword} />
        <GradeSelect value={grade} onChange={setGrade} />

        <div className="rounded-2xl bg-glacier-50/80 border border-glacier-300/60 px-4 py-3 text-xs text-glacier-700">
          After signup you&apos;ll enter a code from your email. You can invite a parent later from your dashboard.
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-2xl bg-rose-50/80 border border-rose-200/60 px-4 py-3 text-sm text-rose-700"
            role="alert"
          >
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        <div className="pt-2">
          <DancingButton type="submit" variant="primary" fullWidth disabled={submitting} className={submitting ? "opacity-80 cursor-wait" : ""}>
            {submitting ? "Sending code…" : "Continue"}
          </DancingButton>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-deep-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-glacier-700 hover:text-deep">Log in</Link>
      </p>
    </div>
  );
}

// ── Parent signup form (V6: email OTP, then invite code on dashboard) ──────────

function ParentSignupForm({ onBack, router }: { onBack: () => void; router: ReturnType<typeof useRouter> }) {
  const [step, setStep] = useState<"form" | "otp">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [relationship, setRelationship] = useState<"father" | "mother" | "">("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [expiresInSec, setExpiresInSec] = useState<number | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (relationship !== "father" && relationship !== "mother") {
      setError("Please choose whether you are the child’s Father or Mother.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await parentApi.signup({ name, email, password, relationship });
      setDevOtp(res.dev_mode ? (res.dev_otp ?? null) : null);
      setCooldownSec(res.retry_after_sec ?? 60);
      setExpiresInSec(res.expires_in_sec ?? 15 * 60);
      setInfo(null);
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Signup failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const res = await authVerifyApi.verifyEmail({
        email,
        code: otp.trim(),
        role: "parent",
      });
      if ("token" in res && res.token) {
        setParentToken(res.token);
        router.push("/parent/dashboard");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Verification failed.");
      setOtp("");
      setSubmitting(false);
    }
  };

  const onResend = useCallback(async () => {
    if (cooldownSec > 0) return;
    setError(null);
    setInfo(null);
    try {
      const res = await authVerifyApi.resendOtp({ email, role: "parent" });
      setDevOtp(res.dev_mode ? (res.dev_otp ?? null) : null);
      setCooldownSec(res.retry_after_sec ?? 60);
      setExpiresInSec(res.expires_in_sec ?? 15 * 60);
      setInfo("New code sent — check your inbox and Spam folder.");
      setOtp("");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.retryAfterSec) setCooldownSec(err.retryAfterSec);
        setError(err.detail);
      } else {
        setError("Could not resend code.");
      }
    }
  }, [cooldownSec, email]);

  if (step === "otp") {
    return (
      <OtpPanel
        email={email}
        otp={otp}
        setOtp={setOtp}
        devOtp={devOtp}
        error={error}
        info={info}
        submitting={submitting}
        cooldownSec={cooldownSec}
        setCooldownSec={setCooldownSec}
        expiresInSec={expiresInSec}
        onSubmit={onVerify}
        onResend={onResend}
        onBack={() => setStep("form")}
      />
    );
  }

  return (
    <div className="rounded-3xl glass-strong p-8 md:p-10 shadow-deep">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 border border-glacier-200 text-deep-soft hover:text-deep hover:bg-white transition-all"
        >
          ←
        </button>
        <div className="flex items-center gap-2">
          <span className="text-2xl">👨‍👩‍👧</span>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-deep leading-tight">Parent Sign Up</h1>
            <p className="text-xs text-deep-soft">Verify email, then enter your child&apos;s invite code</p>
          </div>
        </div>
      </div>

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field icon={<User size={18} />} placeholder="Your full name" type="text" value={name} onChange={setName} required autoComplete="name" />
        <Field icon={<Mail size={18} />} placeholder="Your email address" type="email" value={email} onChange={setEmail} required autoComplete="email" />
        <PasswordField value={password} onChange={setPassword} />

        <fieldset className="rounded-2xl border border-glacier-300/70 bg-glacier-50/50 px-4 py-3">
          <legend className="px-1 text-sm font-bold text-deep">
            Are you the child’s father or mother?
          </legend>
          <p className="text-xs text-deep-soft mb-3 leading-relaxed">
            Each child can link one Father and one Mother (biological or step-parent).
          </p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: "father" as const, label: "Father" },
              { value: "mother" as const, label: "Mother" },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRelationship(opt.value)}
                className={`rounded-xl border px-3 py-3 text-sm font-bold transition-all ${
                  relationship === opt.value
                    ? "border-glacier-500 bg-glacier-600 text-white shadow-md"
                    : "border-glacier-200 bg-white text-deep hover:border-glacier-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="rounded-2xl bg-glacier-50/80 border border-glacier-300/60 px-4 py-3 text-sm text-glacier-700">
          <p className="font-bold mb-0.5">How linking works</p>
          <p className="text-xs leading-relaxed">
            1) Your child creates a Family Invitation Code (e.g. FAM-82K7Q) from Settings → Family.
            2) You verify this email, then enter that code.
            3) Your child Approves the request — then you can see their progress.
            You can link more than one child to this parent account.
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-2xl bg-rose-50/80 border border-rose-200/60 px-4 py-3 text-sm text-rose-700"
            role="alert"
          >
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        <div className="pt-2">
          <DancingButton type="submit" variant="primary" fullWidth disabled={submitting} className={submitting ? "opacity-80 cursor-wait" : ""}>
            {submitting ? "Sending code…" : "Continue"}
          </DancingButton>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-deep-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-glacier-700 hover:text-deep">Log in</Link>
      </p>
    </div>
  );
}

function classifyOtpError(message: string | null): "wrong" | "expired" | "locked" | "other" | null {
  if (!message) return null;
  const m = message.toLowerCase();
  if (m.includes("too many incorrect") || m.includes("too many tries")) return "locked";
  if (m.includes("expired") || m.includes("no code found")) return "expired";
  if (m.includes("incorrect") || m.includes("attempt")) return "wrong";
  return "other";
}

function isGmailAddress(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.endsWith("@gmail.com") || e.endsWith("@googlemail.com");
}

function OtpPanel({
  email,
  otp,
  setOtp,
  devOtp,
  error,
  info,
  submitting,
  cooldownSec,
  setCooldownSec,
  expiresInSec,
  onSubmit,
  onResend,
  onBack,
}: {
  email: string;
  otp: string;
  setOtp: (v: string) => void;
  devOtp: string | null;
  error: string | null;
  info: string | null;
  submitting: boolean;
  cooldownSec: number;
  setCooldownSec: (n: number | ((prev: number) => number)) => void;
  expiresInSec: number | null;
  onSubmit: (e: FormEvent) => void;
  onResend: () => void | Promise<void>;
  onBack: () => void;
}) {
  const [resending, setResending] = useState(false);
  const [otpInputEl, setOtpInputEl] = useState<HTMLInputElement | null>(null);
  const gmail = isGmailAddress(email);
  const errorKind = classifyOtpError(error);
  const needsResend = errorKind === "expired" || errorKind === "locked";

  useEffect(() => {
    otpInputEl?.focus();
  }, [otpInputEl]);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = window.setInterval(() => {
      setCooldownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownSec > 0, setCooldownSec]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResend = async () => {
    if (cooldownSec > 0 || resending) return;
    setResending(true);
    try {
      await onResend();
      otpInputEl?.focus();
    } finally {
      setResending(false);
    }
  };

  const expireMins =
    expiresInSec != null && expiresInSec > 0
      ? Math.max(1, Math.ceil(expiresInSec / 60))
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="rounded-3xl glass-strong p-8 md:p-10 shadow-deep"
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-5 flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 border border-glacier-200 text-deep-soft hover:text-deep"
        aria-label="Back"
      >
        ←
      </button>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.05, type: "spring", stiffness: 260, damping: 20 }}
        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-glacier-100 text-glacier-700"
      >
        <Mail size={28} strokeWidth={2.25} />
      </motion.div>

      <h1 className="font-display text-2xl md:text-[1.7rem] font-extrabold text-deep text-center leading-tight">
        {gmail ? "Check your Gmail" : "Check your email"}
      </h1>
      <p className="mt-2 text-sm text-deep-soft text-center leading-relaxed">
        We sent a 6-digit verification code to
      </p>
      <p className="mt-1.5 text-center text-sm font-bold text-deep break-all px-1">
        {email}
      </p>
      <p className="mt-3 text-center text-xs text-deep-muted leading-relaxed">
        Don&apos;t see it? Check your <strong className="font-semibold text-deep-soft">Spam</strong> or{" "}
        <strong className="font-semibold text-deep-soft">Promotions</strong> folder.
        {expireMins != null ? ` Code expires in about ${expireMins} minutes.` : ""}
      </p>

      {devOtp && (
        <div className="mt-5 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          <strong>Dev mode:</strong> SMTP not configured — use code{" "}
          <span className="font-mono font-extrabold tracking-widest">{devOtp}</span>
        </div>
      )}

      <form className="mt-7 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="sr-only">Verification code</span>
          <input
            ref={setOtpInputEl}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            value={otp}
            onChange={(e) => {
              setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
            }}
            maxLength={6}
            required
            aria-invalid={Boolean(error)}
            className={`w-full rounded-2xl bg-white/70 border px-4 py-3.5 text-center text-2xl font-mono tracking-[0.45em] text-deep focus:outline-none focus:ring-4 transition-shadow ${
              error
                ? "border-rose-300 focus:ring-rose-200/50"
                : "border-glacier-200/60 focus:ring-glacier-300/40"
            }`}
          />
        </label>

        {info && !error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-2xl bg-emerald-50/90 border border-emerald-200/70 px-4 py-3 text-sm text-emerald-800"
            role="status"
          >
            <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" />
            <span>{info}</span>
          </motion.div>
        )}

        {error && (
          <motion.div
            key={error}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-start gap-2 rounded-2xl bg-rose-50/80 border border-rose-200/60 px-4 py-3 text-sm text-rose-700"
            role="alert"
          >
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <span>
              {error}
              {needsResend && cooldownSec <= 0 ? " " : ""}
            </span>
          </motion.div>
        )}

        <DancingButton type="submit" variant="primary" fullWidth disabled={submitting || otp.length !== 6}>
          {submitting ? "Verifying…" : "Verify & continue"}
        </DancingButton>
      </form>

      <button
        type="button"
        onClick={handleResend}
        disabled={cooldownSec > 0 || resending}
        className={`mt-5 w-full text-center text-sm font-bold transition-colors ${
          cooldownSec > 0 || resending
            ? "text-deep-muted cursor-not-allowed"
            : "text-glacier-700 hover:text-deep"
        }`}
      >
        {resending
          ? "Sending new code…"
          : cooldownSec > 0
            ? `Resend code in ${cooldownSec}s`
            : needsResend
              ? "Resend a new code"
              : "Resend code"}
      </button>

      <p className="mt-3 text-center text-xs text-deep-muted">
        Wrong email? Go back and sign up again with the correct address.
      </p>
    </motion.div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function RoleCard({ icon, label, sub, onClick, color }: { icon: string; label: string; sub: string; onClick: () => void; color: string }) {
  return (
    <motion.button
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="flex flex-col items-center gap-3 rounded-2xl border-2 border-glacier-100 bg-white/70 p-5 hover:border-glacier-300 hover:bg-white transition-all shadow-soft text-center"
    >
      <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-3xl shadow`}>
        {icon}
      </div>
      <div>
        <div className="font-display font-extrabold text-deep text-lg leading-tight">{label}</div>
        <div className="text-xs text-deep-soft mt-1 leading-snug">{sub}</div>
      </div>
    </motion.button>
  );
}

interface FieldProps {
  icon: React.ReactNode;
  placeholder: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
}

function Field({ icon, placeholder, type, value, onChange, required, autoComplete }: FieldProps) {
  return (
    <label className="block">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-deep-muted">{icon}</span>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete={autoComplete}
          className="w-full rounded-2xl bg-white/70 border border-glacier-200/60 pl-12 pr-4 py-3.5 text-deep placeholder:text-deep-muted focus:outline-none focus:ring-4 focus:ring-glacier-300/40 focus:border-glacier-400 transition-all"
        />
      </div>
    </label>
  );
}

// ── Password strength component ───────────────────────────────────────────────

interface PasswordRule { label: string; ok: boolean }

function getPasswordRules(pw: string): PasswordRule[] {
  return [
    { label: "At least 8 characters",      ok: pw.length >= 8 },
    { label: "One uppercase letter (A-Z)",  ok: /[A-Z]/.test(pw) },
    { label: "One lowercase letter (a-z)",  ok: /[a-z]/.test(pw) },
    { label: "One number (0-9)",            ok: /\d/.test(pw) },
    { label: "One special character (!@#…)", ok: /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>\/?`~]/.test(pw) },
  ];
}

function getStrengthLevel(rules: PasswordRule[]): { score: number; label: string; color: string } {
  const score = rules.filter(r => r.ok).length;
  if (score <= 1) return { score, label: "Very weak",  color: "bg-rose-500" };
  if (score === 2) return { score, label: "Weak",       color: "bg-orange-500" };
  if (score === 3) return { score, label: "Fair",       color: "bg-amber-500" };
  if (score === 4) return { score, label: "Good",       color: "bg-glacier-500" };
  return             { score, label: "Strong ✓",      color: "bg-emerald-500" };
}

function PasswordField({
  value, onChange, placeholder = "Password", autoComplete = "new-password",
}: { value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const rules = getPasswordRules(value);
  const strength = getStrengthLevel(rules);
  const showHints = focused || value.length > 0;

  return (
    <div className="space-y-2">
      <label className="block">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-deep-muted">
            <Lock size={18} />
          </span>
          <input
            type={show ? "text" : "password"}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            required
            autoComplete={autoComplete}
            className="w-full rounded-2xl bg-white/70 border border-glacier-200/60 pl-12 pr-12 py-3.5 text-deep placeholder:text-deep-muted focus:outline-none focus:ring-4 focus:ring-glacier-300/40 focus:border-glacier-400 transition-all"
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-deep-muted hover:text-deep transition-colors"
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </label>

      {showHints && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-2 px-1"
        >
          {/* Strength bar */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1 flex-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    i <= strength.score ? strength.color : "bg-glacier-100"
                  }`}
                />
              ))}
            </div>
            <span className={`text-xs font-bold ${
              strength.score === 5 ? "text-emerald-600" :
              strength.score >= 3 ? "text-amber-600" : "text-rose-600"
            }`}>{strength.label}</span>
          </div>
          {/* Rules checklist */}
          <div className="grid grid-cols-1 gap-0.5">
            {rules.map(r => (
              <div key={r.label} className={`flex items-center gap-1.5 text-xs transition-colors ${r.ok ? "text-emerald-600" : "text-deep-muted"}`}>
                {r.ok
                  ? <CheckCircle2 size={11} className="flex-shrink-0" />
                  : <span className="w-[11px] h-[11px] rounded-full border border-current flex-shrink-0" />
                }
                {r.label}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function GradeSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1 text-sm font-bold text-deep-soft">
        <GraduationCap size={16} />
        <span>Your Grade</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[4, 5, 6, 7].map((g) => {
          const selected = value === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => onChange(g)}
              className={`rounded-2xl py-3 font-display font-bold text-lg transition-all border-2 ${
                selected
                  ? "bg-glacier-500 text-white border-glacier-500 shadow-soft scale-[1.02]"
                  : "bg-white/70 text-deep border-glacier-200/60 hover:border-glacier-400 hover:bg-white"
              }`}
            >
              {g}
            </button>
          );
        })}
      </div>
    </div>
  );
}
