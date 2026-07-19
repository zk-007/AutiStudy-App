"use client";

import dynamic from "next/dynamic";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { RoutePersistence } from "@/components/auth/RoutePersistence";
import { SettingsProvider } from "@/lib/settings/SettingsContext";
import { Aurora } from "@/components/primitives/Aurora";
import { SmoothScrollProvider } from "@/components/primitives/SmoothScrollProvider";

/** Loaded lazily — keeps the root layout chunk smaller for slow dev browsers. */
const SettingsModal = dynamic(
  () =>
    import("@/components/settings/SettingsModal").then((m) => ({
      default: m.SettingsModal,
    })),
  { ssr: false },
);

export function RootClientShell({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <AuthProvider>
        <SettingsProvider>
          <RoutePersistence />
          <SmoothScrollProvider>
            <Aurora />
            {children}
            <SettingsModal />
          </SmoothScrollProvider>
        </SettingsProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}
