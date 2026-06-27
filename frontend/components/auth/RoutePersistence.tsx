"use client";

/**
 * Saves the current URL while the student is logged in so a later login
 * (if the session expires) can return them to the same page.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { saveReturnUrl } from "@/lib/auth/redirect";

export function RoutePersistence() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") return;
    const path = window.location.pathname + window.location.search;
    saveReturnUrl(path);
  }, [pathname, isAuthenticated]);

  return null;
}
