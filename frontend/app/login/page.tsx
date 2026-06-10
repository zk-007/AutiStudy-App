"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, AlertCircle, Eye, EyeOff } from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { DancingButton } from "@/components/primitives/DancingButton";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { safeNext } from "@/lib/auth/redirect";
import { ApiError, parentApi, setParentToken } from "@/lib/api/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-deep-soft">Loading…</main>}>
      <LoginInner />
    </Suspense>
  );
}

type Role = "child" | "parent";

function LoginInner() {
  const { t } = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const { login } = useAuth();
  const nextUrl = safeNext(search?.get("next"));

  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const friendlyError = (err: unknown): string => {
    if (err instanceof ApiError) {
      if (err.status === 0) return t.auth.errors.network;
      if (err.status === 401) return t.auth.errors.invalidCredentials;
      return err.detail;
    }
    return t.auth.errors.generic;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (role === "child") {
        await login(email, password);
        router.push(nextUrl);
      } else {
        const res = await parentApi.login({ email, password });
        setParentToken(res.token);
        router.push("/parent/dashboard");
      }
    } catch (err) {
      setError(friendlyError(err));
      setSubmitting(false);
    }
  };

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
              /* ── Role picker ── */
              <motion.div
                key="picker"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-3xl glass-strong p-8 md:p-10 shadow-deep text-center"
              >
                <h1 className="font-display text-3xl md:text-4xl font-extrabold text-deep mb-2">
                  Welcome Back
                </h1>
                <p className="text-deep-soft mb-8">Who is signing in?</p>

                <div className="grid grid-cols-2 gap-4">
                  <RoleCard
                    icon="🎒"
                    label="Student"
                    sub="I am a child using AutiStudy"
                    onClick={() => setRole("child")}
                    color="from-sky-500 to-cyan-500"
                  />
                  <RoleCard
                    icon="👨‍👩‍👧"
                    label="Parent"
                    sub="I want to see my child's progress"
                    onClick={() => setRole("parent")}
                    color="from-violet-500 to-purple-600"
                  />
                </div>

                <p className="mt-8 text-center text-sm text-deep-soft">
                  Don&apos;t have an account?{" "}
                  <Link href="/signup" className="font-bold text-glacier-700 hover:text-deep">
                    Sign up
                  </Link>
                </p>
              </motion.div>
            ) : (
              /* ── Login form ── */
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-3xl glass-strong p-8 md:p-10 shadow-deep"
              >
                {/* Header with back button */}
                <div className="flex items-center gap-3 mb-6">
                  <button
                    onClick={() => { setRole(null); setError(null); }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 border border-glacier-200 text-deep-soft hover:text-deep hover:bg-white transition-all"
                  >
                    ←
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{role === "child" ? "🎒" : "👨‍👩‍👧"}</span>
                    <div>
                      <h1 className="font-display text-2xl font-extrabold text-deep leading-tight">
                        {role === "child" ? "Student Login" : "Parent Login"}
                      </h1>
                      <p className="text-xs text-deep-soft">
                        {role === "child" ? "Sign in to your learning account" : "Access your child's progress"}
                      </p>
                    </div>
                  </div>
                </div>

                <form className="space-y-4" onSubmit={onSubmit} noValidate>
                  <Field
                    icon={<Mail size={18} />}
                    placeholder={t.auth.email}
                    type="email"
                    value={email}
                    onChange={setEmail}
                    required
                    autoComplete="email"
                  />
                  <Field
                    icon={<Lock size={18} />}
                    placeholder={t.auth.password}
                    type="password"
                    value={password}
                    onChange={setPassword}
                    required
                    autoComplete="current-password"
                  />

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
                    <DancingButton
                      type="submit"
                      variant="primary"
                      fullWidth
                      disabled={submitting}
                      className={submitting ? "opacity-80 cursor-wait" : ""}
                    >
                      {submitting ? t.auth.submittingLogin : t.auth.submitLogin}
                    </DancingButton>
                  </div>
                </form>

                <p className="mt-6 text-center text-sm text-deep-soft">
                  {t.auth.noAccount}{" "}
                  <Link
                    href={nextUrl && nextUrl !== "/dashboard" ? `/signup?next=${encodeURIComponent(nextUrl)}` : "/signup"}
                    className="font-bold text-glacier-700 hover:text-deep"
                  >
                    {t.nav.signup}
                  </Link>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
      <Footer />
    </main>
  );
}

function RoleCard({
  icon, label, sub, onClick, color,
}: {
  icon: string; label: string; sub: string; onClick: () => void; color: string;
}) {
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

function Field({ icon, placeholder, type: initialType, value, onChange, required, autoComplete }: FieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = initialType === "password";
  const type = isPassword ? (show ? "text" : "password") : initialType;

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
          className={`w-full rounded-2xl bg-white/70 border border-glacier-200/60 pl-12 py-3.5 text-deep placeholder:text-deep-muted focus:outline-none focus:ring-4 focus:ring-glacier-300/40 focus:border-glacier-400 transition-all ${isPassword ? "pr-12" : "pr-4"}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-deep-muted hover:text-deep transition-colors"
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
    </label>
  );
}
