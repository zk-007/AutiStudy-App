"use client";

import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ApiError, contactApi, type ContactPayload } from "@/lib/api/client";

const SUPPORT_EMAIL = "supportAutistudy@gmail.com";

const INPUT_CLASS =
  "w-full rounded-2xl border border-glacier-200 bg-white/80 px-4 py-2.5 text-sm text-deep outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 transition";

type Role = ContactPayload["role"];

export default function ContactPage() {
  const { t } = useLocale();
  const { user, isAuthenticated } = useAuth();
  const c = t.pages.contact;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    setName((prev) => prev || user.name || "");
    setEmail((prev) => prev || user.email || "");
    if (user.role === "parent") setRole("parent");
    else if (user.role === "student") setRole("student");
  }, [isAuthenticated, user]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      await contactApi.submit({
        name: name.trim(),
        email: email.trim(),
        role,
        subject: subject.trim(),
        message: message.trim(),
      });
      setStatus("ok");
      setSubject("");
      setMessage("");
    } catch (err) {
      setStatus("err");
      setError(err instanceof ApiError ? err.detail : c.errorGeneric);
    }
  };

  return (
    <PageShell title={c.title} subtitle={c.sub}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-3 rounded-3xl glass-strong shadow-soft p-6 md:p-8 text-left"
        >
          {status === "ok" ? (
            <div className="flex flex-col items-center text-center py-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 mb-4">
                <CheckCircle2 size={28} />
              </div>
              <h2 className="font-display text-2xl font-extrabold text-deep">{c.successTitle}</h2>
              <p className="mt-3 text-sm text-deep-soft max-w-md">{c.successBody}</p>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setError(null);
                }}
                className="mt-6 rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 px-6 py-2.5 text-sm font-bold text-white shadow-soft"
              >
                {c.another}
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={c.name}>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={INPUT_CLASS}
                    autoComplete="name"
                  />
                </Field>
                <Field label={c.email}>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={INPUT_CLASS}
                    autoComplete="email"
                  />
                </Field>
              </div>

              <Field label={c.role}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(c.roles) as Role[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${
                        role === r
                          ? "bg-sky-100 text-sky-800 ring-2 ring-sky-400"
                          : "bg-white/70 text-deep-soft hover:bg-white"
                      }`}
                    >
                      {c.roles[r]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={c.subject}>
                <input
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label={c.message} hint={c.messageHint}>
                <textarea
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={`${INPUT_CLASS} resize-y min-h-[120px]`}
                />
              </Field>

              {error && (
                <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 px-7 py-3 text-sm font-bold text-white shadow-soft hover:shadow-deep transition-shadow disabled:opacity-60"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {c.sending}
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    {c.send}
                  </>
                )}
              </button>
            </form>
          )}
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="lg:col-span-2 rounded-3xl glass-strong shadow-soft p-6 md:p-7 text-left"
        >
          <h2 className="font-display text-xl font-extrabold text-deep">{c.supportHeading}</h2>
          <p className="mt-2 text-sm text-deep-soft">{c.supportEmailLabel}</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-4 flex items-center gap-2 rounded-2xl bg-white/70 border border-glacier-100 px-3 py-2.5 text-sm text-sky-700 hover:bg-white transition-colors"
          >
            <Mail size={16} className="flex-shrink-0" />
            <span className="truncate">{SUPPORT_EMAIL}</span>
          </a>
          <p className="mt-3 text-xs text-deep-muted leading-relaxed">
            {c.supportHint}
          </p>
        </motion.aside>
      </div>
    </PageShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-left">
      <span className="text-sm font-bold text-deep">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-deep-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
