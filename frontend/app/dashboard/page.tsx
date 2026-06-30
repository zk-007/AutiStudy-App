"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Sparkles,
  Flame,
  Trophy,
  Target,
  ArrowRight,
  Clock,
  AlertCircle,
  Compass,
  PenLine,
  Star,
  BarChart3,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { loginUrlFor } from "@/lib/auth/redirect";
import {
  userApi,
  type Stats,
  type Subject,
  type RecentChat,
  type RecentQuiz,
  ApiError,
} from "@/lib/api/client";

export default function DashboardPage() {
  const { t, locale } = useLocale();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<Stats | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [recentChats, setRecentChats] = useState<RecentChat[] | null>(null);
  const [recentQuizzes, setRecentQuizzes] = useState<RecentQuiz[] | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  // ── Route guard: bounce to /login if not authenticated. We pass the
  //    current URL via `?next=` so the user comes straight back here
  //    after signing in.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace(loginUrlFor());
    }
  }, [authLoading, isAuthenticated, router]);

  // ── Fetch dashboard data once authenticated. ─────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const [s, su, rc, rq] = await Promise.all([
          userApi.stats(),
          userApi.subjects(),
          userApi.recentChats(),
          userApi.recentQuizzes(),
        ]);
        if (cancelled) return;
        setStats(s);
        setSubjects(su);
        setRecentChats(rc);
        setRecentQuizzes(rq);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) setDataError(err.detail);
        else setDataError(t.auth.errors.generic);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, t.auth.errors.generic]);

  // ── Render states ────────────────────────────────────────────────────────

  if (authLoading || !isAuthenticated) {
    return (
      <main className="relative min-h-screen">
        <NavBar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-deep-soft animate-pulse">{t.pages.dashboard.loading}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen">
      <NavBar />

      <div className="px-6 md:px-10 pt-28 pb-16">
        <div className="mx-auto max-w-6xl">
          {/* ── Header: avatar + greeting ───────────────────────────── */}
          {user && <DashHeader name={user.name} grade={user.grade} stars={stats?.stars ?? user.stars ?? 0} />}

          {/* ── Error banner if backend hiccuped ────────────────────── */}
          {dataError && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 flex items-start gap-2 rounded-2xl bg-rose-50/80 border border-rose-200/60 px-5 py-4 text-sm text-rose-700"
              role="alert"
            >
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <span>{dataError}</span>
            </motion.div>
          )}

          {/* ── Stats grid ──────────────────────────────────────────── */}
          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard
              icon={Sparkles}
              label={t.pages.dashboard.stats.stars}
              value={stats?.stars ?? null}
              gradient="from-amber-200 to-amber-300"
              delay={0}
            />
            <StatCard
              icon={Flame}
              label={t.pages.dashboard.stats.streak}
              value={stats?.streak_days ?? null}
              gradient="from-rose-200 to-rose-300"
              delay={0.07}
            />
            <StatCard
              icon={Trophy}
              label={t.pages.dashboard.stats.quizzes}
              value={stats?.total_quizzes ?? null}
              gradient="from-glacier-200 to-glacier-300"
              delay={0.14}
            />
            <StatCard
              icon={Target}
              label={t.pages.dashboard.stats.accuracy}
              value={stats?.overall_accuracy ?? null}
              suffix="%"
              gradient="from-mint-200 to-mint-300"
              delay={0.21}
            />
          </div>

          {/* ── Quick actions: Quiz + Analytics ─────────────────────── */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <motion.a
              href="/quiz"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 px-6 py-5 shadow-md hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer no-underline"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                <Trophy size={24} className="text-white" />
              </div>
              <div>
                <div className="font-display text-lg font-extrabold text-white">Take a Quiz</div>
                <div className="text-violet-100 text-sm">Test what you know · Earn stars</div>
              </div>
            </motion.a>
            <motion.a
              href="/analytics"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38 }}
              className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 px-6 py-5 shadow-md hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer no-underline"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                <BarChart3 size={24} className="text-white" />
              </div>
              <div>
                <div className="font-display text-lg font-extrabold text-white">My Progress</div>
                <div className="text-emerald-100 text-sm">Charts, streaks &amp; analytics</div>
              </div>
            </motion.a>
          </div>

          {/* ── Subjects ────────────────────────────────────────────── */}
          <SubjectsSection
            subjects={subjects}
            studyLabel={t.pages.dashboard.subjects.studyCta}
            heading={t.pages.dashboard.subjects.heading}
            sub={t.pages.dashboard.subjects.sub}
            lastStudiedLabel={t.pages.dashboard.subjects.lastStudied}
            neverLabel={t.pages.dashboard.subjects.neverStudied}
            locale={locale}
          />

          {/* ── Two-column: Continue learning + Recent quizzes ──────── */}
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ContinueLearning
                chats={recentChats}
                heading={t.pages.dashboard.resume.title}
                emptyText={t.pages.dashboard.resume.empty}
                messagesLabel={t.pages.dashboard.resume.messageCount}
                ctaLabel={t.pages.dashboard.resume.cta}
                locale={locale}
              />
            </div>
            <div>
              <RecentQuizzes
                quizzes={recentQuizzes}
                heading={t.pages.dashboard.recentQuizzes.heading}
                emptyText={t.pages.dashboard.recentQuizzes.empty}
                qLabel={t.pages.dashboard.recentQuizzes.questionsLabel}
                locale={locale}
              />
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}

// ─── useCountUp ───────────────────────────────────────────────────────────
//
// Smoothly animates a number from 0 to `target` over `durationMs`.
// Returns the current value as it ticks. We use rAF (not setInterval) so the
// animation stays in sync with the browser's paint cycle and pauses cleanly
// when the tab is hidden.

function useCountUp(target: number | null, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef<number>(0);

  useEffect(() => {
    if (target == null) return;
    fromRef.current = value;
    startRef.current = null;
    let rafId = 0;

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      // easeOutCubic — fast then settles, feels natural for counters
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (target - fromRef.current) * eased;
      setValue(next);
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // We intentionally exclude `value` from deps — we only want to re-run
    // when the target changes, not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}

// ─── Header ────────────────────────────────────────────────────────────────

function DashHeader({ name, grade, stars }: { name: string; grade: number; stars: number }) {
  const { t } = useLocale();
  const initial = (name || "S").trim().charAt(0).toUpperCase();
  const greeting = `${t.pages.dashboard.greeting}, ${name}!`;
  // Split into words so each word can fade in with a tiny stagger.
  const words = greeting.split(" ");
  const animatedStars = useCountUp(stars, 1100);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative flex items-center gap-5 rounded-3xl glass-strong p-6 md:p-7 shadow-soft overflow-hidden"
    >
      {/* Avatar (with soft halo CONTAINED inside the header card) */}
      <div className="relative flex-shrink-0">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-glacier-300/40 blur-2xl scale-110"
        />
            <motion.div
          initial={{ scale: 0.8, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.1 }}
          className="relative flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-full bg-gradient-to-br from-glacier-500 via-glacier-600 to-deep text-white font-display text-2xl md:text-3xl font-extrabold shadow-soft ring-2 ring-white/60"
        >
          {initial}
        </motion.div>
      </div>

      <div className="flex-1 min-w-0">
        <h1 className="font-display text-2xl md:text-4xl font-extrabold text-deep">
          {words.map((w, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.4, ease: "easeOut" }}
              className="inline-block mr-[0.25em]"
            >
              {w}
            </motion.span>
          ))}
        </h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 + words.length * 0.06 + 0.05, duration: 0.4 }}
          className="mt-1 text-deep-soft"
        >
          {t.pages.dashboard.gradeLabel} {grade}
        </motion.p>
      </div>

      {/* Star badge — bigger, clearer, with a gentle pulse if the user has any. */}
      <StarBadge stars={Math.round(animatedStars)} hasStars={stars > 0} />
    </motion.div>
  );
}

function StarBadge({ stars, hasStars }: { stars: number; hasStars: boolean }) {
  const { t } = useLocale();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, x: 12 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
      className="hidden sm:flex flex-col items-center gap-0.5 rounded-2xl bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 px-5 py-3 text-white shadow-soft min-w-[88px]"
    >
      <div className="flex items-center gap-1.5">
        <motion.div
          animate={hasStars ? { rotate: [0, -8, 8, -4, 4, 0] } : {}}
          transition={{ duration: 1.2, repeat: hasStars ? Infinity : 0, repeatDelay: 3 }}
        >
          <Star size={18} fill="currentColor" />
        </motion.div>
        <span className="font-display text-xl font-extrabold tabular-nums">{stars}</span>
      </div>
      <span className="text-[11px] uppercase tracking-wider font-bold opacity-90">
        {t.pages.dashboard.stats.stars}
      </span>
    </motion.div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  suffix = "",
  gradient,
  delay,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value: number | null;
  suffix?: string;
  gradient: string;
  delay: number;
}) {
  const animated = useCountUp(value, 1100);
  const display = value === null ? null : suffix === "%" ? animated.toFixed(0) : Math.round(animated).toString();
  const isPositive = value !== null && value > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
              whileHover={{ y: -4 }}
              className="rounded-3xl glass-strong p-6 shadow-soft"
            >
      <motion.div
        animate={isPositive ? { y: [0, -3, 0] } : {}}
        transition={{ duration: 2.5, repeat: isPositive ? Infinity : 0, ease: "easeInOut" }}
        className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-deep`}
              >
                <Icon size={22} strokeWidth={2.2} />
      </motion.div>
      <div className="font-display text-3xl font-extrabold text-deep tabular-nums">
        {display === null ? (
          <span className="inline-block w-10 h-7 rounded bg-glacier-100 animate-pulse" />
        ) : (
          `${display}${suffix}`
        )}
              </div>
      <div className="mt-1 text-sm text-deep-soft">{label}</div>
            </motion.div>
          );
}

// ─── Subjects ──────────────────────────────────────────────────────────────

function SubjectsSection({
  subjects,
  heading,
  sub,
  studyLabel,
  lastStudiedLabel,
  neverLabel,
  locale,
}: {
  subjects: Subject[] | null;
  heading: string;
  sub: string;
  studyLabel: string;
  lastStudiedLabel: string;
  neverLabel: string;
  locale: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="mt-10"
    >
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="font-display text-2xl md:text-3xl font-extrabold text-deep">{heading}</h2>
          <p className="mt-1 text-deep-soft">{sub}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {subjects === null
          ? [0, 1, 2].map((i) => <SubjectSkeleton key={i} />)
          : subjects.map((s, i) => (
              <SubjectCard
                key={s.name}
                subject={s}
                index={i}
                studyLabel={studyLabel}
                lastStudiedLabel={lastStudiedLabel}
                neverLabel={neverLabel}
                locale={locale}
              />
            ))}
      </div>
    </motion.section>
  );
}

function SubjectCard({
  subject,
  index,
  studyLabel,
  lastStudiedLabel,
  neverLabel,
  locale,
}: {
  subject: Subject;
  index: number;
  studyLabel: string;
  lastStudiedLabel: string;
  neverLabel: string;
  locale: string;
}) {
  const router = useRouter();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.35 + index * 0.07 }}
      whileHover={{ y: -6, scale: 1.015 }}
      className="group relative rounded-3xl glass-strong p-6 shadow-soft flex flex-col overflow-hidden"
    >
      {/* Soft glow that fades in on hover — adds warmth without being loud. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-gradient-to-br from-glacier-200/0 to-glacier-300/60 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500"
      />
      <motion.div
        whileHover={{ scale: 1.08, rotate: -3 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
        className="text-5xl mb-3 inline-block"
        aria-hidden
      >
        {subject.icon}
      </motion.div>
      <h3 className="font-display text-xl font-extrabold text-deep">{subject.name}</h3>
      <p className="mt-1 text-sm text-deep-soft flex items-center gap-1.5">
        <Clock size={13} />
        {subject.last_studied
          ? `${lastStudiedLabel}: ${formatRelative(subject.last_studied, locale)}`
          : neverLabel}
      </p>
      <button
        onClick={() => router.push(`/chat?subject=${encodeURIComponent(subject.name)}`)}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-glacier-500 to-deep text-white font-bold px-5 py-2.5 shadow-soft hover:shadow-deep transition-shadow"
      >
        {studyLabel}
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </motion.div>
  );
}

function SubjectSkeleton() {
  return (
    <div className="rounded-3xl glass-strong p-6 shadow-soft animate-pulse">
      <div className="h-12 w-12 rounded-2xl bg-glacier-100 mb-3" />
      <div className="h-6 w-24 rounded bg-glacier-100" />
      <div className="h-4 w-32 rounded bg-glacier-100 mt-2" />
      <div className="h-10 w-full rounded-full bg-glacier-100 mt-5" />
    </div>
  );
}

// ─── Continue learning ────────────────────────────────────────────────────

function ContinueLearning({
  chats,
  heading,
  emptyText,
  messagesLabel,
  ctaLabel,
  locale,
}: {
  chats: RecentChat[] | null;
  heading: string;
  emptyText: string;
  messagesLabel: string;
  ctaLabel: string;
  locale: string;
}) {
  const router = useRouter();
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.45 }}
      className="rounded-3xl glass-strong p-6 md:p-8 shadow-soft h-full"
    >
      <h2 className="font-display text-2xl font-extrabold text-deep">{heading}</h2>

      {chats === null ? (
        <div className="mt-5 space-y-3 animate-pulse">
          <div className="h-16 rounded-2xl bg-glacier-100/70" />
          <div className="h-16 rounded-2xl bg-glacier-100/50" />
        </div>
      ) : chats.length === 0 ? (
        <EmptyState icon={Compass} text={emptyText} />
      ) : (
        <ul className="mt-5 space-y-3">
          {chats.slice(0, 3).map((c) => (
            <li
              key={c.id}
              onClick={() => router.push(`/chat?session=${c.id}`)}
              className="flex items-center gap-4 rounded-2xl bg-white/50 hover:bg-white/80 transition-colors p-4 cursor-pointer"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-glacier-200 to-glacier-300 text-2xl flex-shrink-0">
                {c.subject === "Maths" ? "🔢" : c.subject === "Computer" ? "💻" : "🔬"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-bold text-deep truncate">
                  {c.title || c.subject || "Lesson"}
                </div>
                <div className="text-sm text-deep-soft truncate">
                  {c.last_message_snippet || `${c.message_count} ${messagesLabel}`}
                </div>
                <div className="text-xs text-deep-muted mt-0.5">
                  {c.timestamp ? formatRelative(c.timestamp, locale) : ""}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/chat?session=${c.id}`);
                }}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-glacier-100 hover:bg-glacier-200 px-4 py-2 text-sm font-bold text-deep transition-colors"
                aria-label={ctaLabel}
              >
                {ctaLabel}
                <ArrowRight size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}

// ─── Recent quizzes ───────────────────────────────────────────────────────

function RecentQuizzes({
  quizzes,
  heading,
  emptyText,
  qLabel,
  locale,
}: {
  quizzes: RecentQuiz[] | null;
  heading: string;
  emptyText: string;
  qLabel: string;
  locale: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.55 }}
      className="rounded-3xl glass-strong p-6 md:p-8 shadow-soft h-full"
    >
      <h2 className="font-display text-2xl font-extrabold text-deep">{heading}</h2>

      {quizzes === null ? (
        <div className="mt-5 space-y-3 animate-pulse">
          <div className="h-12 rounded-xl bg-glacier-100/70" />
          <div className="h-12 rounded-xl bg-glacier-100/50" />
          <div className="h-12 rounded-xl bg-glacier-100/30" />
        </div>
      ) : quizzes.length === 0 ? (
        <EmptyState icon={PenLine} text={emptyText} />
      ) : (
        <ul className="mt-5 space-y-3">
          {quizzes.map((q) => (
            <li
              key={q.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white/50 p-3"
            >
              <div className="min-w-0">
                <div className="font-bold text-deep truncate">{q.subject}</div>
                <div className="text-xs text-deep-muted">
                  {q.num_correct}/{q.num_questions} {qLabel} · {formatRelative(q.timestamp, locale)}
                </div>
              </div>
              <ScoreBadge score={q.score_percent} />
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "from-mint-300 to-mint-400 text-deep"
      : score >= 60
        ? "from-glacier-200 to-glacier-400 text-deep"
        : "from-amber-200 to-amber-400 text-deep";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${tone} font-display font-extrabold text-sm w-14 h-14 shadow-soft tabular-nums`}
    >
      {Math.round(score)}%
    </span>
  );
}

// ─── Friendly empty state ─────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  text: string;
}) {
  return (
    <div className="mt-6 flex flex-col items-center justify-center text-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.7, duration: 0.5, ease: "easeOut" }}
        className="relative"
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-glacier-200/60 blur-xl"
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-glacier-100 to-glacier-200 text-glacier-700 ring-2 ring-white/70">
          <Icon size={26} strokeWidth={2} />
        </div>
      </motion.div>
      <p className="mt-4 max-w-xs text-sm text-deep-soft leading-relaxed">{text}</p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatRelative(iso: string | null, locale: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  const diffSec = (Date.now() - date.getTime()) / 1000;
  const fmt = new Intl.RelativeTimeFormat(locale === "ur" ? "ur" : "en", { numeric: "auto" });
  if (diffSec < 60) return fmt.format(-Math.round(diffSec), "second");
  if (diffSec < 3600) return fmt.format(-Math.round(diffSec / 60), "minute");
  if (diffSec < 86400) return fmt.format(-Math.round(diffSec / 3600), "hour");
  if (diffSec < 86400 * 7) return fmt.format(-Math.round(diffSec / 86400), "day");
  return date.toLocaleDateString(locale === "ur" ? "ur" : "en");
}
