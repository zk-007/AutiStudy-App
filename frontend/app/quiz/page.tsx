"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  CheckCircle2,
  XCircle,
  Star,
  ChevronRight,
  RotateCcw,
  Trophy,
  Clock,
  Sparkles,
  BookOpen,
  FlaskConical,
  Monitor,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { loginUrlFor } from "@/lib/auth/redirect";
import { quizApi, type QuizQuestion, type BookChapter, ApiError } from "@/lib/api/client";
import { QuizMarkdown } from "@/lib/quiz/QuizMarkdown";

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "pick" | "chapters" | "loading" | "question" | "result";

const SUBJECT_META: Record<string, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  Maths: { icon: Brain, color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200" },
  "General Science": { icon: FlaskConical, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  "Computer Science": { icon: Monitor, color: "text-sky-600", bg: "bg-sky-50", border: "border-sky-200" },
};

const GRADE_SUBJECTS: Record<number, string[]> = {
  4: ["Maths", "General Science"],
  5: ["Maths", "General Science"],
  6: ["Maths", "General Science", "Computer Science"],
  7: ["Maths", "General Science", "Computer Science"],
  8: ["Maths", "General Science", "Computer Science"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function starLabel(n: number) {
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function QuizPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("pick");
  const [subject, setSubject] = useState<string>("");
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [chapterTopic, setChapterTopic] = useState<string>("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [timings, setTimings] = useState<number[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{ score_percent: number; num_correct: number; num_questions: number; stars_earned: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const qStartRef = useRef<number>(Date.now());
  const totalStartRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace(loginUrlFor());
  }, [authLoading, isAuthenticated, router]);

  const subjects = user ? (GRADE_SUBJECTS[user.grade] ?? ["Maths", "General Science"]) : [];

  // ── Pick subject → load chapters ──────────────────────────────────────────
  const pickSubject = useCallback(async (sub: string) => {
    setSubject(sub);
    setPhase("loading");
    setLoadError(null);
    try {
      const res = await quizApi.chapters(sub);
      setChapters(res.chapters);
    } catch {
      setChapters([]);
    }
    setPhase("chapters");
  }, []);

  // ── Start quiz from chat history (or fallback to general) ─────────────────
  const startQuizFromChat = useCallback(async (sub: string) => {
    setPhase("loading");
    setLoadError(null);
    setChapterTopic("Your Chat History");
    try {
      const res = await quizApi.generateFromChat(sub, 5);
      setChapterTopic(res.from_chat ? res.topic ?? "Your Chat History" : sub);
      setQuestions(res.questions);
      setAnswers([]);
      setTimings([]);
      setQIndex(0);
      setSelected(null);
      setRevealed(false);
      setSubmitResult(null);
      qStartRef.current = Date.now();
      totalStartRef.current = Date.now();
      setPhase("question");
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.detail : "Could not load questions. Please try again.");
      setPhase("chapters");
    }
  }, []);

  // ── Start quiz from chapter ───────────────────────────────────────────────
  const startQuiz = useCallback(async (sub: string, chapterNumber?: number, chapterTitle?: string) => {
    setPhase("loading");
    setLoadError(null);
    setChapterTopic(chapterTitle ?? sub);
    try {
      const res = await quizApi.generate(sub, 5, undefined, chapterNumber);
      setQuestions(res.questions);
      setAnswers([]);
      setTimings([]);
      setQIndex(0);
      setSelected(null);
      setRevealed(false);
      setSubmitResult(null);
      qStartRef.current = Date.now();
      totalStartRef.current = Date.now();
      setPhase("question");
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.detail : "Could not load questions. Please try again.");
      setPhase("chapters");
    }
  }, []);

  // ── Choose an answer ───────────────────────────────────────────────────────
  const choose = useCallback((option: string) => {
    if (revealed) return;
    setSelected(option);
    setRevealed(true);
  }, [revealed]);

  // ── Next question / finish ─────────────────────────────────────────────────
  const advance = useCallback(async () => {
    const elapsed = (Date.now() - qStartRef.current) / 1000;
    const newAnswers = [...answers, selected ?? ""];
    const newTimings = [...timings, elapsed];

    if (qIndex + 1 < questions.length) {
      setAnswers(newAnswers);
      setTimings(newTimings);
      setQIndex((i) => i + 1);
      setSelected(null);
      setRevealed(false);
      qStartRef.current = Date.now();
    } else {
      // Submit quiz
      setSubmitting(true);
      try {
        const totalTime = (Date.now() - totalStartRef.current) / 1000;
        const res = await quizApi.submit({
          subject,
          questions,
          answers: newAnswers,
          time_per_question: newTimings,
          total_time: totalTime,
        });
        setSubmitResult(res);
        setAnswers(newAnswers);
        setTimings(newTimings);
        setPhase("result");
      } catch (err) {
        console.error("Submit failed", err);
        setPhase("result");
        setSubmitResult({
          score_percent: 0,
          num_correct: 0,
          num_questions: questions.length,
          stars_earned: 1,
        });
      } finally {
        setSubmitting(false);
      }
    }
  }, [answers, timings, qIndex, questions, selected, subject]);

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
        <div className="mx-auto max-w-2xl">

          {/* Back button */}
          <button
            onClick={() => {
            if (phase === "pick") router.push("/dashboard");
            else if (phase === "chapters") { setPhase("pick"); setLoadError(null); }
            else if (phase === "question" || phase === "loading") setPhase("chapters");
            else setPhase("chapters");
          }}
            className="mb-8 flex items-center gap-2 text-sm text-deep-soft hover:text-deep transition-colors"
          >
            <ArrowLeft size={16} />
            {phase === "pick" ? "Back to Dashboard" : phase === "chapters" ? "Choose different subject" : "Back to chapters"}
          </button>

          <AnimatePresence mode="wait">

            {/* ── PICK SUBJECT ───────────────────────────────────────────── */}
            {phase === "pick" && (
              <motion.div
                key="pick"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-10">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-lg mb-4">
                    <Trophy size={32} className="text-white" />
                  </div>
                  <h1 className="font-display text-3xl font-extrabold text-deep">Quiz Time!</h1>
                  <p className="mt-2 text-deep-soft">
                    Grade {user?.grade} · Pick a subject and test your knowledge
                  </p>
                </div>

                {loadError && (
                  <div className="mb-6 rounded-2xl bg-rose-50 border border-rose-200 px-5 py-4 text-sm text-rose-700 text-center">
                    {loadError}
                  </div>
                )}

                <div className="space-y-4">
                  {subjects.map((sub, i) => {
                    const meta = SUBJECT_META[sub] ?? { icon: BookOpen, color: "text-deep", bg: "bg-glacier-50", border: "border-glacier-200" };
                    const Icon = meta.icon;
                    return (
                      <motion.button
                        key={sub}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        onClick={() => pickSubject(sub)}
                        className={`w-full flex items-center gap-4 rounded-2xl border-2 ${meta.border} ${meta.bg} px-6 py-5 text-left shadow-sm hover:shadow-md transition-all hover:scale-[1.02] active:scale-[0.99]`}
                      >
                        <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm ${meta.color}`}>
                          <Icon size={24} />
                        </div>
                        <div className="flex-1">
                          <div className={`font-display text-lg font-bold ${meta.color}`}>{sub}</div>
                          <div className="text-sm text-deep-soft">5 questions · Grade {user?.grade}</div>
                        </div>
                        <ChevronRight size={20} className="text-deep-soft" />
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ── CHAPTER PICKER ──────────────────────────────────────────── */}
            {phase === "chapters" && (
              <motion.div
                key="chapters"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                {(() => {
                  const meta = SUBJECT_META[subject] ?? { icon: BookOpen, color: "text-glacier-600", bg: "bg-glacier-50", border: "border-glacier-200" };
                  const Icon = meta.icon;
                  return (
                    <>
                      <div className="text-center mb-8">
                        <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${meta.bg} border-2 ${meta.border} mb-3`}>
                          <Icon size={26} className={meta.color} />
                        </div>
                        <h2 className="font-display text-2xl font-extrabold text-deep">{subject}</h2>
                        <p className="mt-1 text-sm text-deep-soft">Choose a chapter or quiz from your previous chat</p>
                      </div>

                      {loadError && (
                        <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 text-center">{loadError}</div>
                      )}

                      <div className="space-y-3">
                        {/* Previous Chat option */}
                        <motion.button
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={() => startQuizFromChat(subject)}
                          className="w-full flex items-center gap-4 rounded-2xl border-2 border-violet-200 bg-violet-50 px-5 py-4 text-left hover:bg-violet-100 hover:border-violet-300 transition-all hover:scale-[1.01]"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 flex-shrink-0">
                            <Trophy size={20} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-display font-bold text-violet-700">From Previous Chat</div>
                            <div className="text-xs text-violet-500">Questions based on what you studied in chat</div>
                          </div>
                          <ChevronRight size={18} className="text-violet-400 flex-shrink-0" />
                        </motion.button>

                        {/* Divider */}
                        {chapters.length > 0 && (
                          <div className="flex items-center gap-3 py-1">
                            <div className="flex-1 h-px bg-glacier-100" />
                            <span className="text-xs text-deep-soft">or pick a chapter</span>
                            <div className="flex-1 h-px bg-glacier-100" />
                          </div>
                        )}

                        {/* Chapter list */}
                        {chapters.map((ch, i) => (
                          <motion.button
                            key={ch.number}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 + i * 0.04 }}
                            onClick={() => startQuiz(subject, ch.number, ch.title)}
                            className={`w-full flex items-center gap-4 rounded-2xl border-2 ${meta.border} ${meta.bg} px-5 py-4 text-left hover:opacity-90 hover:scale-[1.01] transition-all`}
                          >
                            <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm text-sm font-extrabold ${meta.color} flex-shrink-0`}>
                              {ch.number}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`font-semibold text-sm ${meta.color} truncate`}>{ch.title}</div>
                              <div className="text-xs text-deep-soft">Chapter {ch.number} · 5 questions</div>
                            </div>
                            <ChevronRight size={16} className="text-deep-soft flex-shrink-0" />
                          </motion.button>
                        ))}

                        {chapters.length === 0 && (
                          <p className="text-center text-sm text-deep-soft py-4">No chapters found for this subject.</p>
                        )}
                      </div>
                    </>
                  );
                })()}
              </motion.div>
            )}

            {/* ── LOADING ─────────────────────────────────────────────────── */}
            {phase === "loading" && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-32 gap-4"
              >
                <Loader2 size={40} className="text-sky-500 animate-spin" />
                <p className="text-deep-soft font-medium">Preparing your {chapterTopic || subject} quiz…</p>
              </motion.div>
            )}

            {/* ── QUESTION ────────────────────────────────────────────────── */}
            {phase === "question" && questions[qIndex] && (
              <motion.div
                key={`q-${qIndex}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3 }}
              >
                <QuestionCard
                  q={questions[qIndex]}
                  index={qIndex}
                  total={questions.length}
                  subject={subject}
                  selected={selected}
                  revealed={revealed}
                  submitting={submitting}
                  isLast={qIndex + 1 === questions.length}
                  onChoose={choose}
                  onNext={advance}
                />
              </motion.div>
            )}

            {/* ── RESULT ──────────────────────────────────────────────────── */}
            {phase === "result" && submitResult && (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <ResultScreen
                  subject={chapterTopic || subject}
                  result={submitResult}
                  questions={questions}
                  answers={answers}
                  onRetry={() => setPhase("chapters")}
                  onPick={() => setPhase("pick")}
                  onAnalytics={() => router.push("/analytics")}
                />
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
      <Footer />
    </main>
  );
}

// ─── QuestionCard ─────────────────────────────────────────────────────────────
function QuestionCard({
  q, index, total, subject, selected, revealed, submitting, isLast,
  onChoose, onNext,
}: {
  q: QuizQuestion;
  index: number;
  total: number;
  subject: string;
  selected: string | null;
  revealed: boolean;
  submitting: boolean;
  isLast: boolean;
  onChoose: (o: string) => void;
  onNext: () => void;
}) {
  const meta = SUBJECT_META[subject] ?? { icon: BookOpen, color: "text-glacier-600", bg: "bg-glacier-50", border: "border-glacier-200" };

  return (
    <div className="rounded-3xl bg-white/90 border border-glacier-100 shadow-xl px-6 py-7">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-deep-soft mb-2">
          <span>Question {index + 1} of {total}</span>
          <span className={meta.color}>{subject}</span>
        </div>
        <div className="h-2 rounded-full bg-glacier-100 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-500"
            initial={{ width: `${(index / total) * 100}%` }}
            animate={{ width: `${((index + 1) / total) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      {/* Question text */}
      <QuizMarkdown text={q.question} size="lg" className="mb-6 text-deep" />

      {/* Options */}
      <div className="space-y-3 mb-6">
        {q.options.map((opt, i) => {
          const isCorrect = opt === q.correct;
          const isSelected = opt === selected;
          let cls = "border-glacier-200 bg-white hover:bg-glacier-50 hover:border-glacier-300 cursor-pointer";
          if (revealed) {
            if (isCorrect) cls = "border-emerald-400 bg-emerald-50 cursor-default";
            else if (isSelected) cls = "border-rose-400 bg-rose-50 cursor-default";
            else cls = "border-glacier-100 bg-glacier-50/50 opacity-60 cursor-default";
          }
          return (
            <motion.button
              key={i}
              whileHover={revealed ? {} : { scale: 1.01 }}
              whileTap={revealed ? {} : { scale: 0.99 }}
              onClick={() => onChoose(opt)}
              className={`w-full flex items-center gap-3 rounded-2xl border-2 px-5 py-4 text-left transition-all ${cls}`}
            >
              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold
                ${revealed && isCorrect ? "bg-emerald-400 text-white" : revealed && isSelected ? "bg-rose-400 text-white" : "bg-glacier-100 text-glacier-600"}`}>
                {["A", "B", "C", "D"][i]}
              </span>
                <span className="flex-1 text-sm font-medium text-deep">
                  <QuizMarkdown text={opt} size="sm" />
                </span>
              {revealed && isCorrect && <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />}
              {revealed && isSelected && !isCorrect && <XCircle size={18} className="text-rose-500 flex-shrink-0" />}
            </motion.button>
          );
        })}
      </div>

      {/* Explanation (shown after answer) */}
      <AnimatePresence>
        {revealed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <div className={`rounded-2xl px-5 py-4 border ${selected === q.correct ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
              <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${selected === q.correct ? "text-emerald-600" : "text-amber-600"}`}>
                {selected === q.correct ? "Correct! 🎉" : (
                  <>Not quite! The correct answer is: <QuizMarkdown text={q.correct} size="sm" className="inline" /></>
                )}
              </div>
              <QuizMarkdown text={q.explanation} size="sm" className="text-deep" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next button */}
      {revealed && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onNext}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-600 py-4 font-display font-bold text-white shadow-md hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.99] disabled:opacity-60"
        >
          {submitting ? (
            <><Loader2 size={18} className="animate-spin" /> Saving…</>
          ) : isLast ? (
            <><Trophy size={18} /> See my results!</>
          ) : (
            <>Next question <ChevronRight size={18} /></>
          )}
        </motion.button>
      )}
    </div>
  );
}

// ─── ResultScreen ─────────────────────────────────────────────────────────────
function ResultScreen({
  subject, result, questions, answers, onRetry, onPick, onAnalytics,
}: {
  subject: string;
  result: { score_percent: number; num_correct: number; num_questions: number; stars_earned: number };
  questions: QuizQuestion[];
  answers: string[];
  onRetry: () => void;
  onPick: () => void;
  onAnalytics: () => void;
}) {
  const pct = result.score_percent;
  const grade = pct >= 90 ? "Amazing! 🏆" : pct >= 70 ? "Great job! 🌟" : pct >= 50 ? "Good effort! 💪" : "Keep trying! 🌱";
  const gradeColor = pct >= 90 ? "text-amber-500" : pct >= 70 ? "text-emerald-500" : pct >= 50 ? "text-glacier-500" : "text-rose-500";

  return (
    <div className="rounded-3xl bg-white/90 border border-glacier-100 shadow-xl px-6 py-8">
      {/* Score circle */}
      <div className="flex flex-col items-center mb-8">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-glacier-100 to-mint-100 shadow-inner mb-4"
        >
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="#e2f0f9" strokeWidth="8" />
            <motion.circle
              cx="50" cy="50" r="44" fill="none"
              stroke={pct >= 70 ? "#34d399" : pct >= 50 ? "#60a5fa" : "#f87171"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 44}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 44 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 44 * (1 - pct / 100) }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          </svg>
          <span className="relative text-2xl font-extrabold text-deep">{Math.round(pct)}%</span>
        </motion.div>
        <h2 className={`font-display text-2xl font-extrabold ${gradeColor}`}>{grade}</h2>
        <p className="text-deep-soft mt-1">
          {result.num_correct} out of {result.num_questions} correct · {subject}
        </p>
        {/* Stars */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-3 flex items-center gap-1"
        >
          {Array.from({ length: 5 }, (_, i) => (
            <motion.span
              key={i}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.7 + i * 0.1, type: "spring", stiffness: 300 }}
            >
              <Star
                size={24}
                className={i < result.stars_earned ? "text-amber-400 fill-amber-400" : "text-glacier-200 fill-glacier-100"}
              />
            </motion.span>
          ))}
        </motion.div>
        <p className="text-xs text-deep-soft mt-1">+{result.stars_earned} stars earned</p>
      </div>

      {/* Question review */}
      <div className="mb-8 space-y-3">
        <h3 className="font-display text-sm font-bold text-deep uppercase tracking-wide">Review</h3>
        {questions.map((q, i) => {
          const correct = answers[i] === q.correct;
          return (
            <div key={i} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${correct ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50"}`}>
              {correct
                ? <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                : <XCircle size={18} className="text-rose-500 mt-0.5 flex-shrink-0" />}
              <div className="min-w-0 flex-1">
                <QuizMarkdown text={q.question} size="sm" className="text-deep font-medium break-words" />
                {!correct && (
                  <p className="text-xs text-deep-soft mt-1 break-words">
                    Your answer: <span className="text-rose-600">{answers[i] || "—"}</span>
                    {" · "}Correct: <span className="text-emerald-600">{q.correct}</span>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 gap-3">
        <button
          onClick={onRetry}
          className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-600 py-4 font-display font-bold text-white shadow-md hover:shadow-lg transition-all hover:scale-[1.01]"
        >
          <RotateCcw size={18} /> Try again
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onPick}
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-glacier-200 bg-glacier-50 py-3 font-semibold text-sm text-glacier-600 hover:bg-glacier-100 transition-all"
          >
            <BookOpen size={16} /> New subject
          </button>
          <button
            onClick={onAnalytics}
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-violet-50 py-3 font-semibold text-sm text-violet-600 hover:bg-violet-100 transition-all"
          >
            <Sparkles size={16} /> My progress
          </button>
        </div>
      </div>
    </div>
  );
}
