"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Sparkles,
  Flame,
  Trophy,
  Target,
  Clock,
  BookOpen,
  TrendingUp,
  Star,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Brain,
  FlaskConical,
  Monitor,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { loginUrlFor } from "@/lib/auth/redirect";
import { quizApi, type AnalyticsData, ApiError } from "@/lib/api/client";

// ─── Subject colours ──────────────────────────────────────────────────────────
const SUBJECT_STYLE: Record<string, { color: string; bar: string; icon: React.ElementType }> = {
  Maths: { color: "text-violet-600", bar: "bg-violet-500", icon: Brain },
  "General Science": { color: "text-emerald-600", bar: "bg-emerald-500", icon: FlaskConical },
  "Computer Science": { color: "text-sky-600", bar: "bg-sky-500", icon: Monitor },
};

function subjectStyle(sub: string) {
  return SUBJECT_STYLE[sub] ?? { color: "text-glacier-600", bar: "bg-glacier-400", icon: BookOpen };
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, suffix = "", gradient, delay = 0,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number | null;
  suffix?: string;
  gradient: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="rounded-2xl bg-white/80 border border-glacier-100 shadow-sm px-5 py-5"
    >
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} mb-3`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="font-display text-2xl font-extrabold text-deep">
        {value === null ? <span className="text-glacier-300 animate-pulse">—</span> : `${value}${suffix}`}
      </div>
      <div className="mt-0.5 text-xs text-deep-soft">{label}</div>
    </motion.div>
  );
}

// ─── Activity Bar Chart ───────────────────────────────────────────────────────
const BAR_AREA_H = 96; // px — fixed height of the bar area above the labels

function ActivityChart({ activity }: { activity: AnalyticsData["daily_activity"] }) {
  const last7 = activity.slice(-7);
  const max = Math.max(...last7.map((d) => d.questions), 1);

  return (
    <div className="rounded-2xl bg-white/80 border border-glacier-100 shadow-sm px-5 py-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={18} className="text-glacier-500" />
        <h3 className="font-display text-sm font-bold text-deep">Daily Activity (last 7 days)</h3>
      </div>

      {/* Outer row: each column is a bar + label stacked, aligned to the bottom */}
      <div className="flex items-end gap-2" style={{ height: BAR_AREA_H + 20 }}>
        {last7.map((d, i) => {
          const barPx = d.questions > 0
            ? Math.max(Math.round((d.questions / max) * BAR_AREA_H), 10)
            : 3;
          const label = d.date.slice(5); // "MM-DD"
          return (
            <div
              key={i}
              className="flex flex-1 flex-col items-center justify-end gap-1"
              style={{ height: BAR_AREA_H + 20 }}
              title={d.questions > 0 ? `${d.questions} questions · ${d.accuracy}% accuracy` : "No activity"}
            >
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: barPx }}
                transition={{ delay: i * 0.07, duration: 0.5, ease: "easeOut" }}
                className={`w-full rounded-t-lg ${d.questions > 0 ? "bg-gradient-to-t from-sky-600 to-cyan-400" : "bg-slate-200"}`}
                style={{ flexShrink: 0 }}
              />
              <span className="text-[10px] text-deep-soft whitespace-nowrap">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Subject Breakdown ────────────────────────────────────────────────────────
function SubjectBreakdown({ breakdown }: { breakdown: AnalyticsData["subject_breakdown"] }) {
  const entries = Object.entries(breakdown);
  if (entries.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white/80 border border-glacier-100 shadow-sm px-5 py-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={18} className="text-glacier-500" />
        <h3 className="font-display text-sm font-bold text-deep">By Subject</h3>
      </div>
      <div className="space-y-4">
        {entries.map(([sub, stats]) => {
          const { color, bar, icon: Icon } = subjectStyle(sub);
          return (
            <div key={sub}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={15} className={color} />
                <span className={`text-sm font-semibold ${color}`}>{sub}</span>
                <span className="ml-auto text-xs text-deep-soft">{stats.accuracy}% accuracy</span>
              </div>
              <div className="h-2.5 rounded-full bg-glacier-100 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.accuracy}%` }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  className={`h-full rounded-full ${bar}`}
                />
              </div>
              <div className="flex justify-between text-[11px] text-deep-soft mt-1">
                <span>{stats.attempts} quiz{stats.attempts !== 1 ? "zes" : ""}</span>
                <span>{stats.correct}/{stats.questions} correct</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Recent Attempts ──────────────────────────────────────────────────────────
function RecentAttempts({ attempts }: { attempts: AnalyticsData["recent_attempts"] }) {
  if (attempts.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white/80 border border-glacier-100 shadow-sm px-5 py-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={18} className="text-glacier-500" />
        <h3 className="font-display text-sm font-bold text-deep">Recent Quizzes</h3>
      </div>
      <div className="space-y-3">
        {attempts.slice(0, 8).map((a, i) => {
          const { icon: Icon, color } = subjectStyle(a.subject);
          const pct = a.score_percent;
          const resultColor = pct >= 70 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-600";
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 rounded-xl border border-glacier-100 bg-glacier-50/40 px-4 py-3"
            >
              <Icon size={16} className={color} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-deep truncate">{a.subject}</div>
                <div className="text-xs text-deep-soft">{a.date ?? a.timestamp?.slice(0, 10)}</div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-bold ${resultColor}`}>{Math.round(pct)}%</div>
                <div className="text-xs text-deep-soft">{a.num_correct}/{a.num_questions}</div>
              </div>
              {pct >= 70
                ? <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                : <XCircle size={16} className="text-rose-300 flex-shrink-0" />}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stars Banner ─────────────────────────────────────────────────────────────
function StarsBanner({ stars, streak }: { stars: number; streak: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 shadow-md px-6 py-5 flex items-center gap-4"
    >
      <div className="flex items-center gap-1">
        {Array.from({ length: Math.min(stars, 10) }, (_, i) => (
          <Star key={i} size={20} className="text-white fill-white" />
        ))}
        {stars > 10 && <span className="text-white font-bold text-sm ml-1">+{stars - 10}</span>}
      </div>
      <div className="flex-1">
        <div className="font-display text-xl font-extrabold text-white">{stars} Stars Total</div>
        <div className="text-amber-100 text-sm">
          {streak > 0 ? `🔥 ${streak} day streak! Keep going!` : "Start a quiz to earn stars!"}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace(loginUrlFor());
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const res = await quizApi.analytics();
        setData(res);
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : "Could not load analytics.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated]);

  if (authLoading || !isAuthenticated) {
    return (
      <main className="relative min-h-screen">
        <NavBar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-deep-soft animate-pulse">Loading…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-gradient-to-br from-glacier-50 via-white to-mint-50">
      <NavBar />
      <div className="px-4 md:px-8 pt-28 pb-20">
        <div className="mx-auto max-w-4xl">

          {/* Header */}
          <div className="mb-8 flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-2 text-sm text-deep-soft hover:text-deep transition-colors"
            >
              <ArrowLeft size={16} /> Dashboard
            </button>
            <div className="ml-auto">
              <button
                onClick={() => router.push("/quiz")}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 px-4 py-2 text-sm font-bold text-white shadow hover:shadow-md transition-all hover:scale-[1.02]"
              >
                <Trophy size={16} /> Take a Quiz
              </button>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="font-display text-3xl font-extrabold text-deep">My Progress</h1>
            <p className="mt-1 text-deep-soft">Track your learning journey and see how you improve</p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-24 gap-3 text-deep-soft">
              <Loader2 size={24} className="animate-spin text-glacier-400" />
              Loading your analytics…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-2xl bg-rose-50 border border-rose-200 px-5 py-4 text-sm text-rose-700">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" /> {error}
            </div>
          )}

          {data && !loading && (
            <div className="space-y-6">
              {/* Stars banner */}
              <StarsBanner stars={data.total_stars} streak={data.streak_days} />

              {/* Stats grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Trophy} label="Quizzes Taken" value={data.total_attempts} gradient="from-violet-500 to-purple-600" delay={0} />
                <StatCard icon={Target} label="Overall Accuracy" value={Math.round(data.overall_accuracy)} suffix="%" gradient="from-emerald-500 to-teal-600" delay={0.07} />
                <StatCard icon={Clock} label="Time Learning" value={Math.round(data.total_time_minutes)} suffix=" min" gradient="from-sky-500 to-blue-600" delay={0.14} />
                <StatCard icon={Flame} label="Day Streak" value={data.streak_days} gradient="from-amber-500 to-orange-500" delay={0.21} />
              </div>

              {/* Activity chart */}
              {data.daily_activity.length > 0 && (
                <ActivityChart activity={data.daily_activity} />
              )}

              {/* Two column: subject breakdown + recent attempts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SubjectBreakdown breakdown={data.subject_breakdown} />
                <RecentAttempts attempts={data.recent_attempts} />
              </div>

              {/* Empty state */}
              {data.total_attempts === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-2xl bg-white/80 border border-glacier-100 shadow-sm px-8 py-12 text-center"
                >
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-glacier-100 mb-4">
                    <Sparkles size={28} className="text-glacier-400" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-deep mb-2">No quizzes yet!</h3>
                  <p className="text-deep-soft mb-6">Take your first quiz to start tracking your progress.</p>
                  <button
                    onClick={() => router.push("/quiz")}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 px-6 py-3 font-bold text-white shadow hover:shadow-md transition-all"
                  >
                    <Trophy size={18} /> Start your first quiz
                  </button>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </main>
  );
}
