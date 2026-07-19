"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, BookOpen, Brain, Calendar, ChevronDown, ChevronRight, ChevronUp,
  LogOut, RefreshCw, Settings, Sparkles, Star, Target,
  Timer, Trophy, TrendingUp, TrendingDown, Minus, Users, Zap,
} from "lucide-react";
import { useSettings } from "@/lib/settings/SettingsContext";
import {
  ApiError,
  getParentToken,
  getSelectedChildEmail,
  parentApi,
  setParentToken,
  setSelectedChildEmail,
  type ParentChildSummary,
  type ParentDashboardData,
  type ParentUser,
} from "@/lib/api/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";


// ── types ──────────────────────────────────────────────────────────────────────
interface QuizRecord {
  id?: string;
  subject: string;
  score_percent: number;
  num_correct: number;
  num_questions: number;
  timestamp: string;
  avg_time_per_question?: number;
  total_time_seconds?: number;
  grade?: number;
  questions_detail?: { question: string; user_answer: string; correct_answer: string; is_correct: boolean; time_seconds: number }[];
}

interface RichDashboard extends ParentDashboardData {
  total_correct:   number;
  total_wrong:     number;
  score_trend:     { date: string; score: number; subject: string }[];
  speed_analysis:  { subject: string; avg_sec_per_q: number }[];
  consistency:     number;
  improvement:     number | null;
}

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({ correct, wrong, correctLabel = "correct", wrongLabel = "wrong", noDataLabel = "No quiz data yet" }: {
  correct: number; wrong: number;
  correctLabel?: string; wrongLabel?: string; noDataLabel?: string;
}) {
  const total = correct + wrong;
  if (total === 0) return (
    <div className="flex flex-col items-center justify-center py-6 text-deep-muted text-sm">{noDataLabel}</div>
  );
  const pct = Math.round((correct / total) * 100);
  const r = 48; const cx = 60; const cy = 60; const stroke = 14;
  const circ = 2 * Math.PI * r;
  const dash = (correct / total) * circ;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={120} height={120}>
        <defs>
          <linearGradient id="dg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0284c7" /><stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <motion.circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#dg)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1, ease: "easeOut" }} transform={`rotate(-90 ${cx} ${cy})`} />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={18} fill="#1e293b" fontWeight={700}>{pct}%</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="#64748b">correct</text>
      </svg>
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-gradient-to-r from-glacier-600 to-glacier-500" />
          <span className="font-bold text-deep">{correct}</span>
          <span className="text-deep-soft">{correctLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-rose-300" />
          <span className="font-bold text-deep">{wrong}</span>
          <span className="text-deep-soft">{wrongLabel}</span>
        </div>
      </div>
    </div>
  );
}

// ── Score trend (SVG line) ────────────────────────────────────────────────────
function ScoreTrend({ data, noDataLabel = "No trend data yet" }: {
  data: { date: string; score: number; subject: string }[];
  noDataLabel?: string;
}) {
  if (!data.length) return (
    <div className="flex items-center justify-center py-6 text-deep-muted text-sm">{noDataLabel}</div>
  );
  const W = 260; const H = 90; const pad = 14;
  const xStep = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((d, i) => ({
    x: pad + i * xStep,
    y: H - pad - (d.score / 100) * (H - pad * 2),
    ...d,
  }));
  const poly = pts.map(p => `${p.x},${p.y}`).join(" ");
  const area = pts.map((p, i) => `${i === 0 ? `M${p.x},${H - pad}` : ""} L${p.x},${p.y}`).join(" ")
    + ` L${pts[pts.length - 1].x},${H - pad} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 90 }}>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.28} />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
        </linearGradient>
      </defs>
      {[25, 50, 75].map(v => {
        const y = H - pad - (v / 100) * (H - pad * 2);
        return <line key={v} x1={pad} y1={y} x2={W - pad} y2={y} stroke="#f1f5f9" strokeWidth={1} />;
      })}
      <path d={area} fill="url(#lg)" />
      <motion.polyline points={poly} fill="none" stroke="#0284c7" strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={4} fill="white" stroke="#0284c7" strokeWidth={2} />
          <title>{p.subject}: {p.score}%</title>
        </g>
      ))}
      {pts.filter((_, i) => i === 0 || i === pts.length - 1).map((p, i) => (
        <text key={i} x={p.x} y={H - 1} textAnchor="middle" fontSize={8} fill="#94a3b8">{p.date.slice(5)}</text>
      ))}
    </svg>
  );
}

// ── Speed bars ────────────────────────────────────────────────────────────────
function SpeedBar({ subject, avgSec, max, secPerQLabel = "s / q" }: { subject: string; avgSec: number; max: number; secPerQLabel?: string }) {
  const pct = max > 0 ? (avgSec / max) * 100 : 0;
  const cls = avgSec <= 20 ? "from-mint-300 to-mint-400"
    : avgSec <= 40 ? "from-glacier-500 to-glacier-400" : "from-orange-500 to-amber-400";
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-bold text-deep">{subject}</span>
        <span className="text-deep-soft font-mono">{avgSec} {secPerQLabel}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-glacier-100 overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8 }} className={`h-full rounded-full bg-gradient-to-r ${cls}`} />
      </div>
    </div>
  );
}

// ── Subject accuracy bars ─────────────────────────────────────────────────────
function SubjectBar({ subject, accuracy, attempts }: { subject: string; accuracy: number; attempts: number }) {
  const cls = accuracy >= 80 ? "from-mint-300 to-glacier-500"
    : accuracy >= 60 ? "from-glacier-500 to-deep" : "from-rose-500 to-orange-400";
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-bold text-deep">{subject}</span>
        <span className="text-deep-soft">{accuracy}% · {attempts} quiz{attempts !== 1 ? "zes" : ""}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-glacier-100 overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${accuracy}%` }}
          transition={{ duration: 0.8 }} className={`h-full rounded-full bg-gradient-to-r ${cls}`} />
      </div>
    </div>
  );
}

// ── Daily activity ────────────────────────────────────────────────────────────
function ActivityChart({ days }: { days: { date: string; questions: number }[] }) {
  const maxQ = Math.max(...days.map(d => d.questions), 1);
  const BAR_MAX = 56;
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
      {days.map(d => {
        const h = Math.max(3, Math.round((d.questions / maxQ) * BAR_MAX));
        const label = d.date.slice(5); // MM-DD
        return (
          <div key={d.date} className="flex flex-col items-center gap-1">
            <div className="flex items-end" style={{ height: BAR_MAX }}>
              <motion.div
                initial={{ height: 0 }} animate={{ height: h }}
                transition={{ duration: 0.6 }}
                style={{ height: h, minHeight: 3 }}
                className="w-full rounded-t-md bg-gradient-to-t from-glacier-600 to-glacier-400"
                title={`${d.questions} questions on ${d.date}`}
              />
            </div>
            <span className="text-[9px] text-deep-muted leading-none">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Quiz stats panel (expandable) ─────────────────────────────────────────────
function QuizStatsPanel({ q, correctLabel = "✓ Correct", wrongLabel = "✗ Wrong", perQuestionLabel = "per question", totalTimeLabel = "total time", breakdownLabel = "Question Breakdown" }: {
  q: QuizRecord;
  correctLabel?: string; wrongLabel?: string;
  perQuestionLabel?: string; totalTimeLabel?: string; breakdownLabel?: string;
}) {
  const correct = q.num_correct;
  const wrong = q.num_questions - q.num_correct;
  const pct = Math.round(q.score_percent);
  const barColor = pct >= 80 ? "from-mint-300 to-glacier-500"
    : pct >= 60 ? "from-glacier-500 to-deep" : "from-rose-500 to-orange-400";

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }}
      className="mt-3 overflow-hidden"
    >
      <div className="rounded-2xl bg-glacier-50 border border-glacier-100 p-4 space-y-4">

        {/* Score bar */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="font-bold text-deep">Score</span>
            <span className="text-deep-soft">{pct}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-glacier-200 overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8 }}
              className={`h-full rounded-full bg-gradient-to-r ${barColor}`} />
          </div>
        </div>

        {/* Right vs wrong mini */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
            <div className="font-display text-2xl font-extrabold text-emerald-600">{correct}</div>
            <div className="text-xs text-emerald-600 font-medium mt-0.5">{correctLabel}</div>
          </div>
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-center">
            <div className="font-display text-2xl font-extrabold text-rose-600">{wrong}</div>
            <div className="text-xs text-rose-600 font-medium mt-0.5">{wrongLabel}</div>
          </div>
        </div>

        {/* Timing */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {q.avg_time_per_question != null && (
            <div className="flex items-center gap-2 text-deep-soft">
              <Timer size={14} className="text-glacier-500 flex-shrink-0" />
              <span><b className="text-deep">{q.avg_time_per_question}s</b> {perQuestionLabel}</span>
            </div>
          )}
          {q.total_time_seconds != null && (
            <div className="flex items-center gap-2 text-deep-soft">
              <Zap size={14} className="text-amber-500 flex-shrink-0" />
              <span><b className="text-deep">{Math.round(q.total_time_seconds)}s</b> {totalTimeLabel}</span>
            </div>
          )}
        </div>

        {/* Per-question breakdown if available */}
        {q.questions_detail && q.questions_detail.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-deep-soft uppercase tracking-wide">{breakdownLabel}</div>
            {q.questions_detail.map((qd, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] ${qd.is_correct ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {qd.is_correct ? "✓" : "✗"}
                </span>
                <span className="text-deep-soft leading-tight line-clamp-2 flex-1">{qd.question}</span>
                <span className="flex-shrink-0 text-deep-muted font-mono">{qd.time_seconds}s</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Quiz row with expandable stats ────────────────────────────────────────────
function QuizRow({ q, statsBtnLabel = "Stats", correctLabel, wrongLabel, perQuestionLabel, totalTimeLabel, breakdownLabel }: {
  q: QuizRecord; statsBtnLabel?: string;
  correctLabel?: string; wrongLabel?: string;
  perQuestionLabel?: string; totalTimeLabel?: string; breakdownLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(q.score_percent);
  const badge = pct >= 80 ? "text-emerald-600 bg-emerald-50 border-emerald-200"
    : pct >= 60 ? "text-glacier-600 bg-glacier-50 border-glacier-200" : "text-rose-600 bg-rose-50 border-rose-200";

  return (
    <div className="rounded-2xl border border-glacier-100 bg-white/60 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-glacier-50/60 transition-colors"
      >
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl border font-display font-extrabold text-sm flex-shrink-0 ${badge}`}>{pct}%</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-deep text-sm truncate">{q.subject}</div>
          <div className="text-xs text-deep-soft">
            {q.num_correct}/{q.num_questions} {correctLabel ?? "correct"}
            {q.avg_time_per_question != null ? ` · ${q.avg_time_per_question}s/q` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-deep-muted hidden sm:block">{new Date(q.timestamp).toLocaleDateString()}</span>
          <div className="flex items-center gap-1 rounded-lg bg-glacier-50 border border-glacier-200 px-2 py-1 text-xs font-bold text-glacier-700">
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {statsBtnLabel}
          </div>
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <div className="px-4 pb-4">
            <QuizStatsPanel q={q} correctLabel={correctLabel} wrongLabel={wrongLabel}
              perQuestionLabel={perQuestionLabel} totalTimeLabel={totalTimeLabel} breakdownLabel={breakdownLabel} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({ icon, label, value, sub, gradient }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; gradient: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25 }}
      className="relative overflow-hidden flex flex-col gap-3 rounded-2xl bg-white/85 border border-white/80 p-5 shadow-[0_10px_30px_-16px_rgba(15,39,68,0.28)] backdrop-blur-sm"
    >
      <div className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br ${gradient} opacity-15`} />
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-md`}>{icon}</div>
      <div>
        <div className="text-xs text-deep-soft font-medium">{label}</div>
        <div className="font-display text-2xl font-extrabold text-deep leading-tight mt-0.5">{value}</div>
        {sub && <div className="text-xs text-deep-muted mt-0.5">{sub}</div>}
      </div>
    </motion.div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl bg-white/85 border border-white/70 shadow-[0_12px_36px_-20px_rgba(15,39,68,0.3)] backdrop-blur-sm p-6"
    >
      <div className="flex items-center gap-2 mb-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-glacier-50 text-glacier-700">{icon}</div>
        <h2 className="font-display text-lg font-extrabold text-deep">{title}</h2>
      </div>
      {children}
    </motion.div>
  );
}


// ── Main page ─────────────────────────────────────────────────────────────────
export default function ParentDashboard() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const pd = t.parentDashboard;
  const { openSettings } = useSettings();

  const [parent, setParent] = useState<ParentUser | null>(null);
  const [children, setChildren] = useState<ParentChildSummary[]>([]);
  const [selectedChild, setSelectedEmail] = useState<string | null>(null);
  const [needsPick, setNeedsPick] = useState(false);
  const [data, setData] = useState<RichDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsLink, setNeedsLink] = useState(false);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [showAddChild, setShowAddChild] = useState(false);

  const loadDashboardFor = useCallback(async (childEmail: string) => {
    const dash = await parentApi.dashboard(childEmail);
    setSelectedEmail(childEmail);
    setSelectedChildEmail(childEmail);
    setData(dash as RichDashboard);
    setNeedsPick(false);
    setNeedsLink(false);
  }, []);

  const load = useCallback(async (opts?: { forcePick?: boolean }) => {
    const token = getParentToken();
    if (!token) { router.push("/login"); return; }
    setLoading(true); setError(null); setNeedsLink(false); setLinkMessage(null);
    setNeedsPick(false); setShowAddChild(false);
    try {
      const me = await parentApi.me();
      setParent(me);
      const listRes = await parentApi.children();
      const kids = listRes.children || [];
      setChildren(kids);

      const pendingOnly = kids.length === 0 && !!listRes.pending_child_email;
      if (kids.length === 0) {
        setData(null);
        setSelectedEmail(null);
        setSelectedChildEmail(null);
        setNeedsLink(true);
        setLinkMessage(
          pendingOnly
            ? "Waiting for your child to Approve via their email (or Settings → Family)."
            : "No linked child yet. Enter a Family Invitation Code from your child.",
        );
        return;
      }

      const stored = getSelectedChildEmail();
      const validStored =
        stored && kids.some((k) => k.email === stored) ? stored : null;

      if (kids.length > 1 && (opts?.forcePick || !validStored)) {
        setNeedsPick(true);
        setData(null);
        return;
      }

      const target = kids.length === 1 ? kids[0].email : (validStored as string);

      try {
        await loadDashboardFor(target);
      } catch (dashErr) {
        if (dashErr instanceof ApiError && (dashErr.status === 404 || dashErr.status === 409)) {
          setNeedsLink(true);
          setLinkMessage(dashErr.detail);
          setData(null);
        } else if (dashErr instanceof ApiError && dashErr.status === 400) {
          setNeedsPick(true);
          setData(null);
        } else {
          throw dashErr;
        }
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setParentToken(null); router.push("/login"); }
      else setError(e instanceof ApiError ? e.detail : pd.loadFailed);
    } finally { setLoading(false); }
  }, [router, pd.loadFailed, loadDashboardFor]);

  useEffect(() => { void load(); }, [load]);
  const logout = () => {
    parentApi.logout().catch(() => {});
    setParentToken(null);
    setSelectedChildEmail(null);
    router.push("/");
  };

  const redeem = async () => {
    setRedeemBusy(true);
    setRedeemError(null);
    try {
      await parentApi.redeemInvite(inviteCode.trim());
      setInviteCode("");
      await load();
    } catch (e) {
      setRedeemError(e instanceof ApiError ? e.detail : "Could not redeem code.");
    } finally {
      setRedeemBusy(false);
    }
  };

  const relLabel = (rel?: string) =>
    rel === "mother" ? (locale === "ur" ? "والدہ" : "Mother") : (locale === "ur" ? "والد" : "Father");

  if (loading) return (
    <main className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_#e0f2fe_0%,_#f8fafc_45%,_#ecfeff_100%)]">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
        <RefreshCw size={32} className="text-glacier-600" />
      </motion.div>
    </main>
  );

  if (error) return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_#e0f2fe_0%,_#f8fafc_45%,_#ecfeff_100%)]">
      <div className="text-center rounded-3xl bg-white/90 border border-white/80 shadow-soft p-8">
        <p className="text-rose-600 font-bold mb-4">{error}</p>
        <button onClick={load} className="rounded-full bg-glacier-600 px-5 py-2.5 text-white font-bold">{pd.retry}</button>
      </div>
    </main>
  );

  if (needsPick && parent) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_#e0f2fe_0%,_#f8fafc_40%,_#ecfeff_100%)]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg rounded-3xl bg-white/90 border border-white/80 shadow-[0_20px_50px_-24px_rgba(15,39,68,0.35)] backdrop-blur-md p-8"
        >
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-glacier-100 to-glacier-200 text-3xl">
              👨‍👩‍👧
            </div>
            <h1 className="font-display text-2xl font-extrabold text-deep">
              {locale === "ur" ? "بچہ منتخب کریں" : "Choose a child"}
            </h1>
            <p className="text-sm text-deep-soft mt-1">
              {locale === "ur"
                ? "آپ کے اکاؤنٹ سے ایک سے زیادہ بچے منسلک ہیں۔ جس کا ڈیش بورڈ دیکھنا ہے اسے چنیں۔"
                : "You have multiple linked children. Pick whose dashboard you want to open."}
            </p>
            {parent.relationship && (
              <p className="mt-2 text-xs font-bold text-glacier-700">
                {locale === "ur" ? "آپ کا رول:" : "Your role:"} {relLabel(parent.relationship)}
              </p>
            )}
          </div>
          <div className="space-y-3">
            {children.map((c) => (
              <button
                key={c.email}
                type="button"
                onClick={async () => {
                  setLoading(true);
                  try {
                    await loadDashboardFor(c.email);
                  } catch (e) {
                    setError(e instanceof ApiError ? e.detail : pd.loadFailed);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full flex items-center gap-4 rounded-2xl border border-glacier-200 bg-glacier-50/50 px-4 py-4 text-left hover:bg-glacier-100/70 hover:border-glacier-300 transition-all"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-glacier-500 to-deep text-2xl text-white shadow-md">
                  🎒
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-extrabold text-deep truncate">{c.name}</p>
                  <p className="text-xs text-deep-soft">
                    {pd.grade} {c.grade ?? "—"} · {relLabel(c.relationship)}
                  </p>
                </div>
                <ChevronRight size={18} className="text-glacier-600 flex-shrink-0" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowAddChild(true)}
            className="mt-5 w-full rounded-full border border-glacier-300 bg-white px-5 py-2.5 text-sm font-bold text-glacier-700"
          >
            {locale === "ur" ? "دوسرا بچہ لنک کریں" : "Link another child"}
          </button>
          {showAddChild && (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!redeemBusy && inviteCode.trim().length >= 5) void redeem();
              }}
            >
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="FAM-XXXXX"
                className="w-full rounded-2xl border border-glacier-200 bg-glacier-50/40 px-4 py-3 text-center font-mono tracking-widest text-lg mb-3 outline-none focus:ring-4 focus:ring-glacier-200/60"
              />
              {redeemError && <p className="text-sm text-rose-600 mb-3">{redeemError}</p>}
              <button
                type="submit"
                disabled={redeemBusy || inviteCode.trim().length < 5}
                className="w-full rounded-full bg-gradient-to-r from-glacier-600 to-deep px-5 py-3 text-white font-bold disabled:opacity-50"
              >
                {redeemBusy ? "Checking…" : "Submit invitation code"}
              </button>
            </form>
          )}
          <button type="button" onClick={logout} className="mt-4 block w-full text-sm font-bold text-deep-muted hover:text-deep">
            Log out
          </button>
        </motion.div>
      </main>
    );
  }

  if (needsLink && parent) {
    const pending = parent.link_status === "pending" || !!parent.pending_child_email;
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_#e0f2fe_0%,_#f8fafc_40%,_#ecfeff_100%)]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl bg-white/90 border border-white/80 shadow-[0_20px_50px_-24px_rgba(15,39,68,0.35)] backdrop-blur-md p-8 text-center"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-glacier-100 to-glacier-200 text-3xl">
            {pending ? "⏳" : "🔗"}
          </div>
          <h1 className="font-display text-2xl font-extrabold text-deep mb-2">
            {pending ? "Waiting for approval" : "Link your child"}
          </h1>
          <p className="text-sm text-deep-soft mb-2 leading-relaxed">
            {linkMessage ||
              (pending
                ? "We emailed your child an Approve link. Ask them to check Inbox/Spam, or Settings → Family."
                : "Ask your child for a Family Invitation Code (e.g. FAM-82K7Q) from Settings → Family.")}
          </p>
          {parent.relationship && (
            <p className="mb-4 text-xs font-bold text-glacier-700">
              {locale === "ur" ? "آپ کا رول:" : "Your role:"} {relLabel(parent.relationship)}
            </p>
          )}
          {!pending && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!redeemBusy && inviteCode.trim().length >= 5) void redeem();
              }}
            >
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="FAM-XXXXX"
                autoComplete="one-time-code"
                className="w-full rounded-2xl border border-glacier-200 bg-glacier-50/40 px-4 py-3 text-center font-mono tracking-widest text-lg mb-3 outline-none focus:ring-4 focus:ring-glacier-200/60"
              />
              {redeemError && <p className="text-sm text-rose-600 mb-3">{redeemError}</p>}
              <button
                type="submit"
                disabled={redeemBusy || inviteCode.trim().length < 5}
                className="w-full rounded-full bg-gradient-to-r from-glacier-600 to-deep px-5 py-3 text-white font-bold disabled:opacity-50 shadow-md"
              >
                {redeemBusy ? "Checking…" : "Submit invitation code"}
              </button>
            </form>
          )}
          {pending && (
            <button type="button" onClick={() => void load()} className="rounded-full bg-gradient-to-r from-glacier-600 to-deep px-5 py-2.5 text-white font-bold shadow-md">
              Refresh status
            </button>
          )}
          <button type="button" onClick={logout} className="mt-4 block w-full text-sm font-bold text-deep-muted hover:text-deep">
            Log out
          </button>
        </motion.div>
      </main>
    );
  }

  if (!data || !parent) return null;

  const child = data.child;
  const analytics = data.analytics;
  const quizHistory: QuizRecord[] = (data.quiz_history ?? []) as QuizRecord[];

  const totalCorrect = data.total_correct
    ?? quizHistory.reduce((s, q) => s + (q.num_correct ?? 0), 0);
  const totalWrong = data.total_wrong
    ?? quizHistory.reduce((s, q) => s + ((q.num_questions ?? 0) - (q.num_correct ?? 0)), 0);

  const scoreTrend: { date: string; score: number; subject: string }[] =
    (data.score_trend && data.score_trend.length > 0)
      ? data.score_trend
      : [...quizHistory].reverse().map(q => ({
          date: (q.timestamp ?? "").slice(0, 10),
          score: q.score_percent ?? 0,
          subject: q.subject ?? "",
        }));

  const speedAnalysis = data.speed_analysis ?? [];

  const rawBreakdown = analytics.subject_breakdown ?? {};
  const subjectBreakdown: { subject: string; accuracy: number; attempts: number }[] =
    Array.isArray(rawBreakdown)
      ? rawBreakdown
      : Object.entries(rawBreakdown as Record<string, { accuracy: number; attempts: number }>).map(
          ([subject, s]) => ({ subject, accuracy: Math.round(s.accuracy), attempts: s.attempts })
        );

  const dailyActivity = (analytics.daily_activity ?? []).slice(-7);
  const maxSpeed = Math.max(...speedAnalysis.map(s => s.avg_sec_per_q), 1);

  const improvementLabel =
    data.improvement == null ? null
    : data.improvement > 2  ? { text: pd.improving.replace("{n}", String(data.improvement)), icon: <TrendingUp size={13} />, cls: "text-emerald-100" }
    : data.improvement < -2 ? { text: pd.declining.replace("{n}", String(Math.abs(data.improvement))), icon: <TrendingDown size={13} />, cls: "text-rose-200" }
    : { text: pd.stable, icon: <Minus size={13} />, cls: "text-glacier-200" };

  return (
    <main className="relative min-h-screen pb-20 overflow-hidden bg-[radial-gradient(ellipse_at_top,_#dbeafe_0%,_#f8fafc_42%,_#ecfeff_100%)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.18),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(6,182,212,0.16),transparent_40%)]" />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/75 backdrop-blur-xl px-5 sm:px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-glacier-500 to-deep text-xl shadow-md">👨‍👩‍👧</div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-glacier-700/80 font-bold">{pd.title}</p>
            <p className="font-display text-lg font-extrabold text-deep leading-tight">{parent.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {children.length > 1 && (
            <button
              type="button"
              onClick={() => void load({ forcePick: true })}
              className="flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800 hover:bg-cyan-100 transition-all"
            >
              <Users size={15} />
              <span className="hidden sm:inline">{locale === "ur" ? "بچہ بدلیں" : "Switch child"}</span>
            </button>
          )}
          <button onClick={() => openSettings()}
            className="flex items-center gap-1.5 rounded-xl border border-glacier-200 bg-glacier-50 px-3 py-2 text-sm font-bold text-glacier-700 hover:bg-glacier-100 transition-all"
          >
            <Settings size={15} />
            <span className="hidden sm:inline">{locale === "ur" ? "ترتیبات" : "Settings"}</span>
          </button>
          <button onClick={logout} className="flex items-center gap-2 rounded-xl border border-glacier-200 bg-white/80 px-4 py-2 text-sm font-bold text-deep-soft hover:text-deep hover:bg-white transition-all">
            <LogOut size={16} /><span className="hidden sm:inline">{pd.logout}</span>
          </button>
        </div>
      </header>

      <div className="relative max-w-2xl mx-auto px-4 pt-8 space-y-6">

        {/* ── Child hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-glacier-600 via-glacier-500 to-deep p-6 text-white shadow-[0_22px_50px_-20px_rgba(2,132,199,0.55)]"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-cyan-300/20" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-4xl ring-2 ring-white/25">🎒</div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl font-extrabold leading-tight">{child.name}</h1>
              <p className="text-glacier-100 text-sm mt-0.5">
                {pd.grade} {child.grade} {pd.student}
                {data.relationship ? ` · ${relLabel(data.relationship)}` : ""}
              </p>
              {improvementLabel && (
                <div className={`flex items-center gap-1 mt-1.5 text-xs font-bold bg-white/15 rounded-full px-2.5 py-0.5 w-fit ${improvementLabel.cls}`}>
                  {improvementLabel.icon}{improvementLabel.text}
                </div>
              )}
            </div>
            <div className="flex flex-col items-center flex-shrink-0 rounded-2xl bg-white/10 px-3 py-2">
              <div className="flex items-center gap-1 text-amber-200">
                <Star size={18} fill="currentColor" />
                <span className="font-display text-xl font-extrabold">{child.stars}</span>
              </div>
              <span className="text-xs text-glacier-100">{pd.stars}</span>
            </div>
          </div>
          <div className="relative mt-5 grid grid-cols-4 gap-2">
            {[
              { label: pd.quizzes,     value: analytics.total_attempts },
              { label: pd.accuracy,    value: `${Math.round(analytics.overall_accuracy ?? 0)}%` },
              { label: pd.streak,      value: `${analytics.streak_days}d` },
              { label: pd.consistency, value: `${data.consistency ?? 0}%` },
            ].map(s => (
              <div key={s.label} className="rounded-2xl bg-white/12 py-3 text-center ring-1 ring-white/15">
                <div className="font-display text-lg font-extrabold">{s.value}</div>
                <div className="text-[10px] text-glacier-100 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Key metric cards ── */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCard icon={<BookOpen size={18} />} label={pd.chatSessions} value={data.total_chats}
            sub={pd.chatSub} gradient="from-glacier-500 to-deep" />
          <MetricCard icon={<Brain size={18} />} label={pd.favSubject} value={data.favourite_subject}
            sub={pd.favSub} gradient="from-mint-300 to-glacier-500" />
          <MetricCard icon={<Timer size={18} />} label={pd.timeSpent} value={`${analytics.total_time_minutes ?? 0}m`}
            sub={pd.timeSub} gradient="from-amber-500 to-orange-500" />
          <MetricCard icon={<Target size={18} />} label={pd.questionsDone} value={analytics.total_questions ?? 0}
            sub={`${totalCorrect} ${pd.answeredCorrectly}`} gradient="from-sky-600 to-blue-500" />
        </div>

        {/* ── AI Report ── */}
        <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
          onClick={() => {
            const email = selectedEmail || child.email;
            if (email) setSelectedChildEmail(email);
            router.push("/parent/report");
          }}
          className="w-full flex items-center justify-between rounded-2xl bg-gradient-to-r from-glacier-600 to-deep px-6 py-4 text-white shadow-[0_14px_34px_-16px_rgba(2,132,199,0.7)] hover:shadow-xl transition-all"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
              <Sparkles size={22} />
            </span>
            <div className="text-left">
              <div className="font-display font-extrabold text-lg leading-tight">{pd.aiReportBtn}</div>
              <div className="text-xs text-glacier-100">{pd.aiReportSub.replace("{name}", child.name)}</div>
            </div>
          </div>
          <ChevronRight size={20} className="flex-shrink-0" />
        </motion.button>

        {/* ── Right vs Wrong + Score Trend ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Section icon={<Zap size={20} />} title={pd.rightVsWrong}>
            <DonutChart correct={totalCorrect} wrong={totalWrong} correctLabel={pd.correct} wrongLabel={pd.wrong} noDataLabel={pd.noQuizData} />
          </Section>
          <Section icon={<TrendingUp size={20} />} title={pd.scoreTrend}>
            <ScoreTrend data={scoreTrend} noDataLabel={pd.noTrendData} />
            {scoreTrend.length > 0 && (
              <p className="text-xs text-deep-muted mt-2 text-center">{pd.lastNQuizzes.replace("{n}", String(scoreTrend.length))}</p>
            )}
          </Section>
        </div>

        {/* ── Subject accuracy ── */}
        {subjectBreakdown.length > 0 && (
          <Section icon={<BarChart3 size={20} />} title={pd.subjectAccuracy}>
            <div className="space-y-4">
              {subjectBreakdown.map(s => (
                <SubjectBar key={s.subject} subject={s.subject} accuracy={Math.round(s.accuracy)} attempts={s.attempts} />
              ))}
            </div>
          </Section>
        )}

        {/* ── Speed analysis ── */}
        {speedAnalysis.length > 0 && (
          <Section icon={<Timer size={20} />} title={pd.speedAnalysis}>
            <p className="text-xs text-deep-soft mb-4">{pd.speedSub}</p>
            <div className="space-y-4">
              {speedAnalysis.map(s => (
                <SpeedBar key={s.subject} subject={s.subject} avgSec={s.avg_sec_per_q} max={maxSpeed} secPerQLabel={pd.secPerQ} />
              ))}
            </div>
          </Section>
        )}

        {/* ── Daily Activity ── */}
        {dailyActivity.length > 0 && (
          <Section icon={<Calendar size={20} />} title={pd.dailyActivity}>
            <ActivityChart days={dailyActivity} />
          </Section>
        )}

        {/* ── Recent Quizzes ── */}
        {quizHistory.length > 0 && (
          <Section icon={<Trophy size={20} />} title={pd.recentQuizzes}>
            <div className="space-y-3">
              {quizHistory.map((q, i) => (
                <QuizRow key={q.id ?? i} q={q}
                  statsBtnLabel={pd.statsBtn}
                  correctLabel={pd.correctLabel}
                  wrongLabel={pd.wrongLabel}
                  perQuestionLabel={pd.perQuestion}
                  totalTimeLabel={pd.totalTime}
                  breakdownLabel={pd.questionBreakdown}
                />
              ))}
            </div>
          </Section>
        )}

        {/* ── Empty state ── */}
        {!analytics.total_attempts && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-3xl bg-white/80 border border-glacier-100 shadow-soft p-10 text-center"
          >
            <div className="text-5xl mb-3">📚</div>
            <h3 className="font-display font-extrabold text-deep text-lg">{pd.emptyTitle}</h3>
            <p className="text-deep-soft text-sm mt-1">{pd.emptySub.replace("{name}", child.name)}</p>
          </motion.div>
        )}

        {/* Link another child */}
        <div className="rounded-3xl bg-white/80 border border-glacier-100 shadow-soft p-5">
          <button
            type="button"
            onClick={() => setShowAddChild((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <div>
              <p className="font-display font-extrabold text-deep">
                {locale === "ur" ? "دوسرا بچہ لنک کریں" : "Link another child"}
              </p>
              <p className="text-xs text-deep-soft mt-0.5">
                {locale === "ur"
                  ? "ایک parent اکاؤنٹ سے کئی بچے منسلک ہو سکتے ہیں۔"
                  : "One parent account can stay linked to multiple children."}
              </p>
            </div>
            <ChevronRight size={18} className={`text-glacier-600 transition-transform ${showAddChild ? "rotate-90" : ""}`} />
          </button>
          {showAddChild && (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!redeemBusy && inviteCode.trim().length >= 5) void redeem();
              }}
            >
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="FAM-XXXXX"
                className="w-full rounded-2xl border border-glacier-200 bg-glacier-50/40 px-4 py-3 text-center font-mono tracking-widest text-lg mb-3 outline-none focus:ring-4 focus:ring-glacier-200/60"
              />
              {redeemError && <p className="text-sm text-rose-600 mb-3">{redeemError}</p>}
              <button
                type="submit"
                disabled={redeemBusy || inviteCode.trim().length < 5}
                className="w-full rounded-full bg-gradient-to-r from-glacier-600 to-deep px-5 py-3 text-white font-bold disabled:opacity-50"
              >
                {redeemBusy ? "Checking…" : "Submit invitation code"}
              </button>
            </form>
          )}
        </div>
      </div>

    </main>
  );
}
