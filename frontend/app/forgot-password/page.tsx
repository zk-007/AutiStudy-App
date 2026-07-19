"use client";

import { Suspense, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { DancingButton } from "@/components/primitives/DancingButton";
import { ApiError, authForgotApi } from "@/lib/api/client";

type Role = "child" | "parent";
type Step = "email" | "otp" | "password" | "done";

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center text-deep-soft">
          Loading…
        </main>
      }
    >
      <ForgotPasswordInner />
    </Suspense>
  );
}

function ForgotPasswordInner() {
  const router = useRouter();
  const search = useSearchParams();
  const initialRole =
    search?.get("role") === "parent" ? "parent" : search?.get("role") === "child" ? "child" : null;

  const [role, setRole] = useState<Role | null>(initialRole);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [expiresInSec, setExpiresInSec] = useState<number | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = window.setInterval(() => {
      setCooldownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownSec > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== "done") return;
    const id = window.setTimeout(() => {
      router.replace(`/login`);
    }, 2200);
    return () => window.clearTimeout(id);
  }, [step, router]);

  const friendlyError = (err: unknown): string => {
    if (err instanceof ApiError) {
      if (err.status === 0) return "Network error. Check your connection and try again.";
      return err.detail || "Something went wrong. Please try again.";
    }
    return "Something went wrong. Please try again.";
  };

  const onRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!role) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const res = await authForgotApi.request({ email: email.trim(), role });
      setDevOtp(res.dev_otp ?? null);
      setExpiresInSec(res.expires_in_sec ?? null);
      setCooldownSec(res.retry_after_sec ?? 60);
      setInfo("Enter the verification code sent to your email.");
      setStep("otp");
      setOtp("");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    if (!role || cooldownSec > 0 || resending) return;
    setError(null);
    setResending(true);
    try {
      const res = await authForgotApi.resend({ email: email.trim(), role });
      setDevOtp(res.dev_otp ?? null);
      setExpiresInSec(res.expires_in_sec ?? null);
      setCooldownSec(res.retry_after_sec ?? 60);
      setInfo("Enter the verification code sent to your email.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setResending(false);
    }
  };

  const onVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!role) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await authForgotApi.verify({
        email: email.trim(),
        role,
        code: otp.trim(),
      });
      setResetToken(res.reset_token);
      setPassword("");
      setConfirm("");
      setStep("password");
      setInfo(null);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!role || !resetToken) return;
    setError(null);

    const rules = getPasswordRules(password);
    if (rules.some((r) => !r.ok)) {
      setError("Please meet all password security requirements.");
      return;
    }
    if (password !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await authForgotApi.reset({
        email: email.trim(),
        role,
        reset_token: resetToken,
        new_password: password,
      });
      setStep("done");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const loginHref = role ? `/login` : "/login";

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
                key="role"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-3xl glass-strong p-8 md:p-10 shadow-deep text-center"
              >
                <h1 className="font-display text-3xl font-extrabold text-deep mb-2">
                  Forgot Password
                </h1>
                <p className="text-deep-soft mb-8">
                  Whose account do you want to reset?
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <RoleCard
                    icon="🎒"
                    label="Student"
                    sub="Child account"
                    color="from-sky-500 to-cyan-500"
                    onClick={() => setRole("child")}
                  />
                  <RoleCard
                    icon="👨‍👩‍👧"
                    label="Parent"
                    sub="Parent account"
                    color="from-violet-500 to-purple-600"
                    onClick={() => setRole("parent")}
                  />
                </div>
                <p className="mt-8 text-sm text-deep-soft">
                  Remembered it?{" "}
                  <Link href="/login" className="font-bold text-glacier-700 hover:text-deep">
                    Back to login
                  </Link>
                </p>
              </motion.div>
            ) : step === "email" ? (
              <motion.div
                key="email"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-3xl glass-strong p-8 md:p-10 shadow-deep"
              >
                <Header
                  role={role}
                  title="Forgot Password"
                  sub="Enter your registered email address"
                  onBack={() => {
                    setError(null);
                    if (initialRole) {
                      router.push("/login");
                    } else {
                      setRole(null);
                    }
                  }}
                />
                <form className="space-y-4" onSubmit={onRequestCode} noValidate>
                  <Field
                    icon={<Mail size={18} />}
                    placeholder="Registered email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    required
                    autoComplete="email"
                  />
                  {error && <ErrorBox text={error} />}
                  <DancingButton type="submit" variant="primary" fullWidth disabled={submitting}>
                    {submitting ? "Sending code…" : "Send verification code"}
                  </DancingButton>
                </form>
                <p className="mt-6 text-center text-sm text-deep-soft">
                  <Link href={loginHref} className="font-bold text-glacier-700 hover:text-deep">
                    Back to login
                  </Link>
                </p>
              </motion.div>
            ) : step === "otp" ? (
              <motion.div
                key="otp"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-3xl glass-strong p-8 md:p-10 shadow-deep"
              >
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setError(null);
                    setOtp("");
                  }}
                  className="mb-5 flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 border border-glacier-200 text-deep-soft hover:text-deep"
                  aria-label="Back"
                >
                  ←
                </button>

                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-glacier-100 text-glacier-700">
                  <Mail size={28} strokeWidth={2.25} />
                </div>
                <h1 className="font-display text-2xl font-extrabold text-deep text-center">
                  Check your email
                </h1>
                <p className="mt-3 text-center text-sm text-deep-soft leading-relaxed">
                  Enter the verification code sent to your email.
                </p>
                <p className="mt-1.5 text-center text-sm font-bold text-deep break-all px-1">
                  {email}
                </p>
                {expiresInSec != null && expiresInSec > 0 && (
                  <p className="mt-2 text-center text-xs text-deep-muted">
                    Code expires in about {Math.max(1, Math.ceil(expiresInSec / 60))} minutes.
                  </p>
                )}

                {devOtp && (
                  <div className="mt-5 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                    <strong>Dev mode:</strong> use code{" "}
                    <span className="font-mono font-extrabold tracking-widest">{devOtp}</span>
                  </div>
                )}

                <form className="mt-7 space-y-4" onSubmit={onVerifyOtp}>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    required
                    className={`w-full rounded-2xl bg-white/70 border px-4 py-3.5 text-center text-2xl font-mono tracking-[0.45em] text-deep focus:outline-none focus:ring-4 ${
                      error
                        ? "border-rose-300 focus:ring-rose-200/50"
                        : "border-glacier-200/60 focus:ring-glacier-300/40"
                    }`}
                  />
                  {info && !error && (
                    <div className="flex items-start gap-2 rounded-2xl bg-emerald-50/90 border border-emerald-200/70 px-4 py-3 text-sm text-emerald-800">
                      <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" />
                      <span>{info}</span>
                    </div>
                  )}
                  {error && <ErrorBox text={error} />}
                  <DancingButton
                    type="submit"
                    variant="primary"
                    fullWidth
                    disabled={submitting || otp.length !== 6}
                  >
                    {submitting ? "Verifying…" : "Verify code"}
                  </DancingButton>
                </form>

                <button
                  type="button"
                  onClick={onResend}
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
                      : "Resend code"}
                </button>
              </motion.div>
            ) : step === "password" ? (
              <motion.div
                key="password"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-3xl glass-strong p-8 md:p-10 shadow-deep"
              >
                <Header
                  role={role}
                  title="Create new password"
                  sub="Choose a strong password for your account"
                  onBack={() => {
                    // OTP is already consumed — start over from email.
                    setStep("email");
                    setError(null);
                    setResetToken(null);
                    setOtp("");
                    setInfo(null);
                  }}
                />
                <form className="space-y-4" onSubmit={onResetPassword} noValidate>
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    placeholder="New Password"
                  />
                  <PasswordField
                    value={confirm}
                    onChange={setConfirm}
                    placeholder="Confirm New Password"
                    showRules={false}
                  />
                  {error && <ErrorBox text={error} />}
                  <DancingButton type="submit" variant="primary" fullWidth disabled={submitting}>
                    {submitting ? "Updating…" : "Update password"}
                  </DancingButton>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-3xl glass-strong p-8 md:p-10 shadow-deep text-center"
              >
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 size={34} />
                </div>
                <h1 className="font-display text-2xl font-extrabold text-deep">
                  Password updated
                </h1>
                <p className="mt-3 text-deep-soft leading-relaxed">
                  Your password has been updated successfully.
                </p>
                <p className="mt-2 text-sm text-deep-muted">
                  Redirecting you to login…
                </p>
                <Link
                  href="/login"
                  className="mt-6 inline-block font-bold text-glacier-700 hover:text-deep"
                >
                  Go to login now
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
      <Footer />
    </main>
  );
}

function Header({
  role,
  title,
  sub,
  onBack,
}: {
  role: Role;
  title: string;
  sub: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button
        type="button"
        onClick={onBack}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 border border-glacier-200 text-deep-soft hover:text-deep hover:bg-white transition-all"
      >
        ←
      </button>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{role === "child" ? "🎒" : "👨‍👩‍👧"}</span>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-deep leading-tight">
            {title}
          </h1>
          <p className="text-xs text-deep-soft">{sub}</p>
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  icon,
  label,
  sub,
  onClick,
  color,
}: {
  icon: string;
  label: string;
  sub: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="flex flex-col items-center gap-3 rounded-2xl border-2 border-glacier-100 bg-white/70 p-5 hover:border-glacier-300 hover:bg-white transition-all shadow-soft text-center"
    >
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-3xl shadow`}
      >
        {icon}
      </div>
      <div>
        <div className="font-display font-extrabold text-deep text-lg leading-tight">
          {label}
        </div>
        <div className="text-xs text-deep-soft mt-1 leading-snug">{sub}</div>
      </div>
    </motion.button>
  );
}

function Field({
  icon,
  placeholder,
  type,
  value,
  onChange,
  required,
  autoComplete,
}: {
  icon: React.ReactNode;
  placeholder: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-deep-muted">
          {icon}
        </span>
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

function ErrorBox({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2 rounded-2xl bg-rose-50/80 border border-rose-200/60 px-4 py-3 text-sm text-rose-700"
      role="alert"
    >
      <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
      <span>{text}</span>
    </motion.div>
  );
}

interface PasswordRule {
  label: string;
  ok: boolean;
}

function getPasswordRules(pw: string): PasswordRule[] {
  return [
    { label: "At least 8 characters", ok: pw.length >= 8 },
    { label: "One uppercase letter (A-Z)", ok: /[A-Z]/.test(pw) },
    { label: "One lowercase letter (a-z)", ok: /[a-z]/.test(pw) },
    { label: "One number (0-9)", ok: /\d/.test(pw) },
    {
      label: "One special character (!@#…)",
      ok: /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>\/?`~]/.test(pw),
    },
  ];
}

function PasswordField({
  value,
  onChange,
  placeholder,
  showRules = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  showRules?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const rules = getPasswordRules(value);
  const showHints = showRules && (focused || value.length > 0);
  const score = rules.filter((r) => r.ok).length;

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
            autoComplete="new-password"
            className="w-full rounded-2xl bg-white/70 border border-glacier-200/60 pl-12 pr-12 py-3.5 text-deep placeholder:text-deep-muted focus:outline-none focus:ring-4 focus:ring-glacier-300/40 focus:border-glacier-400 transition-all"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-deep-muted hover:text-deep transition-colors"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </label>
      {showHints && (
        <div className="space-y-1.5 px-1">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i <= score
                    ? score <= 2
                      ? "bg-rose-500"
                      : score <= 4
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    : "bg-glacier-100"
                }`}
              />
            ))}
          </div>
          <ul className="space-y-0.5">
            {rules.map((r) => (
              <li
                key={r.label}
                className={`text-xs ${r.ok ? "text-emerald-700" : "text-deep-muted"}`}
              >
                {r.ok ? "✓" : "○"} {r.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
