"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { profileApi } from "@/lib/api/client";

export type TtsVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export type ThemeMode = "light" | "dark";

export interface AppSettings {
  theme:          ThemeMode;
  fontSize:       "normal" | "large" | "xl";
  reduceMotion:   boolean;
  highContrast:   boolean;
  focusMode:      boolean;
  ttsAutoRead:    boolean;
  /** Part B #8 — Voice / Narration Controls. */
  voiceSpeed:     number;    // 0.75 – 1.5
  voiceVolume:    number;    // 0 – 1
  voiceNarrator:  TtsVoice;
}

const DEFAULTS: AppSettings = {
  theme:        "light",
  fontSize:     "normal",
  reduceMotion: false,
  highContrast: false,
  focusMode:    false,
  ttsAutoRead:  false,
  voiceSpeed:    1,
  voiceVolume:   1,
  voiceNarrator: "alloy",
};

/** Device-wide theme — survives login/logout (not wiped by per-user settings). */
const THEME_KEY = "autistudy_theme";
const GUEST_KEY = "autistudy_settings_guest";

function settingsKey(email: string | null | undefined): string {
  if (!email) return GUEST_KEY;
  return `autistudy_settings_${email.toLowerCase()}`;
}

function readJson(key: string): Partial<AppSettings> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readGlobalTheme(): ThemeMode | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "dark" || t === "light") return t;
  } catch { /* ignore */ }
  return null;
}

function persistGlobalTheme(theme: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, theme);
    // Keep guest blob in sync so older paths / boot script stay consistent.
    const guest = readJson(GUEST_KEY);
    localStorage.setItem(GUEST_KEY, JSON.stringify({ ...DEFAULTS, ...guest, theme }));
  } catch { /* ignore */ }
}

function loadSettings(email: string | null | undefined): AppSettings {
  const guest = readJson(GUEST_KEY);
  const globalTheme = readGlobalTheme();

  if (!email) {
    return {
      ...DEFAULTS,
      ...guest,
      theme: globalTheme ?? (guest.theme as ThemeMode) ?? DEFAULTS.theme,
    };
  }

  const user = readJson(settingsKey(email));
  const hasUserBlob = Object.keys(user).length > 0;

  if (!hasUserBlob) {
    // First login for this account — inherit guest prefs (incl. dark mode).
    const inherited: AppSettings = {
      ...DEFAULTS,
      ...guest,
      theme: globalTheme ?? (guest.theme as ThemeMode) ?? DEFAULTS.theme,
    };
    try {
      localStorage.setItem(settingsKey(email), JSON.stringify(inherited));
    } catch { /* ignore */ }
    return inherited;
  }

  // Prefer device theme, then saved user theme, then guest, then default.
  // Important: old user blobs predate `theme` and would otherwise snap back to light.
  const theme: ThemeMode =
    globalTheme ??
    (user.theme === "dark" || user.theme === "light" ? user.theme : null) ??
    (guest.theme === "dark" || guest.theme === "light" ? guest.theme : null) ??
    DEFAULTS.theme;

  return {
    ...DEFAULTS,
    ...guest,
    ...user,
    theme,
  };
}

export type SettingsSectionId =
  | "appearance"
  | "accessibility"
  | "voice"
  | "language"
  | "profile"
  | "family"
  | "account"
  | "about";

const SETTINGS_SECTIONS = new Set<string>([
  "appearance",
  "accessibility",
  "voice",
  "language",
  "profile",
  "family",
  "account",
  "about",
]);

function asSettingsSection(value: unknown): SettingsSectionId | null {
  return typeof value === "string" && SETTINGS_SECTIONS.has(value)
    ? (value as SettingsSectionId)
    : null;
}

interface SettingsContextValue {
  settings:       AppSettings;
  updateSetting:  <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  isOpen:         boolean;
  /** Optional section to focus when Settings opens (e.g. "family"). */
  focusSection:   SettingsSectionId | null;
  clearFocusSection: () => void;
  openSettings:   (section?: SettingsSectionId) => void;
  closeSettings:  () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function applyClasses(s: AppSettings) {
  const html = document.documentElement;

  // Theme (Light / Dark) — Tailwind `darkMode: "class"`
  html.classList.toggle("dark", s.theme === "dark");
  html.style.colorScheme = s.theme === "dark" ? "dark" : "light";

  // Font size
  html.classList.remove("font-large", "font-xl");
  if (s.fontSize === "large") html.classList.add("font-large");
  if (s.fontSize === "xl")    html.classList.add("font-xl");

  // Motion
  html.classList.toggle("reduce-motion", s.reduceMotion);

  // Contrast
  html.classList.toggle("high-contrast", s.highContrast);

  // Focus mode
  html.classList.toggle("focus-mode", s.focusMode);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [isOpen, setIsOpen] = useState(false);
  const [focusSection, setFocusSection] = useState<SettingsSectionId | null>(null);

  // Load per-user settings when auth resolves or account changes
  useEffect(() => {
    if (isLoading) return;
    const loaded = loadSettings(user?.email);
    setSettings(loaded);
    applyClasses(loaded);
    // Keep global theme key aligned with whatever we actually applied.
    persistGlobalTheme(loaded.theme);

    // Gap 6 — learner profile audio_preference is the source of truth for auto-read
    if (user?.email) {
      profileApi
        .get()
        .then((profile) => {
          const auto = profile.audio_preference === "auto";
          setSettings((prev) => {
            const next = { ...prev, ttsAutoRead: auto };
            try {
              localStorage.setItem(settingsKey(user?.email), JSON.stringify(next));
            } catch { /* ignore */ }
            return next;
          });
        })
        .catch(() => {});
    }
  }, [user?.email, isLoading]);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(settingsKey(user?.email), JSON.stringify(next));
      } catch { /* ignore */ }
      if (key === "theme") {
        persistGlobalTheme(value as ThemeMode);
      }
      applyClasses(next);
      return next;
    });

    if (key === "ttsAutoRead" && user?.email) {
      profileApi
        .updateAudioPreference(value ? "auto" : "manual")
        .catch(() => {});
    }
  }, [user?.email]);

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSetting,
      isOpen,
      focusSection,
      clearFocusSection: () => setFocusSection(null),
      openSettings: (section?: SettingsSectionId) => {
        // Guard: NavBar may pass onClick={openSettings}, which forwards a MouseEvent.
        const next = asSettingsSection(section);
        if (next) setFocusSection(next);
        setIsOpen(true);
      },
      closeSettings: () => {
        setIsOpen(false);
        setFocusSection(null);
      },
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be inside <SettingsProvider>");
  return ctx;
}
