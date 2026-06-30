"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { childLedApi } from "@/lib/api/client";

/**
 * Redirect authenticated students to the learning-style wizard when
 * preferences have not been saved yet (signup, login, or direct URL).
 */
export function useLearningOnboardingRedirect() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.email) {
      setReady(true);
      return;
    }

    let cancelled = false;
    childLedApi
      .getPreferences()
      .then((prefs) => {
        if (cancelled) return;
        if (!prefs.setup_complete) {
          const here =
            typeof window !== "undefined"
              ? window.location.pathname + window.location.search
              : "/dashboard";
          router.replace(
            `/onboarding/learning-style?next=${encodeURIComponent(here)}`,
          );
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.email, router]);

  return { ready };
}
