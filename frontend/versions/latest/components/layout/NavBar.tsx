"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DancingButton } from "@/components/primitives/DancingButton";
import { Globe, LogOut, Trophy, BarChart3, Settings } from "lucide-react";
import { useSettings } from "@/lib/settings/SettingsContext";
import clsx from "clsx";

export function NavBar() {
  const { t, locale, setLocale, isRTL } = useLocale();
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const { openSettings } = useSettings();
  const pathname = usePathname();
  const router = useRouter();
  // Only delay the navbar on the landing page (waiting for the intro to finish).
  // All other routes show it immediately. Hero phase begins at ~4.8s, so we
  // reveal the navbar a touch after that with a soft fade-in.
  const entranceDelay = pathname === "/" ? 5.0 : 0;

  const onLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <motion.nav
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: entranceDelay, ease: "easeOut" }}
      className="fixed top-0 left-0 right-0 z-40 px-6 py-4 md:px-10"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between rounded-full glass-strong px-5 py-2.5 shadow-soft">
        <button
          type="button"
          onClick={() => {
            // Hard-navigate so the intro choreography replays in BOTH locales,
            // even when we're already on "/" (Next would otherwise no-op).
            window.location.assign("/");
          }}
          className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-glacier-400"
          aria-label={t.brand}
        >
          <span className="font-display text-xl font-extrabold text-deep tracking-tight">
            {t.brand}
          </span>
        </button>

        <div className={clsx("flex items-center gap-1 md:gap-2", isRTL && "flex-row-reverse")}>
          <NavLink href="/about">{t.nav.about}</NavLink>
          <NavLink href="/faq">{t.nav.faq}</NavLink>

          <button
            onClick={() => setLocale(locale === "en" ? "ur" : "en")}
            className="hidden md:inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-deep-soft hover:bg-glacier-100 transition-colors"
            aria-label="Toggle language"
          >
            <Globe size={16} />
            {locale === "en" ? "اردو" : "EN"}
          </button>

          {/* Settings — icon + label for clarity (especially for autistic users) */}
          <button
            onClick={openSettings}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-deep-soft hover:bg-violet-50 hover:text-violet-600 border border-transparent hover:border-violet-200 transition-all"
            aria-label="Settings"
          >
            <Settings size={16} />
            <span className="hidden sm:inline">{locale === "ur" ? "ترتیبات" : "Settings"}</span>
          </button>

          {/* While we're restoring the session on first paint, show nothing
              auth-related so we don't flash login/signup buttons for already
              logged-in users. */}
          {!isLoading && (
            isAuthenticated ? (
              <>
                <Link href="/dashboard" className="hidden sm:block">
                  <DancingButton variant="ghost" className="!px-5 !py-2 !text-sm">
                    {t.nav.dashboard}
                  </DancingButton>
                </Link>
                <Link
                  href="/quiz"
                  className="hidden md:inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-deep-soft hover:bg-glacier-100 hover:text-deep transition-colors"
                  title="Quiz"
                >
                  <Trophy size={16} />
                  <span>Quiz</span>
                </Link>
                <Link
                  href="/analytics"
                  className="hidden md:inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-deep-soft hover:bg-glacier-100 hover:text-deep transition-colors"
                  title="My Progress"
                >
                  <BarChart3 size={16} />
                  <span>Progress</span>
                </Link>
                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-1.5 rounded-full bg-glacier-100 hover:bg-glacier-200 px-4 py-2 text-sm font-bold text-deep transition-colors"
                  aria-label={t.auth.logout}
                  title={user?.name ? `${t.auth.logout} (${user.name})` : t.auth.logout}
                >
                  <LogOut size={15} />
                  <span className="hidden md:inline">{t.auth.logout}</span>
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="hidden sm:block">
                  <DancingButton variant="ghost" className="!px-5 !py-2 !text-sm">
                    {t.nav.login}
                  </DancingButton>
                </Link>
                <Link href="/signup">
                  <DancingButton variant="primary" className="!px-5 !py-2 !text-sm">
                    {t.nav.signup}
                  </DancingButton>
                </Link>
              </>
            )
          )}
        </div>
      </div>
    </motion.nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="hidden md:inline-flex rounded-full px-4 py-2 text-sm font-semibold text-deep-soft hover:bg-glacier-100 hover:text-deep transition-colors"
    >
      {children}
    </Link>
  );
}
