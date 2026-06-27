"use client";

import { ChangeEvent, FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, CreditCard, GraduationCap, Lock, Mail,
  Upload, User, Users, X, CheckCircle2, Eye, EyeOff,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { DancingButton } from "@/components/primitives/DancingButton";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { resolveReturnUrl, clearReturnUrl } from "@/lib/auth/redirect";
import { ApiError, parentApi, saveSession, setParentToken } from "@/lib/api/client";

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
  const { register, refresh, isAuthenticated, isLoading: authLoading } = useAuth();
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
                className="rounded-3xl glass-strong p-8 md:p-10 shadow-deep text-center"
              >
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
                  onSuccess={(token) => {
                    clearReturnUrl();
                    router.push(nextUrl);
                  }}
                  register={register}
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

// ── Child signup form ─────────────────────────────────────────────────────────

function ChildSignupForm({
  onBack, onSuccess, register, refresh, nextUrl, router,
}: {
  onBack: () => void;
  onSuccess: (token: string) => void;
  register: (data: { name: string; email: string; password: string; grade: number; role?: string }) => Promise<unknown>;
  refresh: () => Promise<void>;
  nextUrl: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [grade, setGrade] = useState(4);
  const [childCnic, setChildCnic] = useState("");
  const [bformFile, setBformFile] = useState<File | null>(null);
  const [bformPreview, setBformPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "scanning" | "ok" | "error">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  const formatCnic = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 13);
    if (digits.length <= 5) return digits;
    if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBformFile(file);
    setBformPreview(URL.createObjectURL(file));
    setOcrStatus("idle");
    setError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const rawCnic = childCnic.replace(/\D/g, "");
    if (rawCnic.length !== 13) {
      setError("Please enter your complete 13-digit CNIC (B-Form number).");
      return;
    }
    if (!bformFile) {
      setError("Please upload a photo of your CRC / B-Form to verify your identity.");
      return;
    }
    setSubmitting(true);
    setOcrStatus("scanning");
    try {
      const res = await parentApi.childSignup({ name, email, password, grade, cnic: rawCnic, bform: bformFile });
      setOcrStatus("ok");
      saveSession(res.token, res.user);
      await refresh();
      clearReturnUrl();
      router.push(nextUrl);
    } catch (err) {
      setOcrStatus("error");
      setError(err instanceof ApiError ? err.detail : "Signup failed. Please try again.");
      setSubmitting(false);
    }
  };

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
            <p className="text-xs text-deep-soft">Create your learning account</p>
          </div>
        </div>
      </div>

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field icon={<User size={18} />} placeholder="Your name" type="text" value={name} onChange={setName} required autoComplete="name" />
        <Field icon={<Mail size={18} />} placeholder="Email address" type="email" value={email} onChange={setEmail} required autoComplete="email" />
        <PasswordField value={password} onChange={setPassword} />
        <GradeSelect value={grade} onChange={setGrade} />

        {/* Child's own CNIC */}
        <div>
          <label className="block">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-deep-muted">
                <CreditCard size={18} />
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Your CNIC / B-Form number (e.g. 35201-1234567-1)"
                value={childCnic}
                onChange={(e) => setChildCnic(formatCnic(e.target.value))}
                required
                maxLength={15}
                className="w-full rounded-2xl bg-white/70 border border-glacier-200/60 pl-12 pr-4 py-3.5 text-deep placeholder:text-deep-muted focus:outline-none focus:ring-4 focus:ring-glacier-300/40 focus:border-glacier-400 transition-all font-mono tracking-widest"
              />
            </div>
          </label>
          <p className="text-xs text-deep-muted mt-1.5 px-1">Your 13-digit national identity / B-Form number</p>
        </div>

        {/* B-Form Upload */}
        <div>
          <p className="text-sm font-bold text-deep-soft mb-2 px-1">📄 B-Form / Child Registration Certificate</p>
          <div
            onClick={() => fileRef.current?.click()}
            className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all p-4 text-center ${
              bformFile ? "border-glacier-400 bg-glacier-50/60" : "border-glacier-200 bg-white/40 hover:border-glacier-400 hover:bg-white/60"
            }`}
          >
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

            {bformPreview ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bformPreview} alt="B-Form preview" className="h-16 w-20 object-cover rounded-xl border border-glacier-200 flex-shrink-0" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-deep truncate">{bformFile?.name}</p>
                  <p className="text-xs text-deep-soft mt-0.5">
                    {ocrStatus === "scanning" && "🔍 Scanning document…"}
                    {ocrStatus === "ok" && <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> Verified</span>}
                    {ocrStatus === "error" && <span className="text-rose-600">Scan failed — try a clearer photo</span>}
                    {ocrStatus === "idle" && "Click to change photo"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setBformFile(null); setBformPreview(null); setOcrStatus("idle"); }}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white border border-glacier-200 text-deep-muted hover:text-deep flex-shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-glacier-100 text-glacier-600">
                  <Upload size={22} />
                </div>
                <p className="text-sm font-bold text-deep">Upload B-Form photo</p>
                <p className="text-xs text-deep-soft">Take a clear, well-lit photo of your NADRA B-Form</p>
              </div>
            )}
          </div>
          <p className="text-xs text-deep-muted mt-1.5 px-1">
            We use this to verify your identity for parent access. The image is not stored.
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
            {submitting ? (ocrStatus === "scanning" ? "Scanning B-Form…" : "Creating account…") : "Create Student Account"}
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

// ── Parent signup form ────────────────────────────────────────────────────────

function ParentSignupForm({ onBack, router }: { onBack: () => void; router: ReturnType<typeof useRouter> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cnic, setCnic] = useState("");
  const [childName, setChildName] = useState("");
  const [childCnic, setChildCnic] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatCnic = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 13);
    if (digits.length <= 5) return digits;
    if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const rawCnic = cnic.replace(/\D/g, "");
    if (rawCnic.length !== 13) {
      setError("Please enter your complete 13-digit CNIC.");
      return;
    }
    const rawChildCnic = childCnic.replace(/\D/g, "");
    if (rawChildCnic.length !== 13) {
      setError("Please enter your child's complete 13-digit CNIC / B-Form number.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await parentApi.signup({
        name, email, password, cnic: rawCnic,
        child_name: childName, child_cnic: rawChildCnic,
      });
      setParentToken(res.token);
      router.push("/parent/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Signup failed. Please try again.");
      setSubmitting(false);
    }
  };

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
            <p className="text-xs text-deep-soft">Link to your child's account</p>
          </div>
        </div>
      </div>

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field icon={<User size={18} />} placeholder="Your full name" type="text" value={name} onChange={setName} required autoComplete="name" />
        <Field icon={<Mail size={18} />} placeholder="Your email address" type="email" value={email} onChange={setEmail} required autoComplete="email" />
        <PasswordField value={password} onChange={setPassword} />

        <div>
          <label className="block">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-deep-muted">
                <Users size={18} />
              </span>
              <input
                type="text"
                placeholder="Child's full name (as registered in AutiStudy)"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                required
                className="w-full rounded-2xl bg-white/70 border border-glacier-200/60 pl-12 pr-4 py-3.5 text-deep placeholder:text-deep-muted focus:outline-none focus:ring-4 focus:ring-glacier-300/40 focus:border-glacier-400 transition-all"
              />
            </div>
          </label>
        </div>

        <div>
          <label className="block">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-deep-muted">
                <CreditCard size={18} />
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Child's CNIC / B-Form number (13 digits)"
                value={childCnic}
                onChange={(e) => setChildCnic(formatCnic(e.target.value))}
                required
                maxLength={15}
                className="w-full rounded-2xl bg-white/70 border border-glacier-200/60 pl-12 pr-4 py-3.5 text-deep placeholder:text-deep-muted focus:outline-none focus:ring-4 focus:ring-glacier-300/40 focus:border-glacier-400 transition-all font-mono tracking-widest"
              />
            </div>
          </label>
          <p className="text-xs text-deep-muted mt-1.5 px-1">The child's own 13-digit national identity / B-Form number</p>
        </div>

        <div>
          <label className="block">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-deep-muted">
                <CreditCard size={18} />
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Your CNIC (e.g. 35201-1234567-1)"
                value={cnic}
                onChange={(e) => setCnic(formatCnic(e.target.value))}
                required
                maxLength={15}
                className="w-full rounded-2xl bg-white/70 border border-glacier-200/60 pl-12 pr-4 py-3.5 text-deep placeholder:text-deep-muted focus:outline-none focus:ring-4 focus:ring-violet-300/40 focus:border-violet-400 transition-all font-mono tracking-widest"
              />
            </div>
          </label>
          <p className="text-xs text-deep-muted mt-1.5 px-1">
            Your CNIC is matched against your child's B-Form for verification.
          </p>
        </div>

        {/* Info box */}
        <div className="rounded-2xl bg-violet-50/80 border border-violet-200/60 px-4 py-3 text-sm text-violet-700">
          <p className="font-bold mb-0.5">How does this work?</p>
          <p className="text-xs leading-relaxed">
            Your child must have signed up with their B-Form photo. We extract the parent CNICs from that B-Form and match them with the CNIC you enter here. This ensures only real parents can access the child's data.
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
            {submitting ? "Verifying…" : "Create Parent Account"}
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
  if (score === 4) return { score, label: "Good",       color: "bg-sky-500" };
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
