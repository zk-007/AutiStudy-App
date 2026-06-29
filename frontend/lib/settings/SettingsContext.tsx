"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

export interface AppSettings {
  fontSize:       "normal" | "large" | "xl";
  reduceMotion:   boolean;
  highContrast:   boolean;
  focusMode:      boolean;
  ttsAutoRead:    boolean;
}

const DEFAULTS: AppSettings = {
  fontSize:     "normal",
  reduceMotion: false,
  highContrast: false,
  focusMode:    false,
  ttsAutoRead:  false,
};

function settingsKey(email: string | null | undefined): string {
  if (!email) return "autistudy_settings_guest";
  return `autistudy_settings_${email.toLowerCase()}`;
}

function loadSettings(email: string | null | undefined): AppSettings {
  try {
    const saved = localStorage.getItem(settingsKey(email));
    if (saved) {
      return { ...DEFAULTS, ...JSON.parse(saved) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

interface SettingsContextValue {
  settings:       AppSettings;
  updateSetting:  <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  isOpen:         boolean;
  openSettings:   () => void;
  closeSettings:  () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function applyClasses(s: AppSettings) {
  const html = document.documentElement;

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

  // Load per-user settings when auth resolves or account changes
  useEffect(() => {
    if (isLoading) return;
    const loaded = loadSettings(user?.email);
    setSettings(loaded);
    applyClasses(loaded);
  }, [user?.email, isLoading]);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(settingsKey(user?.email), JSON.stringify(next));
      } catch { /* ignore */ }
      applyClasses(next);
      return next;
    });
  }, [user?.email]);

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSetting,
      isOpen,
      openSettings:  () => setIsOpen(true),
      closeSettings: () => setIsOpen(false),
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
