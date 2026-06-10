"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft, BookOpen, Brain, Calendar, RefreshCw, Settings, Star, Trophy,
} from "lucide-react";
import { useSettings } from "@/lib/settings/SettingsContext";
import { ApiError, getParentToken, parentApi, setParentToken } from "@/lib/api/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ReportSection {
  id: string;
  title: string;
  emoji: string;
  color: "violet" | "emerald" | "amber" | "sky" | "rose" | string;
  points: string[];
}

interface ReportData {
  child_name: string;
  grade: number;
  stars: number;
  overall_accuracy: number;
  total_attempts: number;
  streak_days: number;
  favourite_subject: string;
  summary_headline: string;
  overall_rating: string;
  sections: ReportSection[];
  generated_at: string;
}

// ── Color maps ─────────────────────────────────────────────────────────────────
const SECTION_STYLES: Record<string, {
  bg: string; border: string; icon: string; badge: string; dot: string;
}> = {
  violet: {
    bg: "from-violet-50 to-purple-50",
    border: "border-violet-200",
    icon: "from-violet-500 to-purple-600",
    badge: "bg-violet-100 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
  },
  emerald: {
    bg: "from-emerald-50 to-teal-50",
    border: "border-emerald-200",
    icon: "from-emerald-500 to-teal-500",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  amber: {
    bg: "from-amber-50 to-orange-50",
    border: "border-amber-200",
    icon: "from-amber-500 to-orange-500",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  sky: {
    bg: "from-sky-50 to-cyan-50",
    border: "border-sky-200",
    icon: "from-sky-500 to-cyan-500",
    badge: "bg-sky-100 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
  },
  rose: {
    bg: "from-rose-50 to-pink-50",
    border: "border-rose-200",
    icon: "from-rose-500 to-pink-500",
    badge: "bg-rose-100 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
  },
};

function getStyle(color: string) {
  return SECTION_STYLES[color] ?? SECTION_STYLES.violet;
}

const RATING_CONFIG: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  Excellent:       { label: "Excellent",      color: "text-emerald-700", bg: "from-emerald-400 to-teal-500",  emoji: "🏆" },
  Good:            { label: "Good",           color: "text-sky-700",     bg: "from-sky-400 to-cyan-500",      emoji: "⭐" },
  Developing:      { label: "Developing",     color: "text-amber-700",   bg: "from-amber-400 to-orange-500",  emoji: "📈" },
  "Needs Support": { label: "Needs Support",  color: "text-rose-700",    bg: "from-rose-400 to-pink-500",     emoji: "💙" },
};

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ section, index, pointLabel = "point", pointsLabel = "points" }: { section: ReportSection; index: number; pointLabel?: string; pointsLabel?: string }) {
  const s = getStyle(section.color);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className={`rounded-3xl bg-gradient-to-br ${s.bg} border ${s.border} p-6 shadow-sm`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${s.icon} shadow-md text-2xl`}>
          {section.emoji}
        </div>
        <div>
          <h2 className="font-display text-xl font-extrabold text-deep">{section.title}</h2>
          <span className={`inline-block mt-0.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${s.badge}`}>
            {section.points.length} {section.points.length !== 1 ? pointsLabel : pointLabel}
          </span>
        </div>
      </div>

      {/* Points */}
      <ul className="space-y-3">
        {section.points.map((point, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 + i * 0.05 }}
            className="flex items-start gap-3"
          >
            <div className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${s.dot}`} />
            <span className="text-deep leading-relaxed text-sm">{point}</span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className={`flex flex-col items-center gap-1 rounded-2xl px-4 py-3 ${color}`}>
      <div className="text-inherit opacity-80">{icon}</div>
      <div className="font-display text-xl font-extrabold leading-tight">{value}</div>
      <div className="text-[10px] font-medium opacity-70 uppercase tracking-wide">{label}</div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-glacier-100 ${className}`} />;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ParentReportPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const pr = t.parentReport;
  const { openSettings } = useSettings();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getParentToken();
    if (!token) { router.push("/login"); return; }

    parentApi.report()
      .then(r => setReport(r as unknown as ReportData))
      .catch(e => {
        if (e instanceof ApiError && e.status === 401) { setParentToken(null); router.push("/login"); }
        else setError(e instanceof ApiError ? e.detail : pr.errorGeneric);
      })
      .finally(() => setLoading(false));
  }, [router]);

  const rating = report ? (RATING_CONFIG[report.overall_rating] ?? RATING_CONFIG["Good"]) : null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-purple-50 pb-20">

      {/* Sticky header */}
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/80 backdrop-blur-md px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => router.push("/parent/dashboard")}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-glacier-50 border border-glacier-200 text-deep-soft hover:text-deep hover:bg-white transition-all flex-shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-xs text-deep-soft font-medium">{pr.backLabel}</p>
          <p className="font-display text-lg font-extrabold text-deep leading-tight">{pr.pageTitle}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {report && <span className="text-xs text-deep-muted hidden sm:block">{pr.generatedOn} {new Date(report.generated_at).toLocaleDateString()}</span>}
          <button onClick={openSettings}
            className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100 transition-all"
          >
            <Settings size={15} />
            <span className="hidden sm:inline">{locale === "ur" ? "ترتیبات" : "Settings"}</span>
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-8 space-y-6">

        {loading && (
          <>
            {/* Loading hero */}
            <div className="rounded-3xl bg-gradient-to-br from-violet-600 to-purple-700 p-8 flex flex-col items-center gap-4 text-white">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}>
                <RefreshCw size={32} />
              </motion.div>
              <p className="font-display text-xl font-extrabold">{pr.generatingTitle}</p>
              <p className="text-violet-200 text-sm text-center">{pr.generatingSub}</p>
            </div>
            {/* Skeleton cards */}
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-3xl border border-glacier-100 p-6 bg-white/80 space-y-3">
                <Skeleton className="h-12 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ))}
          </>
        )}

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-3xl bg-rose-50 border border-rose-200 p-8 text-center"
          >
            <div className="text-4xl mb-3">😔</div>
            <h2 className="font-display text-xl font-extrabold text-deep mb-2">{pr.couldNotGenerate}</h2>
            <p className="text-rose-700 text-sm mb-5">{error}</p>
            <button
              onClick={() => { setError(null); setLoading(true); parentApi.report().then(r => setReport(r as unknown as ReportData)).catch(e => setError(String(e))).finally(() => setLoading(false)); }}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-2.5 text-white font-bold text-sm"
            >
              {pr.tryAgain}
            </button>
          </motion.div>
        )}

        {report && !loading && (
          <>
            {/* ── Hero banner ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-3xl bg-gradient-to-br ${rating!.bg} p-7 text-white shadow-xl`}
            >
              <div className="flex items-start gap-4">
                <div className="text-5xl">{rating!.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold mb-2">
                    <Star size={11} fill="white" /> {report.overall_rating}
                  </div>
                  <h1 className="font-display text-2xl font-extrabold leading-tight">
                    {report.summary_headline}
                  </h1>
                  <p className="text-white/80 text-sm mt-1">
                    {pr.aiGenFor.replace("{name}", report.child_name)} · {t.parentDashboard.grade} {report.grade}
                  </p>
                </div>
              </div>

              {/* Stat pills */}
              <div className="mt-6 grid grid-cols-4 gap-2">
                <StatPill icon={<Trophy size={16} />}    label={pr.quizzes}   value={report.total_attempts}         color="bg-white/15" />
                <StatPill icon={<Brain size={16} />}     label={pr.accuracy}  value={`${report.overall_accuracy}%`} color="bg-white/15" />
                <StatPill icon={<Calendar size={16} />}  label={pr.streak}    value={`${report.streak_days}d`}      color="bg-white/15" />
                <StatPill icon={<BookOpen size={16} />}  label={pr.stars}     value={report.stars}                  color="bg-white/15" />
              </div>
            </motion.div>

            {/* ── Favourite subject chip ── */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
              className="flex items-center gap-2 rounded-2xl bg-white/80 border border-glacier-100 shadow-soft px-5 py-3"
            >
              <span className="text-deep-soft text-sm">⭐ {pr.favSubject}</span>
              <span className="font-display font-extrabold text-deep text-sm">{report.favourite_subject}</span>
            </motion.div>

            {/* ── Section cards ── */}
            {report.sections.map((section, i) => (
              <SectionCard key={section.id} section={section} index={i} pointLabel={pr.points} pointsLabel={pr.pointsPlural} />
            ))}

            {/* ── Footer note ── */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
              className="rounded-3xl bg-gradient-to-br from-violet-600 to-purple-700 p-6 text-white text-center"
            >
              <div className="text-3xl mb-2">💜</div>
              <p className="font-display font-extrabold text-lg">{pr.keepSupporting.replace("{name}", report.child_name)}</p>
              <p className="text-violet-200 text-sm mt-1">{pr.encouragement}</p>
              <button
                onClick={() => router.push("/parent/dashboard")}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 px-4 py-2 text-sm font-bold transition-all"
              >
                <ArrowLeft size={15} /> {pr.backToDashboard}
              </button>
            </motion.div>
          </>
        )}
      </div>
    </main>
  );
}
