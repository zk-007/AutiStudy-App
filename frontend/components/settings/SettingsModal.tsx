"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import {
  X, Palette, Accessibility, Globe, User, Lock, Info,
  ChevronRight, Check, Eye, EyeOff,
} from "lucide-react";
import { useSettings, type AppSettings } from "@/lib/settings/SettingsContext";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { API_BASE, getToken, ApiError, authApi, clearSession } from "@/lib/api/client";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────
type Section = "appearance" | "accessibility" | "language" | "profile" | "account" | "about";

const SIDEBAR: { id: Section; emoji: string; label: string; labelUr: string }[] = [
  { id: "appearance",   emoji: "🎨", label: "Appearance",   labelUr: "ظاہری شکل" },
  { id: "accessibility",emoji: "♿", label: "Accessibility", labelUr: "رسائی" },
  { id: "language",     emoji: "🌐", label: "Language",      labelUr: "زبان" },
  { id: "profile",      emoji: "👤", label: "Profile",       labelUr: "پروفائل" },
  { id: "account",      emoji: "🔒", label: "Account",       labelUr: "اکاؤنٹ" },
  { id: "about",        emoji: "ℹ️", label: "About",         labelUr: "معلومات" },
];

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch" aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${checked ? "bg-violet-600" : "bg-glacier-200"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

// ── Row (label + control) ─────────────────────────────────────────────────────
function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-glacier-100 last:border-0">
      <div>
        <div className="text-sm font-bold text-deep">{label}</div>
        {sub && <div className="text-xs text-deep-soft mt-0.5">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ emoji, title, color }: { emoji: string; title: string; color: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl bg-gradient-to-r ${color} px-5 py-4 mb-5 text-white shadow-md`}>
      <span className="text-2xl">{emoji}</span>
      <h2 className="font-display text-lg font-extrabold">{title}</h2>
    </div>
  );
}

// ── Font size pill selector ───────────────────────────────────────────────────
function FontPicker({ value, onChange }: { value: AppSettings["fontSize"]; onChange: (v: AppSettings["fontSize"]) => void }) {
  const opts: { v: AppSettings["fontSize"]; label: string }[] = [
    { v: "normal", label: "A" },
    { v: "large",  label: "A" },
    { v: "xl",     label: "A" },
  ];
  const sizes = ["text-sm", "text-base", "text-lg"];
  return (
    <div className="flex gap-2">
      {opts.map((o, i) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`flex h-10 w-10 items-center justify-center rounded-xl border font-bold transition-all ${sizes[i]} ${value === o.v ? "bg-violet-600 border-violet-600 text-white shadow" : "border-glacier-200 text-deep-soft hover:bg-glacier-50"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Appearance section ────────────────────────────────────────────────────────
function AppearanceSection() {
  const { settings, updateSetting } = useSettings();
  const { locale } = useLocale();
  const isUr = locale === "ur";
  return (
    <div>
      <SectionHeader emoji="🎨" title={isUr ? "ظاہری شکل" : "Appearance"} color="from-violet-500 to-purple-600" />
      <div className="rounded-2xl bg-white/80 border border-glacier-100 px-5 divide-y divide-glacier-50">
        <Row label={isUr ? "حروف کا سائز" : "Font Size"} sub={isUr ? "پڑھنا آسان بنائیں" : "Make text easier to read"}>
          <FontPicker value={settings.fontSize} onChange={v => updateSetting("fontSize", v)} />
        </Row>
        <Row label={isUr ? "حرکات کم کریں" : "Reduce Animations"} sub={isUr ? "حساسیت کے لیے" : "Better for sensory sensitivity"}>
          <Toggle checked={settings.reduceMotion} onChange={v => updateSetting("reduceMotion", v)} />
        </Row>
      </div>
      <p className="mt-3 text-xs text-deep-muted px-1">
        {isUr ? "بڑے حروف اور کم حرکات آٹسٹک طلباء کے لیے بہت مفید ہیں۔" : "Larger text and fewer animations are especially helpful for autistic learners."}
      </p>
    </div>
  );
}

// ── Accessibility section ─────────────────────────────────────────────────────
function AccessibilitySection() {
  const { settings, updateSetting } = useSettings();
  const { locale } = useLocale();
  const isUr = locale === "ur";
  return (
    <div>
      <SectionHeader emoji="♿" title={isUr ? "رسائی" : "Accessibility"} color="from-emerald-500 to-teal-600" />
      <div className="rounded-2xl bg-white/80 border border-glacier-100 px-5 divide-y divide-glacier-50">
        <Row label={isUr ? "زیادہ کانٹراسٹ" : "High Contrast"} sub={isUr ? "رنگ زیادہ واضح ہوں گے" : "Makes colours easier to distinguish"}>
          <Toggle checked={settings.highContrast} onChange={v => updateSetting("highContrast", v)} />
        </Row>
        <Row label={isUr ? "فوکس موڈ" : "Focus Mode"} sub={isUr ? "سجاوٹ چھپائیں، صرف مواد دکھائیں" : "Hides decorative elements, shows only content"}>
          <Toggle checked={settings.focusMode} onChange={v => updateSetting("focusMode", v)} />
        </Row>
        <Row label={isUr ? "خود بخود پڑھنا" : "Auto Read Aloud"} sub={isUr ? "ٹیوٹر کے جواب پڑھے جائیں" : "AI tutor responses read automatically"}>
          <Toggle checked={settings.ttsAutoRead} onChange={v => updateSetting("ttsAutoRead", v)} />
        </Row>
      </div>
      <div className="mt-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-700">
        {isUr
          ? "🧠 یہ سیٹنگز خاص طور پر آٹزم اسپیکٹرم کے طلباء کو سیکھنے میں مدد دیتی ہیں۔"
          : "🧠 These settings are specifically designed to support students on the autism spectrum."}
      </div>
    </div>
  );
}

// ── Language section ──────────────────────────────────────────────────────────
function LanguageSection() {
  const { locale, setLocale } = useLocale();
  const isUr = locale === "ur";
  return (
    <div>
      <SectionHeader emoji="🌐" title={isUr ? "زبان" : "Language"} color="from-sky-500 to-cyan-600" />
      <div className="rounded-2xl bg-white/80 border border-glacier-100 px-5 py-5">
        <p className="text-sm text-deep-soft mb-4">{isUr ? "انٹرفیس کی زبان منتخب کریں:" : "Choose the interface language:"}</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { code: "en" as const, label: "English", sub: "Left to right", flag: "🇬🇧" },
            { code: "ur" as const, label: "اردو",    sub: "دائیں سے بائیں", flag: "🇵🇰" },
          ].map(lang => (
            <button key={lang.code} onClick={() => setLocale(lang.code)}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${locale === lang.code ? "border-sky-500 bg-sky-50 shadow" : "border-glacier-100 bg-white/60 hover:bg-glacier-50"}`}
            >
              <span className="text-3xl">{lang.flag}</span>
              <span className={`font-bold text-sm ${locale === lang.code ? "text-sky-700" : "text-deep"}`}>{lang.label}</span>
              <span className="text-xs text-deep-muted">{lang.sub}</span>
              {locale === lang.code && <Check size={14} className="text-sky-600" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Not-logged-in placeholder ─────────────────────────────────────────────────
function NotLoggedIn({ isUr }: { isUr: boolean }) {
  const { closeSettings } = useSettings();
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-5 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-glacier-100 to-glacier-200 text-5xl">
        🔑
      </div>
      <div>
        <h3 className="font-display text-lg font-extrabold text-deep">
          {isUr ? "لاگ ان نہیں ہوئے" : "You're not logged in"}
        </h3>
        <p className="text-sm text-deep-soft mt-1 max-w-[220px] mx-auto leading-relaxed">
          {isUr
            ? "یہ معلومات دیکھنے کے لیے پہلے اپنے اکاؤنٹ میں لاگ ان کریں۔"
            : "Please sign in to your account to view this section."}
        </p>
      </div>
      <div className="flex gap-3">
        <a href="/login" onClick={closeSettings}
          className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-2.5 text-sm font-bold text-white hover:shadow-md transition-all">
          {isUr ? "لاگ ان" : "Log in"}
        </a>
        <a href="/signup" onClick={closeSettings}
          className="rounded-xl border border-glacier-200 bg-white px-5 py-2.5 text-sm font-bold text-deep-soft hover:bg-glacier-50 transition-all">
          {isUr ? "اکاؤنٹ بنائیں" : "Sign up"}
        </a>
      </div>
    </div>
  );
}

// ── Profile section ───────────────────────────────────────────────────────────
function ProfileSection() {
  const { user, isAuthenticated } = useAuth();
  const { locale } = useLocale();
  const isUr = locale === "ur";

  return (
    <div>
      <SectionHeader emoji="👤" title={isUr ? "پروفائل" : "Profile"} color="from-amber-500 to-orange-500" />
      {!isAuthenticated ? (
        <NotLoggedIn isUr={isUr} />
      ) : (
        <>
          <div className="rounded-2xl bg-white/80 border border-glacier-100 px-5 divide-y divide-glacier-50">
            <Row label={isUr ? "نام" : "Name"}>
              <span className="text-sm font-bold text-deep">{user?.name ?? "—"}</span>
            </Row>
            <Row label={isUr ? "ای میل" : "Email"}>
              <span className="text-sm text-deep-soft truncate max-w-[160px]">{user?.email ?? "—"}</span>
            </Row>
            <Row label={isUr ? "گریڈ" : "Grade"}>
              <span className="rounded-xl bg-violet-100 text-violet-700 font-bold text-sm px-3 py-1">{isUr ? "گریڈ" : "Grade"} {user?.grade ?? "—"}</span>
            </Row>
            <Row label={isUr ? "ستارے" : "Stars"}>
              <span className="text-amber-500 font-bold text-sm">⭐ {user?.stars ?? 0}</span>
            </Row>
            {user?.family_code && (
              <Row
                label={isUr ? "فیملی کوڈ" : "Family code"}
                sub={isUr ? "والدین کو یہ کوڈ دیں" : "Share with your parent for linking"}
              >
                <span className="font-mono text-lg font-extrabold text-violet-700 tracking-widest">
                  {user.family_code}
                </span>
              </Row>
            )}
          </div>
          {user?.family_code && (
            <div className="mt-3 rounded-2xl bg-violet-50 border border-violet-200 px-4 py-3 text-xs text-violet-800 leading-relaxed">
              {isUr
                ? "یہ 6 ہندسوں کا کوڈ آپ کے والدین Parent Sign Up پر داخل کریں گے — آپ کا نام، CNIC، اور ان کا نام/CNIC میل کھانا ضروری ہے۔"
                : "Your parent enters this 6-digit code on Parent Sign Up, along with your name, your CNIC, and their name/CNIC (must match what you entered)."}
            </div>
          )}
          <p className="mt-3 text-xs text-deep-muted px-1">
            {isUr ? "نام یا گریڈ تبدیل کرنے کے لیے ادارے سے رابطہ کریں۔" : "To change your name or grade, contact your school administrator."}
          </p>
        </>
      )}
    </div>
  );
}

// ── Account section ───────────────────────────────────────────────────────────
function AccountSection() {
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const { locale } = useLocale();
  const isUr = locale === "ur";
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [status, setStatus] = useState<"idle"|"loading"|"ok"|"err">("idle");
  const [msg, setMsg]       = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<"idle"|"loading"|"err">("idle");
  const [deleteMsg, setDeleteMsg] = useState("");

  const rules = [
    { ok: next.length >= 8,                                    text: isUr ? "کم از کم 8 حروف" : "At least 8 characters" },
    { ok: /[A-Z]/.test(next),                                  text: isUr ? "ایک بڑا حرف" : "One uppercase letter" },
    { ok: /[a-z]/.test(next),                                  text: isUr ? "ایک چھوٹا حرف" : "One lowercase letter" },
    { ok: /[0-9]/.test(next),                                  text: isUr ? "ایک نمبر" : "One number" },
    { ok: /[^A-Za-z0-9]/.test(next),                          text: isUr ? "ایک خاص نشان" : "One special character" },
    { ok: next.length > 0 && next === confirm,                 text: isUr ? "پاس ورڈ میل کھائے" : "Passwords match" },
  ];

  const allRulesOk = rules.every(r => r.ok);

  const submit = async () => {
    if (!allRulesOk || !current) return;
    setStatus("loading");
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/users/me/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new ApiError(res.status, d?.detail ?? (isUr ? "خرابی ہوئی" : "Error"));
      }
      setStatus("ok"); setMsg(isUr ? "پاس ورڈ کامیابی سے تبدیل ہو گیا!" : "Password changed successfully!");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) {
      setStatus("err"); setMsg(e instanceof ApiError ? e.detail : (isUr ? "سرور سے رابطہ نہیں ہوا" : "Could not reach server"));
    }
  };

  const deleteAccount = async () => {
    if (!deletePassword || !deleteConfirm) return;
    setDeleteStatus("loading");
    setDeleteMsg("");
    try {
      await authApi.deleteAccount({ password: deletePassword });
      sessionStorage.removeItem("autistudy_show_family_code");
      clearSession();
      await logout().catch(() => undefined);
      router.push("/");
    } catch (e) {
      setDeleteStatus("err");
      setDeleteMsg(e instanceof ApiError ? e.detail : (isUr ? "اکاؤنٹ حذف نہیں ہو سکا" : "Could not delete account"));
    }
  };

  if (!isAuthenticated) {
    return (
      <div>
        <SectionHeader emoji="🔒" title={isUr ? "اکاؤنٹ" : "Account"} color="from-rose-500 to-pink-600" />
        <NotLoggedIn isUr={isUr} />
      </div>
    );
  }

  return (
    <div>
      <SectionHeader emoji="🔒" title={isUr ? "اکاؤنٹ" : "Account"} color="from-rose-500 to-pink-600" />
      <div className="rounded-2xl bg-white/80 border border-glacier-100 p-5 space-y-4">
        <h3 className="font-bold text-deep text-sm">{isUr ? "پاس ورڈ تبدیل کریں" : "Change Password"}</h3>

        {/* Current password */}
        <div className="relative">
          <label className="block text-xs text-deep-soft mb-1">{isUr ? "موجودہ پاس ورڈ" : "Current password"}</label>
          <input type={showCurrent ? "text" : "password"} value={current} onChange={e => setCurrent(e.target.value)}
            className="w-full rounded-xl border border-glacier-200 px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
            placeholder="••••••••" />
          <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-[34px] text-deep-muted hover:text-deep">
            {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {/* New password */}
        <div className="relative">
          <label className="block text-xs text-deep-soft mb-1">{isUr ? "نیا پاس ورڈ" : "New password"}</label>
          <input type={showNext ? "text" : "password"} value={next} onChange={e => setNext(e.target.value)}
            className="w-full rounded-xl border border-glacier-200 px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
            placeholder="••••••••" />
          <button type="button" onClick={() => setShowNext(v => !v)} className="absolute right-3 top-[34px] text-deep-muted hover:text-deep">
            {showNext ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {/* Confirm */}
        <div className="relative">
          <label className="block text-xs text-deep-soft mb-1">{isUr ? "پاس ورڈ دوبارہ لکھیں" : "Confirm new password"}</label>
          <input type={showConfirm ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)}
            className="w-full rounded-xl border border-glacier-200 px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
            placeholder="••••••••" />
          <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-[34px] text-deep-muted hover:text-deep">
            {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {/* Rules */}
        {next.length > 0 && (
          <div className="grid grid-cols-2 gap-1">
            {rules.map((r, i) => (
              <div key={i} className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-emerald-600" : "text-deep-muted"}`}>
                <span>{r.ok ? "✓" : "○"}</span>{r.text}
              </div>
            ))}
          </div>
        )}

        {/* Status */}
        {status === "ok" && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-700">{msg}</div>}
        {status === "err" && <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">{msg}</div>}

        <button onClick={submit} disabled={!allRulesOk || !current || status === "loading"}
          className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 py-2.5 text-sm font-bold text-white disabled:opacity-40 hover:shadow-md transition-all"
        >
          {status === "loading" ? (isUr ? "تبدیل ہو رہا ہے…" : "Changing…") : (isUr ? "پاس ورڈ تبدیل کریں" : "Update Password")}
        </button>
      </div>

      <div className="mt-6 rounded-2xl bg-rose-50/80 border border-rose-200 p-5 space-y-4">
        <h3 className="font-bold text-rose-800 text-sm">{isUr ? "اکاؤنٹ حذف کریں" : "Delete Account"}</h3>
        <p className="text-xs text-rose-700 leading-relaxed">
          {isUr
            ? "یہ آپ کا پروفائل، چیٹس، کوئز، اور والدین لنک مستقل طور پر حذف کر دے گا۔ حذف کے بعد آپ اسی CNIC سے دوبارہ رجسٹر کر سکتے ہیں۔"
            : "This permanently deletes your profile, chats, quizzes, and parent link. After deletion, you can register again with the same CNIC."}
        </p>
        <div className="relative">
          <label className="block text-xs text-rose-800 mb-1">{isUr ? "پاس ورڈ تصدیق" : "Confirm with password"}</label>
          <input
            type={showDeletePassword ? "text" : "password"}
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            className="w-full rounded-xl border border-rose-200 px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 bg-white"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowDeletePassword(v => !v)}
            className="absolute right-3 top-[34px] text-rose-400 hover:text-rose-700"
          >
            {showDeletePassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <label className="flex items-start gap-2 text-xs text-rose-800 cursor-pointer">
          <input
            type="checkbox"
            checked={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.checked)}
            className="mt-0.5"
          />
          <span>{isUr ? "مجھے علم ہے کہ یہ واپس نہیں ہو سکتا" : "I understand this cannot be undone"}</span>
        </label>
        {deleteStatus === "err" && (
          <div className="rounded-xl bg-white border border-rose-200 px-4 py-2 text-sm text-rose-700">{deleteMsg}</div>
        )}
        <button
          onClick={deleteAccount}
          disabled={!deletePassword || !deleteConfirm || deleteStatus === "loading"}
          className="w-full rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white disabled:opacity-40 hover:bg-rose-700 transition-all"
        >
          {deleteStatus === "loading" ? (isUr ? "حذف ہو رہا ہے…" : "Deleting…") : (isUr ? "میرا اکاؤنٹ حذف کریں" : "Delete My Account")}
        </button>
      </div>
    </div>
  );
}

// ── About section ─────────────────────────────────────────────────────────────
function AboutSection() {
  const { locale } = useLocale();
  const isUr = locale === "ur";
  return (
    <div>
      <SectionHeader emoji="ℹ️" title={isUr ? "معلومات" : "About AutiStudy"} color="from-indigo-500 to-violet-600" />
      <div className="space-y-3">
        {[
          { emoji: "🧠", title: isUr ? "ہمارا مقصد" : "Our Mission", body: isUr ? "AutiStudy ہر ذہن کے لیے بنایا گیا ہے — ایک صبر کرنے والا AI ٹیوٹر جو آپ کی رفتار سے سیکھاتا ہے۔" : "AutiStudy is built for every mind — a patient AI tutor that teaches at your pace, your way." },
          { emoji: "📚", title: isUr ? "نصاب" : "Curriculum", body: isUr ? "گریڈ 4 تا 7 · پاکستانی قومی نصاب · ریاضی · سائنس · کمپیوٹر · جنرل سائنس" : "Grade 4 to 7 · Pakistan National Curriculum · Maths · Science · Computer · General Science" },
          { emoji: "🔒", title: isUr ? "رازداری" : "Privacy", body: isUr ? "آپ کا ڈیٹا محفوظ ہے۔ CNIC صرف والدین-بچے کے اکاؤنٹ لنک کرنے کے لیے استعمال ہوتا ہے۔" : "Your data is safe. CNIC details are used only to link parent and student accounts." },
          { emoji: "⚙️", title: isUr ? "ورژن" : "Version", body: "AutiStudy v2.0 · 2026" },
        ].map(item => (
          <div key={item.title} className="rounded-2xl bg-white/80 border border-glacier-100 px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <span>{item.emoji}</span>
              <span className="font-bold text-deep text-sm">{item.title}</span>
            </div>
            <p className="text-xs text-deep-soft leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
const SECTION_CONTENT: Record<Section, React.FC> = {
  appearance:    AppearanceSection,
  accessibility: AccessibilitySection,
  language:      LanguageSection,
  profile:       ProfileSection,
  account:       AccountSection,
  about:         AboutSection,
};

export function SettingsModal() {
  const { isOpen, closeSettings } = useSettings();
  const { locale } = useLocale();
  const isUr = locale === "ur";
  const [active, setActive] = useState<Section>("appearance");

  useBodyScrollLock(isOpen);

  const Content = SECTION_CONTENT[active];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-deep/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) closeSettings(); }}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full max-w-2xl max-h-[min(88vh,900px)] min-h-0 rounded-3xl bg-white/95 shadow-2xl flex flex-col overflow-hidden border border-glacier-100"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-glacier-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white text-lg">⚙️</div>
                <h1 className="font-display text-xl font-extrabold text-deep">{isUr ? "ترتیبات" : "Settings"}</h1>
              </div>
              <button onClick={closeSettings}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-glacier-50 border border-glacier-200 text-deep-soft hover:text-deep hover:bg-white transition-all">
                <X size={18} />
              </button>
            </div>

            {/* Body: sidebar + content — min-h-0 lets inner overflow-y-auto scroll */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Sidebar */}
              <nav className="w-44 flex-shrink-0 min-h-0 border-r border-glacier-100 py-3 overflow-y-auto overscroll-y-contain modal-scroll bg-glacier-50/50">
                {SIDEBAR.map(item => (
                  <button key={item.id} onClick={() => setActive(item.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-bold transition-all rounded-r-xl mr-2 ${active === item.id ? "bg-white text-violet-700 shadow-sm border-l-2 border-violet-500" : "text-deep-soft hover:text-deep hover:bg-white/60"}`}
                  >
                    <span className="text-base">{item.emoji}</span>
                    <span className="truncate">{isUr ? item.labelUr : item.label}</span>
                    {active === item.id && <ChevronRight size={12} className="ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </nav>

              {/* Content — scrollable; extra bottom padding so buttons are not clipped */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain modal-scroll px-6 py-5 pb-10 bg-gradient-to-br from-violet-50/30 via-white to-purple-50/30">
                <AnimatePresence mode="wait">
                  <motion.div key={active}
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.18 }}
                  >
                    <Content />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
