"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBodyScrollLock, useModalWheelScroll } from "@/lib/hooks/useBodyScrollLock";
import {
  X, Palette, Accessibility, Globe, User, Lock, Info,
  ChevronRight, Check, Eye, EyeOff, Play, Loader2, GraduationCap, Mail,
} from "lucide-react";
import {
  useSettings,
  type AppSettings,
  type SettingsSectionId,
  type TtsVoice,
} from "@/lib/settings/SettingsContext";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useParentSession } from "@/lib/auth/useParentSession";
import {
  API_BASE, getToken, ApiError, authApi, clearSession, chatApi, userApi,
  parentApi, setParentToken,
} from "@/lib/api/client";
import { useRouter } from "next/navigation";
import { AvatarDisplay } from "@/components/avatar/AvatarDisplay";
import { AvatarPicker } from "@/components/avatar/AvatarPicker";
import { FamilyLinkPanel } from "@/components/dashboard/FamilyLinkPanel";

// ── Types ─────────────────────────────────────────────────────────────────────
type Section = SettingsSectionId;

const SIDEBAR: { id: Section; emoji: string; label: string; labelUr: string }[] = [
  { id: "appearance",   emoji: "🎨", label: "Appearance",   labelUr: "ظاہری شکل" },
  { id: "accessibility",emoji: "♿", label: "Accessibility", labelUr: "رسائی" },
  { id: "voice",        emoji: "🔊", label: "Voice",         labelUr: "آواز" },
  { id: "language",     emoji: "🌐", label: "Language",      labelUr: "زبان" },
  { id: "profile",      emoji: "👤", label: "Profile",       labelUr: "پروفائل" },
  { id: "family",       emoji: "👨‍👩‍👧", label: "Family",       labelUr: "خاندان" },
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

function ThemePicker({
  value,
  onChange,
  isUr,
}: {
  value: AppSettings["theme"];
  onChange: (v: AppSettings["theme"]) => void;
  isUr: boolean;
}) {
  const opts: { v: AppSettings["theme"]; label: string; emoji: string; hint: string }[] = [
    {
      v: "light",
      label: isUr ? "روشن" : "Light",
      emoji: "☀️",
      hint: isUr ? "ہلکے نیلے پس منظر" : "Soft icy blues",
    },
    {
      v: "dark",
      label: isUr ? "ڈارک" : "Dark",
      emoji: "🌙",
      hint: isUr ? "کالا · نیلا · سبز · سرمئی" : "Black · blue · green · grey",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
              active
                ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 dark:border-violet-400 shadow-sm"
                : "border-glacier-200 hover:border-glacier-300 hover:bg-glacier-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>{o.emoji}</span>
              <span className={`text-sm font-bold ${active ? "text-violet-700 dark:text-violet-300" : "text-deep"}`}>
                {o.label}
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-deep-muted">{o.hint}</p>
          </button>
        );
      })}
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
      <div className="mb-3 rounded-2xl bg-white/80 border border-glacier-100 px-5 py-4">
        <div className="text-sm font-bold text-deep mb-0.5">{isUr ? "تھیم" : "Theme"}</div>
        <div className="text-xs text-deep-soft mb-3">
          {isUr ? "لائٹ یا ڈارک موڈ منتخب کریں" : "Choose light or dark mode"}
        </div>
        <ThemePicker
          value={settings.theme}
          onChange={(v) => updateSetting("theme", v)}
          isUr={isUr}
        />
      </div>
      <div className="rounded-2xl bg-white/80 border border-glacier-100 px-5 divide-y divide-glacier-50">
        <Row label={isUr ? "حروف کا سائز" : "Font Size"} sub={isUr ? "پڑھنا آسان بنائیں" : "Make text easier to read"}>
          <FontPicker value={settings.fontSize} onChange={v => updateSetting("fontSize", v)} />
        </Row>
        <Row label={isUr ? "حرکات کم کریں" : "Reduce Animations"} sub={isUr ? "حساسیت کے لیے" : "Better for sensory sensitivity"}>
          <Toggle checked={settings.reduceMotion} onChange={v => updateSetting("reduceMotion", v)} />
        </Row>
      </div>
      <p className="mt-3 text-xs text-deep-muted px-1">
        {isUr
          ? "ڈارک موڈ کم روشنی والے ماحول کے لیے نرم سیاہ، نیلا، سبز اور سرمئی رنگ استعمال کرتا ہے۔"
          : "Dark mode uses calm black, blue, green and grey tones — easier on the eyes in low light."}
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
      <SectionHeader emoji="♿" title={isUr ? "رسائی" : "Accessibility"} color="from-mint-300 to-glacier-600" />
      <div className="rounded-2xl bg-white/80 border border-glacier-100 px-5 divide-y divide-glacier-50">
        <Row label={isUr ? "زیادہ کانٹراسٹ" : "High Contrast"} sub={isUr ? "رنگ زیادہ واضح ہوں گے" : "Makes colours easier to distinguish"}>
          <Toggle checked={settings.highContrast} onChange={v => updateSetting("highContrast", v)} />
        </Row>
        <Row label={isUr ? "فوکس موڈ" : "Focus Mode"} sub={isUr ? "سجاوٹ چھپائیں، صرف مواد دکھائیں" : "Hides decorative elements, shows only content"}>
          <Toggle checked={settings.focusMode} onChange={v => updateSetting("focusMode", v)} />
        </Row>
        <Row label={isUr ? "خود بخود پڑھنا" : "Auto Read Aloud"} sub={isUr ? "صرف جب آن بording میں 'خودکار' منتخب ہو" : "Only when your profile preference is set to automatic"}>
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

// ── Voice / Narration section (Part B #8) ─────────────────────────────────────
const NARRATORS: { id: TtsVoice; label: string; labelUr: string }[] = [
  { id: "alloy",   label: "Alloy — warm & neutral",    labelUr: "Alloy — گرم اور غیرجانبدار" },
  { id: "echo",    label: "Echo — calm & steady",       labelUr: "Echo — پرسکون اور مستحکم" },
  { id: "fable",   label: "Fable — gentle & expressive",labelUr: "Fable — نرم اور تاثراتی" },
  { id: "onyx",    label: "Onyx — deep & confident",    labelUr: "Onyx — گہری اور پُراعتماد" },
  { id: "nova",    label: "Nova — bright & friendly",   labelUr: "Nova — روشن اور دوستانہ" },
  { id: "shimmer", label: "Shimmer — soft & cheerful",  labelUr: "Shimmer — نرم اور خوش" },
];

function VoiceSection() {
  const { settings, updateSetting } = useSettings();
  const { locale } = useLocale();
  const { isAuthenticated } = useAuth();
  const isUr = locale === "ur";
  const [previewing, setPreviewing] = useState<TtsVoice | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const previewVoice = async (voice: TtsVoice) => {
    if (previewing) return;
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewError(null);

    if (!isAuthenticated || !getToken()) {
      setPreviewError(
        isUr
          ? "آواز سننے کے لیے پہلے لاگ اِن کریں۔"
          : "Please log in to preview voices.",
      );
      return;
    }

    setPreviewing(voice);
    try {
      // Latin sample for Urdu avoids TTS quirks with mixed Urdu/English glyphs.
      const sample = isUr
        ? "Assalam o alaikum! Main aapka AutiStudy tutor hoon."
        : "Hello! I'm your AutiStudy tutor.";
      const res = await chatApi.speak(sample, isUr ? "ur" : "en", voice);
      if (!res?.audio_base64) {
        throw new Error("empty_audio");
      }
      const audio = new Audio(`data:${res.mime_type};base64,${res.audio_base64}`);
      // Avoid silent "success" when volume slider is at 0.
      audio.volume = Math.max(0.05, Math.min(1, settings.voiceVolume));
      audio.playbackRate = settings.voiceSpeed;
      previewAudioRef.current = audio;
      audio.onended = () => {
        previewAudioRef.current = null;
        setPreviewing(null);
      };
      audio.onerror = () => {
        previewAudioRef.current = null;
        setPreviewing(null);
        setPreviewError(
          isUr ? "آواز چلانے میں مسئلہ ہوا۔" : "Could not play this voice sample.",
        );
      };
      await audio.play();
    } catch (err: unknown) {
      setPreviewing(null);
      if (err instanceof ApiError && err.status === 401) {
        setPreviewError(
          isUr
            ? "سیشن ختم ہو گیا — دوبارہ لاگ اِن کریں۔"
            : "Session expired — please log in again.",
        );
      } else if (err instanceof ApiError && err.status === 503) {
        setPreviewError(
          isUr
            ? "Read-aloud ابھی دستیاب نہیں (API key چیک کریں)۔"
            : "Read-aloud is unavailable right now (check API key).",
        );
      } else {
        setPreviewError(
          isUr
            ? "آواز لوڈ نہیں ہو سکی۔ انٹرنیٹ چیک کریں۔"
            : "Could not load voice. Check your connection.",
        );
      }
    }
  };

  return (
    <div>
      <SectionHeader emoji="🔊" title={isUr ? "آواز اور Narration" : "Voice & Narration"} color="from-cyan-500 to-blue-600" />

      <div className="rounded-2xl bg-white/80 border border-glacier-100 p-5 mb-4">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-bold text-deep">{isUr ? "پڑھنے کی رفتار" : "Speed"}</span>
            <span className="text-xs font-mono text-deep-soft">{settings.voiceSpeed.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min={0.75}
            max={1.5}
            step={0.05}
            value={settings.voiceSpeed}
            onChange={(e) => updateSetting("voiceSpeed", parseFloat(e.target.value))}
            className="w-full accent-violet-600"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-bold text-deep">{isUr ? "والیوم" : "Volume"}</span>
            <span className="text-xs font-mono text-deep-soft">{Math.round(settings.voiceVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.voiceVolume}
            onChange={(e) => updateSetting("voiceVolume", parseFloat(e.target.value))}
            className="w-full accent-violet-600"
          />
        </div>
      </div>

      <p className="text-sm font-bold text-deep-soft mb-2 px-1">
        {isUr ? "Narrator منتخب کریں" : "Choose a narrator"}
      </p>
      <div className="rounded-2xl bg-white/80 border border-glacier-100 divide-y divide-glacier-50">
        {NARRATORS.map((n) => {
          const selected = settings.voiceNarrator === n.id;
          const isPreviewing = previewing === n.id;
          return (
            <div key={n.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => updateSetting("voiceNarrator", n.id)}
                className="flex items-center gap-2.5 flex-1 text-left"
              >
                <span
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? "border-violet-600 bg-violet-600" : "border-glacier-300"
                  }`}
                >
                  {selected && <Check size={12} className="text-white" />}
                </span>
                <span className={`text-sm ${selected ? "font-bold text-deep" : "text-deep-soft"}`}>
                  {isUr ? n.labelUr : n.label}
                </span>
              </button>
              <button
                type="button"
                onClick={() => previewVoice(n.id)}
                disabled={!!previewing}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-glacier-100 text-deep-soft hover:bg-violet-100 hover:text-violet-700 transition-colors disabled:opacity-50"
                aria-label={isUr ? "نمونہ سنیں" : "Preview voice"}
              >
                {isPreviewing ? <Loader2 size={14} className="animate-spin" /> : <Play size={12} />}
              </button>
            </div>
          );
        })}
      </div>
      {previewError && (
        <p className="mt-3 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
          {previewError}
        </p>
      )}
      <p className="mt-3 text-xs text-deep-muted px-1">
        {isUr
          ? "یہ ترتیبات ہر جگہ لاگو ہوتی ہیں جہاں آپ کا ٹیوٹر بلند آواز میں پڑھتا ہے۔ Preview کے لیے لاگ اِن ضروری ہے۔"
          : "These settings apply everywhere your tutor reads answers aloud. Login is required to preview."}
      </p>
    </div>
  );
}

// ── Language section ──────────────────────────────────────────────────────────
function LanguageSection() {
  const { locale, setLocale } = useLocale();
  const isUr = locale === "ur";
  return (
    <div>
      <SectionHeader emoji="🌐" title={isUr ? "زبان" : "Language"} color="from-glacier-600 to-deep" />
      <div className="rounded-2xl bg-white/80 border border-glacier-100 px-5 py-5">
        <p className="text-sm text-deep-soft mb-4">{isUr ? "انٹرفیس کی زبان منتخب کریں:" : "Choose the interface language:"}</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { code: "en" as const, label: "English", sub: "Left to right", flag: "🇬🇧" },
            { code: "ur" as const, label: "اردو",    sub: "دائیں سے بائیں", flag: "🇵🇰" },
          ].map(lang => (
            <button key={lang.code} onClick={() => setLocale(lang.code)}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${locale === lang.code ? "border-glacier-500 bg-glacier-50 shadow" : "border-glacier-100 bg-white/60 hover:bg-glacier-50"}`}
            >
              <span className="text-3xl">{lang.flag}</span>
              <span className={`font-bold text-sm ${locale === lang.code ? "text-glacier-700" : "text-deep"}`}>{lang.label}</span>
              <span className="text-xs text-deep-muted">{lang.sub}</span>
              {locale === lang.code && <Check size={14} className="text-glacier-600" />}
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
  const { user, isAuthenticated, refresh } = useAuth();
  const { parent, isParentAuthenticated, loading: parentLoading } = useParentSession();
  const { locale } = useLocale();
  const isUr = locale === "ur";
  const [pickerOpen, setPickerOpen] = useState(false);

  if (parentLoading && !isAuthenticated) {
    return (
      <div>
        <SectionHeader emoji="👤" title={isUr ? "پروفائل" : "Profile"} color="from-amber-500 to-orange-500" />
        <p className="text-sm text-deep-muted px-1">{isUr ? "لوڈ ہو رہا ہے…" : "Loading…"}</p>
      </div>
    );
  }

  // Parent session (separate from student AuthProvider)
  if (isParentAuthenticated && parent && !isAuthenticated) {
    const linkLabel =
      parent.link_status === "linked"
        ? (isUr ? "منسلک" : "Linked")
        : parent.link_status === "pending"
          ? (isUr ? "منظوری کا انتظار" : "Waiting for approval")
          : (isUr ? "ابھی منسلک نہیں" : "Not linked yet");
    return (
      <div>
        <SectionHeader emoji="👤" title={isUr ? "پروفائل" : "Profile"} color="from-glacier-600 to-deep" />
        <div className="rounded-2xl bg-white/80 border border-glacier-100 p-5 mb-3">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-glacier-100 to-glacier-200 text-3xl">
              👨‍👩‍👧
            </div>
            <div>
              <div className="text-sm font-bold text-deep">{parent.name}</div>
              <div className="mt-1 inline-flex rounded-full bg-glacier-50 border border-glacier-200 px-2.5 py-0.5 text-[11px] font-bold text-glacier-700">
                {isUr ? "والدین اکاؤنٹ" : "Parent account"}
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white/80 border border-glacier-100 px-5 divide-y divide-glacier-50">
          <Row label={isUr ? "نام" : "Name"}>
            <span className="text-sm font-bold text-deep">{parent.name}</span>
          </Row>
          <Row label={isUr ? "ای میل" : "Email"}>
            <span className="text-sm text-deep-soft truncate max-w-[160px]">{parent.email}</span>
          </Row>
          <Row label={isUr ? "رشتہ" : "Relationship"}>
            <span className="text-sm font-bold text-glacier-700">
              {parent.relationship === "mother"
                ? (isUr ? "والدہ" : "Mother")
                : (isUr ? "والد" : "Father")}
            </span>
          </Row>
          <Row label={isUr ? "لنک کی حالت" : "Link status"}>
            <span className="text-sm font-bold text-glacier-700">{linkLabel}</span>
          </Row>
          {(parent.children?.length || parent.child_email) && (
            <Row label={isUr ? "منسلک بچے" : "Linked children"}>
              <span className="text-sm text-deep-soft text-right max-w-[180px]">
                {(parent.children?.length
                  ? parent.children.map((c) => c.email).join(", ")
                  : parent.child_email) || "—"}
              </span>
            </Row>
          )}
        </div>
        <p className="mt-3 text-xs text-deep-muted px-1">
          {isUr
            ? "بچے کی پیش رفت Parent Dashboard پر دیکھیں۔ Family لنک Settings → Family سے بھی دیکھ سکتے ہیں۔"
            : "Track your child’s progress on the Parent Dashboard. Family link details are also under Settings → Family."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader emoji="👤" title={isUr ? "پروفائل" : "Profile"} color="from-amber-500 to-orange-500" />
      {!isAuthenticated ? (
        <NotLoggedIn isUr={isUr} />
      ) : (
        <>
          <div className="rounded-2xl bg-white/80 border border-glacier-100 p-5 mb-3">
            <div className="flex items-center gap-4">
              <AvatarDisplay avatarId={user?.avatar} name={user?.name ?? "?"} size={64} />
              <div className="flex-1">
                <div className="text-sm font-bold text-deep">{user?.name ?? "—"}</div>
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="mt-1.5 rounded-xl bg-glacier-50 border border-glacier-200 px-3 py-1.5 text-xs font-bold text-glacier-700 hover:bg-glacier-100 transition-all"
                >
                  {pickerOpen
                    ? (isUr ? "بند کریں" : "Close")
                    : (isUr ? "اپنا Avatar بدلیں" : "Change your avatar")}
                </button>
              </div>
            </div>
            {pickerOpen && (
              <div className="mt-4 pt-4 border-t border-glacier-100">
                <AvatarPicker
                  currentAvatar={user?.avatar}
                  onSaved={() => {
                    void refresh();
                    setPickerOpen(false);
                  }}
                  labelPick={isUr ? "اپنا پسندیدہ avatar چنیں — کبھی بھی بدل سکتے ہیں۔" : "Pick your favourite avatar — change it anytime."}
                  labelSaving={isUr ? "محفوظ ہو رہا ہے…" : "Saving…"}
                  labelError={isUr ? "Avatar محفوظ نہیں ہو سکا" : "Could not save avatar"}
                />
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-white/80 border border-glacier-100 px-5 divide-y divide-glacier-50">
            <Row label={isUr ? "نام" : "Name"}>
              <span className="text-sm font-bold text-deep">{user?.name ?? "—"}</span>
            </Row>
            <Row label={isUr ? "ای میل" : "Email"}>
              <span className="text-sm text-deep-soft truncate max-w-[160px]">{user?.email ?? "—"}</span>
            </Row>
            <Row label={isUr ? "گریڈ" : "Grade"}>
              <span className="rounded-xl bg-glacier-100 text-glacier-700 font-bold text-sm px-3 py-1">{isUr ? "گریڈ" : "Grade"} {user?.grade ?? "—"}</span>
            </Row>
            <Row label={isUr ? "ستارے" : "Stars"}>
              <span className="text-amber-500 font-bold text-sm">⭐ {user?.stars ?? 0}</span>
            </Row>
          </div>
          <div className="mt-3 rounded-2xl bg-glacier-50 border border-glacier-200 px-4 py-3 text-xs text-deep leading-relaxed">
            {isUr
              ? "والدین کو جوڑنے یا درخواست منظور کرنے کے لیے Settings → Family کھولیں۔ منظوری کا لنک آپ کی ای میل پر بھی آتا ہے۔"
              : "To invite a parent or Approve a link request, open Settings → Family. Approval links are also sent to your email."}
          </div>
          <p className="mt-3 text-xs text-deep-muted px-1">
            {isUr ? "نام تبدیل کرنے کے لیے ادارے سے رابطہ کریں۔ گریڈ Settings → Account سے بدل سکتے ہیں۔" : "To change your name, contact your school. You can change grade from Settings → Account."}
          </p>
        </>
      )}
    </div>
  );
}

// ── Parent account (password change + delete) ─────────────────────────────────
function ParentAccountPanel({
  isUr,
  email,
  onLogout,
}: {
  isUr: boolean;
  email: string;
  onLogout: () => void;
}) {
  const router = useRouter();
  const { closeSettings } = useSettings();
  const { refresh: refreshParent } = useParentSession();
  const [currentEmail, setCurrentEmail] = useState(email);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "loading" | "err">("idle");
  const [deleteMsg, setDeleteMsg] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailStep, setEmailStep] = useState<"form" | "otp">("form");
  const [emailDevOtp, setEmailDevOtp] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [emailMsg, setEmailMsg] = useState("");

  useEffect(() => {
    setCurrentEmail(email);
  }, [email]);

  const requestParentEmailChange = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !emailPassword) return;
    setEmailStatus("loading");
    setEmailMsg("");
    try {
      const res = await parentApi.requestEmailChange(trimmed, emailPassword);
      setNewEmail(res.email || trimmed);
      setEmailDevOtp(res.dev_mode ? (res.dev_otp ?? null) : null);
      setEmailStep("otp");
      setEmailOtp("");
      setEmailStatus("idle");
      setEmailMsg(res.detail);
    } catch (e) {
      setEmailStatus("err");
      setEmailMsg(e instanceof ApiError ? e.detail : (isUr ? "سرور سے رابطہ نہیں ہوا" : "Could not reach server"));
    }
  };

  const verifyParentEmailChange = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || emailOtp.trim().length !== 6) return;
    setEmailStatus("loading");
    setEmailMsg("");
    try {
      const res = await parentApi.verifyEmailChange(trimmed, emailOtp.trim());
      setCurrentEmail(res.user.email);
      await refreshParent();
      setEmailStatus("ok");
      setEmailMsg(res.detail);
      setNewEmail("");
      setEmailPassword("");
      setEmailOtp("");
      setEmailStep("form");
      setEmailDevOtp(null);
      if (res.needs_relink) {
        closeSettings();
        router.push("/parent/dashboard");
      }
    } catch (e) {
      setEmailStatus("err");
      setEmailMsg(e instanceof ApiError ? e.detail : (isUr ? "سرور سے رابطہ نہیں ہوا" : "Could not reach server"));
    }
  };

  const rules = [
    { ok: next.length >= 8, text: isUr ? "کم از کم 8 حروف" : "At least 8 characters" },
    { ok: /[A-Z]/.test(next), text: isUr ? "ایک بڑا حرف" : "One uppercase letter" },
    { ok: /[a-z]/.test(next), text: isUr ? "ایک چھوٹا حرف" : "One lowercase letter" },
    { ok: /[0-9]/.test(next), text: isUr ? "ایک نمبر" : "One number" },
    { ok: /[^A-Za-z0-9]/.test(next), text: isUr ? "ایک خاص نشان" : "One special character" },
    { ok: next.length > 0 && next === confirm, text: isUr ? "پاس ورڈ میل کھائے" : "Passwords match" },
  ];
  const allRulesOk = rules.every((r) => r.ok);

  const submitPassword = async () => {
    if (!allRulesOk || !current) return;
    setStatus("loading");
    setMsg("");
    try {
      await parentApi.changePassword(current, next);
      setStatus("ok");
      setMsg(isUr ? "پاس ورڈ کامیابی سے تبدیل ہو گیا!" : "Password changed successfully!");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setStatus("err");
      setMsg(e instanceof ApiError ? e.detail : (isUr ? "سرور سے رابطہ نہیں ہوا" : "Could not reach server"));
    }
  };

  const deleteAccount = async () => {
    if (!deletePassword || !deleteConfirm) return;
    setDeleteStatus("loading");
    setDeleteMsg("");
    try {
      await parentApi.deleteAccount(deletePassword);
      setParentToken(null);
      closeSettings();
      router.push("/");
    } catch (e) {
      setDeleteStatus("err");
      setDeleteMsg(
        e instanceof ApiError
          ? e.detail
          : (isUr ? "اکاؤنٹ حذف نہیں ہو سکا" : "Could not delete account"),
      );
    }
  };

  return (
    <div>
      <SectionHeader emoji="🔒" title={isUr ? "اکاؤنٹ" : "Account"} color="from-glacier-600 to-deep" />
      <div className="rounded-2xl bg-white/80 border border-glacier-100 px-5 divide-y divide-glacier-50 mb-4">
        <Row label={isUr ? "اکاؤنٹ کی قسم" : "Account type"}>
          <span className="text-sm font-bold text-glacier-700">{isUr ? "والدین" : "Parent"}</span>
        </Row>
        <Row label={isUr ? "ای میل" : "Email"}>
          <span className="text-sm text-deep-soft truncate max-w-[160px]">{currentEmail}</span>
        </Row>
      </div>

      <div className="rounded-2xl bg-white/80 border border-glacier-100 p-5 space-y-3 mb-4">
        <h3 className="flex items-center gap-2 font-bold text-deep text-sm">
          <Mail size={16} className="text-glacier-600" />
          {isUr ? "ای میل تبدیل کریں" : "Change Email"}
        </h3>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          {isUr
            ? "نیا ای میل OTP سے تصدیق ہوگا۔ تبدیلی کے بعد بچے کا لنک ختم ہو جائے گا — دوبارہ Family Invitation Code درکار ہوگا۔"
            : "We'll verify your new email with OTP. After the change, your child link is cleared — you'll need a new Family Invitation Code."}
        </p>
        {emailStep === "form" ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void requestParentEmailChange();
            }}
          >
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={isUr ? "نیا ای میل" : "New email"}
              required
              className="w-full rounded-xl border border-glacier-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-glacier-200"
            />
            <div className="relative">
              <input
                type={showEmailPassword ? "text" : "password"}
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder={isUr ? "موجودہ پاس ورڈ" : "Current password"}
                required
                className="w-full rounded-xl border border-glacier-200 px-3 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-glacier-200"
              />
              <button type="button" onClick={() => setShowEmailPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-deep-muted">
                {showEmailPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {emailStatus === "err" && <p className="text-xs text-rose-700">{emailMsg}</p>}
            {emailStatus === "ok" && <p className="text-xs text-emerald-700">{emailMsg}</p>}
            <button
              type="submit"
              disabled={emailStatus === "loading"}
              className="w-full rounded-xl bg-glacier-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {emailStatus === "loading" ? (isUr ? "بھیجا جا رہا…" : "Sending…") : (isUr ? "کوڈ بھیجیں" : "Send verification code")}
            </button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void verifyParentEmailChange();
            }}
          >
            <p className="text-xs text-deep-soft">
              {isUr ? "کوڈ:" : "Code sent to:"} <span className="font-bold">{newEmail}</span>
            </p>
            {emailDevOtp && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                Dev: <span className="font-mono font-extrabold tracking-widest">{emailDevOtp}</span>
              </p>
            )}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={emailOtp}
              onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              required
              className="w-full rounded-xl border border-glacier-200 px-3 py-3 text-center text-xl font-mono tracking-[0.35em] outline-none focus:ring-2 focus:ring-glacier-200"
            />
            {emailStatus === "err" && <p className="text-xs text-rose-700">{emailMsg}</p>}
            <button
              type="submit"
              disabled={emailOtp.length !== 6 || emailStatus === "loading"}
              className="w-full rounded-xl bg-glacier-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {emailStatus === "loading" ? (isUr ? "تصدیق…" : "Verifying…") : (isUr ? "تصدیق اور اپڈیٹ" : "Verify & update")}
            </button>
            <button
              type="button"
              onClick={() => {
                setEmailStep("form");
                setEmailOtp("");
                setEmailStatus("idle");
              }}
              className="w-full text-xs font-bold text-deep-muted"
            >
              {isUr ? "واپس" : "Back"}
            </button>
          </form>
        )}
      </div>

      <div className="rounded-2xl bg-white/80 border border-glacier-100 p-5 space-y-3 mb-4">
        <h3 className="flex items-center gap-2 font-bold text-deep text-sm">
          <Lock size={16} className="text-glacier-600" />
          {isUr ? "پاس ورڈ تبدیل کریں" : "Change Password"}
        </h3>
        <label className="block">
          <span className="block text-xs text-deep-soft mb-1">{isUr ? "موجودہ پاس ورڈ" : "Current password"}</span>
          <div className="relative">
            <input
              type={showCurrent ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full rounded-xl border border-glacier-200 bg-white px-3 py-2.5 text-sm pr-10 outline-none focus:ring-2 focus:ring-glacier-200"
            />
            <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-deep-muted">
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <label className="block">
          <span className="block text-xs text-deep-soft mb-1">{isUr ? "نیا پاس ورڈ" : "New password"}</span>
          <div className="relative">
            <input
              type={showNext ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full rounded-xl border border-glacier-200 bg-white px-3 py-2.5 text-sm pr-10 outline-none focus:ring-2 focus:ring-glacier-200"
            />
            <button type="button" onClick={() => setShowNext((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-deep-muted">
              {showNext ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <label className="block">
          <span className="block text-xs text-deep-soft mb-1">{isUr ? "پاس ورڈ دوبارہ لکھیں" : "Confirm new password"}</span>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-glacier-200 bg-white px-3 py-2.5 text-sm pr-10 outline-none focus:ring-2 focus:ring-glacier-200"
            />
            <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-deep-muted">
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <ul className="space-y-1">
          {rules.map((r) => (
            <li key={r.text} className={`text-xs ${r.ok ? "text-emerald-600" : "text-deep-muted"}`}>
              {r.ok ? "✓" : "○"} {r.text}
            </li>
          ))}
        </ul>
        {msg && (
          <p className={`text-xs ${status === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{msg}</p>
        )}
        <button
          type="button"
          disabled={!allRulesOk || !current || status === "loading"}
          onClick={() => void submitPassword()}
          className="w-full rounded-xl bg-glacier-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {status === "loading" ? (isUr ? "محفوظ…" : "Saving…") : (isUr ? "پاس ورڈ محفوظ کریں" : "Save password")}
        </button>
      </div>

      <div className="rounded-2xl bg-rose-50/80 border border-rose-200 p-5 space-y-3 mb-4">
        <h3 className="font-bold text-rose-800 text-sm">{isUr ? "اکاؤنٹ حذف کریں" : "Delete account"}</h3>
        <p className="text-xs text-rose-700/90 leading-relaxed">
          {isUr
            ? "یہ عمل مستقل ہے۔ بچے کا لنک ختم ہو جائے گا اور والدین اکاؤنٹ مٹ جائے گا۔"
            : "This is permanent. Your child link will be cleared and the parent account removed."}
        </p>
        <label className="block">
          <span className="block text-xs text-rose-800 mb-1">{isUr ? "پاس ورڈ تصدیق" : "Confirm with password"}</span>
          <div className="relative">
            <input
              type={showDeletePassword ? "text" : "password"}
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm pr-10 outline-none focus:ring-2 focus:ring-rose-200"
            />
            <button type="button" onClick={() => setShowDeletePassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-400">
              {showDeletePassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <label className="flex items-start gap-2 text-xs text-rose-800 cursor-pointer">
          <input
            type="checkbox"
            checked={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.checked)}
            className="mt-0.5"
          />
          {isUr ? "میں سمجھتا/سمجھتی ہوں — اکاؤنٹ مستقل حذف ہوگا۔" : "I understand — permanently delete this account."}
        </label>
        {deleteMsg && <p className="text-xs text-rose-700">{deleteMsg}</p>}
        <button
          type="button"
          disabled={!deletePassword || !deleteConfirm || deleteStatus === "loading"}
          onClick={() => void deleteAccount()}
          className="w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {deleteStatus === "loading" ? (isUr ? "حذف…" : "Deleting…") : (isUr ? "اکاؤنٹ حذف کریں" : "Delete account")}
        </button>
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="w-full rounded-2xl border border-glacier-200 bg-white px-4 py-3 text-sm font-bold text-deep-soft hover:bg-glacier-50 transition-all"
      >
        {isUr ? "لاگ آؤٹ" : "Log out"}
      </button>
    </div>
  );
}

// ── Account section ───────────────────────────────────────────────────────────
function AccountSection() {
  const { isAuthenticated, logout, user, refresh } = useAuth();
  const { parent, isParentAuthenticated, loading: parentLoading } = useParentSession();
  const { closeSettings } = useSettings();
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

  // Change email (OTP to new inbox)
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailStep, setEmailStep] = useState<"form" | "otp">("form");
  const [emailDevOtp, setEmailDevOtp] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<"idle"|"loading"|"ok"|"err">("idle");
  const [emailMsg, setEmailMsg] = useState("");

  const requestEmailChange = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !emailPassword) return;
    setEmailStatus("loading");
    setEmailMsg("");
    try {
      const res = await userApi.requestEmailChange(trimmed, emailPassword);
      setNewEmail(res.email || trimmed);
      setEmailDevOtp(res.dev_mode ? (res.dev_otp ?? null) : null);
      setEmailStep("otp");
      setEmailOtp("");
      setEmailStatus("idle");
      setEmailMsg(res.detail || (isUr ? "نیا ای میل چیک کریں۔" : "Check your new email for the code."));
    } catch (e) {
      setEmailStatus("err");
      setEmailMsg(e instanceof ApiError ? e.detail : (isUr ? "سرور سے رابطہ نہیں ہوا" : "Could not reach server"));
    }
  };

  const verifyEmailChange = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || emailOtp.trim().length !== 6) return;
    setEmailStatus("loading");
    setEmailMsg("");
    try {
      const res = await userApi.verifyEmailChange(trimmed, emailOtp.trim());
      await refresh();
      setEmailStatus("ok");
      setEmailMsg(res.detail || (isUr ? "ای میل تصدیق اور اپڈیٹ ہو گئی!" : "Email verified and updated!"));
      setNewEmail("");
      setEmailPassword("");
      setEmailOtp("");
      setEmailStep("form");
      setEmailDevOtp(null);
    } catch (e) {
      setEmailStatus("err");
      setEmailMsg(e instanceof ApiError ? e.detail : (isUr ? "سرور سے رابطہ نہیں ہوا" : "Could not reach server"));
    }
  };

  // Change grade
  const [grade, setGrade] = useState(user?.grade ?? 4);
  const [gradeStatus, setGradeStatus] = useState<"idle"|"loading"|"ok"|"err">("idle");

  useEffect(() => {
    if (user?.grade != null) setGrade(user.grade);
  }, [user?.grade]);

  const submitGrade = async (newGrade: number) => {
    if (newGrade === grade && gradeStatus === "ok") return;
    setGrade(newGrade);
    setGradeStatus("loading");
    try {
      await userApi.changeGrade(newGrade);
      await refresh();
      setGradeStatus("ok");
    } catch {
      setGradeStatus("err");
      if (user?.grade != null) setGrade(user.grade);
    }
  };

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

  const parentLogout = async () => {
    try {
      await parentApi.logout();
    } catch { /* ignore */ }
    setParentToken(null);
    closeSettings();
    router.push("/");
  };

  if (parentLoading && !isAuthenticated) {
    return (
      <div>
        <SectionHeader emoji="🔒" title={isUr ? "اکاؤنٹ" : "Account"} color="from-rose-500 to-pink-600" />
        <p className="text-sm text-deep-muted px-1">{isUr ? "لوڈ ہو رہا ہے…" : "Loading…"}</p>
      </div>
    );
  }

  if (isParentAuthenticated && parent && !isAuthenticated) {
    return (
      <ParentAccountPanel
        isUr={isUr}
        email={parent.email}
        onLogout={() => void parentLogout()}
      />
    );
  }

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

      {/* Change grade — students can update class anytime */}
      <div className="rounded-2xl bg-glacier-50/70 border border-glacier-200 p-5 space-y-3 mb-4">
        <h3 className="flex items-center gap-2 font-bold text-deep text-sm">
          <GraduationCap size={16} className="text-glacier-700" />
          {isUr ? "گریڈ تبدیل کریں" : "Change Grade"}
        </h3>
        <p className="text-xs text-deep-soft -mt-1">
          {isUr
            ? "اپنی کلاس منتخب کریں (4–7)۔ مضامین اسی کے مطابق اپڈیٹ ہوں گے۔"
            : "Pick your class (grades 4–7). Your subjects update to match."}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {[4, 5, 6, 7].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => submitGrade(g)}
              disabled={gradeStatus === "loading"}
              className={`rounded-xl py-2.5 text-sm font-bold border-2 transition-all disabled:opacity-60 ${
                grade === g
                  ? "border-sky-600 bg-glacier-600 text-white shadow-soft"
                  : "border-glacier-200 bg-white text-deep-soft hover:bg-white"
              }`}
            >
              {isUr ? "گریڈ" : "Grade"} {g}
            </button>
          ))}
        </div>
        {gradeStatus === "loading" && (
          <p className="text-xs text-glacier-700">{isUr ? "اپڈیٹ ہو رہا ہے…" : "Updating…"}</p>
        )}
        {gradeStatus === "ok" && (
          <p className="text-xs text-emerald-700">{isUr ? "گریڈ اپڈیٹ ہو گیا۔" : "Grade updated."}</p>
        )}
        {gradeStatus === "err" && (
          <p className="text-xs text-rose-700">{isUr ? "گریڈ تبدیل نہیں ہو سکا۔" : "Could not update grade."}</p>
        )}
      </div>

      {/* Change email — OTP on new inbox */}
      <div className="rounded-2xl bg-white/80 border border-glacier-100 p-5 space-y-4 mb-4">
        <h3 className="flex items-center gap-2 font-bold text-deep text-sm">
          <Mail size={16} className="text-glacier-600" />
          {isUr ? "ای میل تبدیل کریں" : "Change Email"}
        </h3>
        <p className="text-xs text-deep-muted -mt-2">
          {isUr ? "موجودہ ای میل:" : "Current email:"}{" "}
          <span className="font-semibold text-deep-soft">{user?.email}</span>
        </p>
        <p className="text-xs text-glacier-700 bg-glacier-50 border border-sky-100 rounded-xl px-3 py-2">
          {isUr
            ? "نیا ای میل تبدیل کرنے سے پہلے OTP سے تصدیق ضروری ہے۔"
            : "We'll send a verification code to your new email before updating."}
        </p>

        {emailStep === "form" ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void requestEmailChange();
            }}
          >
            <div>
              <label className="block text-xs text-deep-soft mb-1">{isUr ? "نیا ای میل" : "New email address"}</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-xl border border-glacier-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
                placeholder="new@email.com"
                required
              />
            </div>
            <div className="relative">
              <label className="block text-xs text-deep-soft mb-1">{isUr ? "پاس ورڈ سے تصدیق کریں" : "Confirm with password"}</label>
              <input
                type={showEmailPassword ? "text" : "password"}
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                className="w-full rounded-xl border border-glacier-200 px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
                placeholder="••••••••"
                required
              />
              <button type="button" onClick={() => setShowEmailPassword((v) => !v)} className="absolute right-3 top-[34px] text-deep-muted hover:text-deep">
                {showEmailPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {emailStatus === "err" && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">{emailMsg}</div>
            )}
            {emailStatus === "ok" && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-700">{emailMsg}</div>
            )}
            <button
              type="submit"
              disabled={!newEmail.trim() || !emailPassword || emailStatus === "loading"}
              className="w-full rounded-xl bg-glacier-600 py-2.5 text-sm font-bold text-white disabled:opacity-40 hover:bg-sky-700 transition-all"
            >
              {emailStatus === "loading"
                ? (isUr ? "کوڈ بھیجا جا رہا ہے…" : "Sending code…")
                : (isUr ? "کوڈ بھیجیں" : "Send verification code")}
            </button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void verifyEmailChange();
            }}
          >
            <p className="text-xs text-deep-soft">
              {isUr ? "کوڈ بھیجا گیا:" : "Code sent to:"}{" "}
              <span className="font-bold text-deep">{newEmail}</span>
            </p>
            {emailDevOtp && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                Dev mode code: <span className="font-mono font-extrabold tracking-widest">{emailDevOtp}</span>
              </div>
            )}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={emailOtp}
              onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              className="w-full rounded-xl border border-glacier-200 px-4 py-3 text-center text-xl font-mono tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-sky-300"
              required
            />
            {emailMsg && emailStatus !== "err" && (
              <p className="text-xs text-deep-soft">{emailMsg}</p>
            )}
            {emailStatus === "err" && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">{emailMsg}</div>
            )}
            <button
              type="submit"
              disabled={emailOtp.length !== 6 || emailStatus === "loading"}
              className="w-full rounded-xl bg-glacier-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {emailStatus === "loading"
                ? (isUr ? "تصدیق…" : "Verifying…")
                : (isUr ? "تصدیق کریں اور اپڈیٹ" : "Verify & update")}
            </button>
            <button
              type="button"
              onClick={() => {
                setEmailStep("form");
                setEmailOtp("");
                setEmailStatus("idle");
                setEmailMsg("");
              }}
              className="w-full text-xs font-bold text-deep-muted hover:text-deep"
            >
              {isUr ? "واپس" : "Back"}
            </button>
          </form>
        )}
      </div>

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
            ? "یہ آپ کا پروفائل، چیٹس، کوئز، اور والدین لنک مستقل طور پر حذف کر دے گا۔ حذف کے بعد آپ اسی B-Form نمبر سے دوبارہ رجسٹر کر سکتے ہیں۔"
            : "This permanently deletes your profile, chats, quizzes, and parent link. After deletion, you can register again with the same B-Form number."}
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
          { emoji: "🔒", title: isUr ? "رازداری" : "Privacy", body: isUr ? "آپ کا ڈیٹا محفوظ ہے۔ B-Form/CNIC صرف والدین-بچے کے اکاؤنٹ لنک کرنے کے لیے استعمال ہوتا ہے۔" : "Your data is safe. B-Form/CNIC details are used only to link parent and student accounts." },
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

function FamilySection() {
  const { locale } = useLocale();
  const { isAuthenticated } = useAuth();
  const { parent, isParentAuthenticated, loading: parentLoading } = useParentSession();
  const isUr = locale === "ur";

  if (parentLoading && !isAuthenticated) {
    return (
      <div>
        <SectionHeader emoji="👨‍👩‍👧" title={isUr ? "خاندان" : "Family"} color="from-glacier-600 to-deep" />
        <p className="text-sm text-deep-muted px-1">{isUr ? "لوڈ ہو رہا ہے…" : "Loading…"}</p>
      </div>
    );
  }

  if (isParentAuthenticated && parent && !isAuthenticated) {
    const kids = parent.children?.length
      ? parent.children
      : parent.child_email
        ? [{ email: parent.child_email, relationship: parent.relationship }]
        : [];
    const status =
      parent.link_status ||
      (kids.length ? "linked" : parent.pending_child_email ? "pending" : "none");
    const relLabel =
      parent.relationship === "mother"
        ? (isUr ? "والدہ" : "Mother")
        : (isUr ? "والد" : "Father");
    return (
      <div>
        <SectionHeader emoji="👨‍👩‍👧" title={isUr ? "خاندان" : "Family"} color="from-glacier-600 to-deep" />
        <p className="mb-4 text-xs text-deep-soft leading-relaxed px-1">
          {isUr
            ? "والدین اکاؤنٹ — ایک سے زیادہ بچے لنک کر سکتے ہیں۔ ہر بچے کے لیے صرف ایک والد اور ایک والدہ۔"
            : "Parent account — you can link multiple children. Each child allows one Father and one Mother."}
        </p>
        <div className="rounded-2xl border border-glacier-100 bg-white/90 p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-deep-soft">{isUr ? "آپ کا رول" : "Your role"}</span>
            <span className="font-bold text-deep">{relLabel}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-deep-soft">{isUr ? "حالت" : "Status"}</span>
            <span className="font-bold text-deep">
              {status === "linked"
                ? (isUr ? "منسلک" : "Linked")
                : status === "pending"
                  ? (isUr ? "منظوری کا انتظار" : "Waiting for approval")
                  : (isUr ? "کوئی لنک نہیں" : "No link yet")}
            </span>
          </div>
          {kids.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-deep-soft uppercase tracking-wide">
                {isUr ? "منسلک بچے" : "Linked children"}
              </p>
              {kids.map((c) => (
                <div
                  key={c.email}
                  className="rounded-xl bg-glacier-50 border border-sky-100 px-3 py-2 text-sm"
                >
                  <p className="font-bold text-deep truncate">{c.email}</p>
                  <p className="text-xs text-glacier-700">
                    {c.relationship === "mother"
                      ? (isUr ? "والدہ" : "Mother")
                      : (isUr ? "والد" : "Father")}
                  </p>
                </div>
              ))}
            </div>
          )}
          {status === "pending" && parent.pending_child_email && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
              {isUr
                ? `منظوری کا انتظار: ${parent.pending_child_email} — انہیں ای میل میں Approve لنک بھیجا گیا ہے۔`
                : `Waiting on ${parent.pending_child_email} — they got an Approve link by email.`}
            </div>
          )}
          <a
            href="/parent/dashboard"
            className="inline-flex w-full items-center justify-center rounded-full bg-glacier-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700"
          >
            {kids.length
              ? (isUr ? "Parent Dashboard کھولیں" : "Open Parent Dashboard")
              : (isUr ? "کوڈ درج کرنے جائیں" : "Enter invitation code")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader emoji="👨‍👩‍👧" title={isUr ? "خاندان" : "Family"} color="from-glacier-600 to-deep" />
      {!isAuthenticated ? (
        <NotLoggedIn isUr={isUr} />
      ) : (
        <>
          <p className="mb-4 text-xs text-deep-soft leading-relaxed px-1">
            {isUr
              ? "یہاں سے والدین کو مدعو کریں (زیادہ سے زیادہ ایک والد اور ایک والدہ)۔ جب وہ کوڈ درج کریں گے تو منظوری کا لنک آپ کی ای میل پر آئے گا।"
              : "Invite parents here (maximum one Father and one Mother). When they enter your code, an Approve link is emailed to your inbox."}
          </p>
          <FamilyLinkPanel isUr={isUr} embedded />
        </>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
const SECTION_CONTENT: Record<Section, React.FC> = {
  appearance:    AppearanceSection,
  accessibility: AccessibilitySection,
  voice:         VoiceSection,
  language:      LanguageSection,
  profile:       ProfileSection,
  family:        FamilySection,
  account:       AccountSection,
  about:         AboutSection,
};

export function SettingsModal() {
  const { isOpen, closeSettings, focusSection, clearFocusSection } = useSettings();
  const { locale } = useLocale();
  const isUr = locale === "ur";
  const [active, setActive] = useState<Section>("appearance");
  const modalRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(isOpen);
  useModalWheelScroll(isOpen, modalRef);

  useEffect(() => {
    if (isOpen && focusSection) {
      setActive(focusSection);
      clearFocusSection();
    }
  }, [isOpen, focusSection, clearFocusSection]);

  const Content = SECTION_CONTENT[active] ?? AppearanceSection;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-deep/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) closeSettings(); }}
        >
          <motion.div
            ref={modalRef}
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full max-w-2xl max-h-[88vh] rounded-3xl bg-white/95 shadow-2xl flex flex-col overflow-hidden border border-glacier-100"
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

            {/* Body: sidebar + content */}
            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar */}
              <nav className="w-44 flex-shrink-0 min-h-0 border-r border-glacier-100 py-3 overflow-x-hidden overflow-y-auto overscroll-y-contain modal-scroll bg-glacier-50/50">
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

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain modal-scroll px-6 py-5 bg-gradient-to-br from-violet-50/30 via-white to-purple-50/30">
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
