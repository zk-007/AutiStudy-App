"use client";

/**
 * /classroom — Blackboard Animated Tutor v1
 *
 * Replaces the chat-bubble UX with:
 *   - Animated teacher + chalk blackboard
 *   - Type or speak to ask questions
 *   - "Samajh nahi aayi" → erase + re-teach with new visuals
 *
 * Dashboard links here; legacy /chat is untouched.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  RotateCcw,
  HelpCircle,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { Caveat } from "next/font/google";
import { NavBar } from "@/components/layout/NavBar";
import { Blackboard } from "@/components/classroom/Blackboard";
import { TeacherAvatar } from "@/components/classroom/TeacherAvatar";
import { ClassroomInput } from "@/components/classroom/ClassroomInput";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { loginUrlFor } from "@/lib/auth/redirect";
import { useClassroomLesson } from "@/lib/hooks/useClassroomLesson";
import { userApi, type Subject } from "@/lib/api/client";
import type { InputMode } from "@/lib/classroom/types";

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-chalk",
});

const DEFAULT_SUBJECTS: Subject[] = [
  { name: "Maths", icon: "🔢", grade: 4, last_studied: null },
  { name: "General Science", icon: "🔬", grade: 4, last_studied: null },
  { name: "English", icon: "📖", grade: 4, last_studied: null },
  { name: "Urdu", icon: "📚", grade: 4, last_studied: null },
];

function ClassroomContent() {
  const router = useRouter();
  const params = useSearchParams();
  const subjectParam = params.get("subject");
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { locale } = useLocale();

  const [subject, setSubject] = useState(subjectParam || "");
  const [subjects, setSubjects] = useState<Subject[]>(DEFAULT_SUBJECTS);
  const [inputMode, setInputMode] = useState<InputMode>("type");
  const [loading, setLoading] = useState(false);

  const {
    lesson,
    phase,
    error,
    playing,
    eraseSignal,
    retryCount,
    teacherTalking,
    teacherMessage,
    askQuestion,
    retryLesson,
    reset,
    onBoardComplete,
  } = useClassroomLesson(subject || "Maths", locale === "ur" ? "ur" : "en");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace(loginUrlFor());
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    userApi.subjects().then(setSubjects).catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (subjectParam) setSubject(subjectParam);
  }, [subjectParam]);

  const handleAsk = useCallback(
    async (question: string) => {
      if (!subject) return;
      setLoading(true);
      try {
        await askQuestion(question, inputMode);
      } finally {
        setLoading(false);
      }
    },
    [subject, inputMode, askQuestion],
  );

  const handleRetry = useCallback(async () => {
    setLoading(true);
    try {
      await retryLesson();
    } finally {
      setLoading(false);
    }
  }, [retryLesson]);

  const teacherState =
    teacherTalking
      ? "talking"
      : phase === "playing"
        ? "pointing"
        : phase === "loading"
          ? "listening"
          : "idle";

  const inputLocked = loading || phase === "loading" || phase === "playing" || phase === "asking";

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-glacier-500" size={36} />
      </div>
    );
  }

  // Subject picker when no subject chosen
  if (!subject) {
    return (
      <div className={`min-h-screen ${caveat.variable}`}>
        <NavBar />
        <main className="max-w-4xl mx-auto px-4 py-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <h1 className="font-display text-3xl font-extrabold text-deep">
              Blackboard Classroom
            </h1>
            <p className="mt-2 text-deep-soft">
              Pick a subject — your animated teacher will draw on the chalkboard.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subjects.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  setSubject(s.name);
                  router.replace(`/classroom?subject=${encodeURIComponent(s.name)}`);
                }}
                className="rounded-3xl glass-strong p-6 text-left shadow-soft hover:shadow-deep transition-shadow group"
              >
                <span className="text-4xl">{s.icon}</span>
                <h3 className="mt-3 font-display text-xl font-bold text-deep">{s.name}</h3>
                <p className="text-sm text-deep-soft mt-1">Chalkboard lessons</p>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${caveat.variable}`} style={{ fontFamily: "var(--font-inter)" }}>
      <NavBar />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-sm text-deep-soft hover:text-deep"
          >
            <ArrowLeft size={16} />
            Dashboard
          </button>
          <div className="flex items-center gap-2 text-sm font-semibold text-deep">
            <BookOpen size={16} className="text-glacier-500" />
            {subject}
            {lesson?.title ? (
              <span className="text-deep-soft font-normal">— {lesson.title}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              setSubject("");
              router.replace("/classroom");
            }}
            className="flex items-center gap-1.5 text-sm text-deep-soft hover:text-deep"
          >
            <RotateCcw size={14} />
            New subject
          </button>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-rose-700 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : null}

        <p className="text-xs text-deep-soft">
          <Link href="/classroom/demo" className="text-glacier-600 hover:underline">
            Step 1: Inka-style slide demo (beta)
          </Link>
          {" — "}pehle yahan test karo, phir main classroom improve karenge.
        </p>

        {/* Teacher + Board */}
        <div className="grid grid-cols-1 lg:grid-cols-[140px_1fr] gap-4 items-start">
          <TeacherAvatar state={teacherState} message={teacherMessage} className="hidden lg:flex" />
          <div>
            <TeacherAvatar state={teacherState} message={teacherMessage} className="lg:hidden mb-3" />
            {phase === "loading" && !lesson ? (
              <div className="rounded-2xl bg-[#1a3d2e] aspect-[5/3] flex items-center justify-center">
                <div className="text-center text-white/80">
                  <Loader2 className="animate-spin mx-auto mb-2" size={32} />
                  <p className="text-sm">Preparing your lesson...</p>
                </div>
              </div>
            ) : lesson ? (
              <Blackboard
                steps={lesson.steps}
                playing={playing}
                eraseSignal={eraseSignal}
                onComplete={onBoardComplete}
              />
            ) : (
              <div className="rounded-2xl border-4 border-[#3d2817] bg-gradient-to-br from-[#1a3d2e] to-[#0f261c] aspect-[5/3] flex items-center justify-center">
                <p className="text-white/50 text-lg" style={{ fontFamily: "var(--font-chalk), cursive" }}>
                  Ask a question to start...
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <ClassroomInput
          mode={inputMode}
          onModeChange={setInputMode}
          onSubmit={handleAsk}
          disabled={inputLocked}
          loading={loading}
          placeholder={`Ask anything about ${subject}...`}
        />

        {/* Teacher asks: samajh aayi? — buttons appear after lesson + voice check */}
        {lesson && phase === "finished" && !loading ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3"
          >
            <p className="text-sm font-bold text-deep">
              Samajh aayi? Did you understand?
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={() => {
                reset();
              }}
              className="flex items-center gap-2 rounded-full bg-emerald-500 text-white px-5 py-2.5 font-bold shadow-soft hover:bg-emerald-600"
            >
              <CheckCircle2 size={18} />
              Samajh aa gayi — naya sawal
            </button>
            <button
              type="button"
              onClick={handleRetry}
              disabled={retryCount >= 3}
              className="flex items-center gap-2 rounded-full bg-amber-500 text-white px-5 py-2.5 font-bold shadow-soft hover:bg-amber-600 disabled:opacity-50"
            >
              <HelpCircle size={18} />
              Samajh nahi aayi — dobara samjhao
              {retryCount > 0 ? ` (${retryCount}/3)` : ""}
            </button>
            </div>
          </motion.div>
        ) : null}

        {user ? (
          <p className="text-center text-xs text-deep-soft/60">
            Grade {user.grade} · Scene Planner v1
            {lesson?.diagram_used ? ` · ${lesson.diagram_used}` : ""}
            {lesson?.teaching_style ? ` · ${lesson.teaching_style}` : ""}
            {retryCount > 0 ? ` · retry ${retryCount}` : ""}
          </p>
        ) : null}
      </main>
    </div>
  );
}

export default function ClassroomPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin text-glacier-500" size={36} />
        </div>
      }
    >
      <ClassroomContent />
    </Suspense>
  );
}
