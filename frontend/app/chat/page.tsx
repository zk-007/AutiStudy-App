"use client";

/**
 * /chat — the AI tutor conversation page.
 *
 * The page handles three states with a single component, keyed off URL params:
 *
 *   1. Picker      — no `?session` and no `?subject`. Show subject buttons so
 *                    the student can pick what to learn next.
 *   2. Bootstrap   — `?subject=Maths`. Create a new session on the backend,
 *                    then redirect to `?session=<id>` (single round-trip,
 *                    no flash of empty state).
 *   3. Conversation — `?session=<id>`. Load the session's history, render
 *                    bubbles, allow sending new messages.
 *
 * All three states share the same layout shell so the transition between
 * picker → conversation feels like one calm page, not a hard navigation.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  Send,
  Sparkles,
  AlertCircle,
  BookOpenCheck,
  Loader2,
  Trophy,
  CheckCircle2,
  XCircle,
  ChevronRight,
  X,
  Star,
  RotateCcw,
  ClipboardList,
} from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useSettings } from "@/lib/settings/SettingsContext";
import { useAdaptiveTutorAgent, getCameraConsent, setCameraConsent, containsConfusion } from "@/lib/hooks/useAdaptiveTutorAgent";
import type { PolicyResult } from "@/lib/agent/ComprehensionStateMachine";
import type { AgentActionPayload } from "@/lib/agent/mediaAgentTypes";
import { resolveAgentContent, resolveSideEffects } from "@/lib/agent/mediaAgentTools";
import { AdaptiveAgentPanel } from "@/components/agent/AdaptiveAgentPanel";
import { CameraConsentModal } from "@/components/agent/CameraConsentModal";
import { UnderstandingCheck } from "@/components/agent/UnderstandingCheck";
import { BreathingModal } from "@/components/agent/BreathingModal";
import { StepMcqPanel } from "@/components/agent/StepMcqPanel";
import { useComprehensionFlow } from "@/lib/hooks/useComprehensionFlow";
import { shouldShowComprehensionPopup } from "@/lib/agent/comprehensionGate";
import { playTtsAudio } from "@/lib/audio/playTtsAudio";
import { loginUrlFor } from "@/lib/auth/redirect";
import { QuizMarkdown } from "@/lib/quiz/QuizMarkdown";
import {
  chatApi,
  quizApi,
  userApi,
  ApiError,
  resolveImageUrl,
  type ChatConfig,
  type ChatSession,
  type ChatMessage,
  type Subject,
  type QuizQuestion,
  type SessionRecapResponse,
} from "@/lib/api/client";

export default function ChatPage() {
  // Suspense boundary needed because useSearchParams is read here.
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center text-deep-soft">
          Loading…
        </main>
      }
    >
      <ChatInner />
    </Suspense>
  );
}

function ChatInner() {
  const search = useSearchParams();
  const router = useRouter();
  const { t, locale } = useLocale();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();

  const sessionId = search?.get("session") ?? null;
  const subjectParam = search?.get("subject") ?? null;

  // ── Route guard. Bounce non-authenticated users to /login, but preserve
  //    the chat URL (e.g. ?session=abc123) via a `?next=` param so they
  //    land back on the same conversation after signing in.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace(loginUrlFor());
    }
  }, [authLoading, isAuthenticated, router]);

  // ── Bootstrap a session when ?subject=X but no ?session. ─────────────────
  //
  // We use a ref-guard so we only call POST /api/chat/sessions ONCE, even
  // when React 18's StrictMode double-invokes effects in development.
  // Without this guard the API would create two sessions per link click,
  // polluting chats.json and occasionally racing on file writes.
  //
  // We deliberately do NOT abort the navigation in the cleanup — the ref
  // guard already ensures only one request is in flight, so the navigate
  // should always be honoured (otherwise the page gets stuck on the
  // bootstrap URL when StrictMode tears down→remounts).
  const bootstrapAttempted = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthenticated || sessionId || !subjectParam) return;
    if (bootstrapAttempted.current === subjectParam) return;
    bootstrapAttempted.current = subjectParam;

    chatApi
      .create(subjectParam, locale === "ur" ? "ur" : "en")
      .then((created) => router.replace(`/chat?session=${created.id}`))
      .catch((err) => {
        console.error("Failed to start chat", err);
        bootstrapAttempted.current = null; // allow a manual retry
      });
  }, [isAuthenticated, sessionId, subjectParam, locale, router]);

  // ── Auth-gate UI ──────────────────────────────────────────────────────────
  if (authLoading || !isAuthenticated) {
    return (
      <main className="min-h-screen">
        <NavBar />
        <div className="flex items-center justify-center min-h-screen text-deep-soft animate-pulse">
          {t.pages.dashboard.loading}
        </div>
      </main>
    );
  }

  // ── Bootstrap state ────────────────────────────────────────────────────
  if (subjectParam && !sessionId) {
    return (
      <ChatShell>
        <CenteredMessage text={t.pages.chat.creating} />
      </ChatShell>
    );
  }

  // ── Picker state ───────────────────────────────────────────────────────
  if (!sessionId) {
    return (
      <ChatShell>
        <SubjectPicker grade={user?.grade ?? 4} />
      </ChatShell>
    );
  }

  // ── Conversation state ─────────────────────────────────────────────────
  return (
    <ChatShell>
      <Conversation sessionId={sessionId} />
    </ChatShell>
  );
}

// ─── Layout shell ───────────────────────────────────────────────────────────

function ChatShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen flex flex-col">
      <NavBar />
      {/* pr-72 gives room for the 256px (w-64) agent panel on the right */}
      <div className="flex-1 flex flex-col px-4 md:px-6 pt-24 pb-6 pr-4 md:pr-72">
        <div className="mx-auto w-full max-w-3xl flex-1 flex flex-col">
          {children}
        </div>
      </div>
    </main>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex items-center gap-3 text-deep-soft">
        <span className="inline-block w-3 h-3 rounded-full bg-glacier-400 animate-pulse" />
        <span>{text}</span>
      </div>
    </div>
  );
}

// ─── Subject picker (shown when no ?subject and no ?session) ───────────────

function SubjectPicker({ grade }: { grade: number }) {
  const { t } = useLocale();
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    userApi
      .subjects()
      .then((data) => {
        if (!cancelled) setSubjects(data);
      })
      .catch(() => {
        if (!cancelled) setError(t.auth.errors.generic);
      });
    return () => {
      cancelled = true;
    };
  }, [t.auth.errors.generic]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex-1 flex flex-col items-center justify-center text-center"
    >
      <div className="rounded-3xl glass-strong p-10 md:p-14 shadow-soft max-w-2xl w-full">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-glacier-200 to-glacier-300 text-deep mb-5">
          <BookOpenCheck size={26} />
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-extrabold text-deep">
          {t.pages.chat.pickSubjectTitle}
        </h1>
        <p className="mt-3 text-deep-soft">
          {t.pages.chat.pickSubjectSub} ({t.pages.dashboard.gradeLabel} {grade})
        </p>

        {error && (
          <div className="mt-5 text-sm text-rose-600 flex items-center justify-center gap-1.5">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {subjects === null
            ? [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-2xl bg-glacier-100/70 animate-pulse"
                />
              ))
            : subjects.map((s) => (
                <button
                  key={s.name}
                  onClick={() => router.push(`/chat?subject=${encodeURIComponent(s.name)}`)}
                  className="group flex items-center gap-4 rounded-2xl glass-strong border border-white/40 p-5 text-left hover:shadow-deep transition-all hover:-translate-y-0.5"
                >
                  <span className="text-3xl" aria-hidden>
                    {s.icon}
                  </span>
                  <span className="font-display text-lg font-extrabold text-deep">
                    {s.name}
                  </span>
                </button>
              ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Conversation (the actual tutor chat) ──────────────────────────────────

const ADAPTATION_STUB_PREFIXES = [
  "let me read this out loud",
  "here's a picture to help",
  "did you understand",
  "great job",
  "well done",
  "let's take a breath",
];

/** Index of the tutor's main answer — skip adaptation-ladder stub bubbles. */
function findTutorAnswerIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const text = m.content?.trim() ?? "";
    if (text.length < 60) continue;
    const lower = text.toLowerCase();
    if (ADAPTATION_STUB_PREFIXES.some((s) => lower.startsWith(s))) continue;
    return i;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return i;
  }
  return messages.length - 1;
}

function Conversation({ sessionId }: { sessionId: string }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<ChatConfig | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Multimedia state — kept separate from sending so users can keep typing
  // while an image renders or audio loads.
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const answerEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Chat quiz state ───────────────────────────────────────────────────────
  const [chatQuizOpen, setChatQuizOpen] = useState(false);
  const [chatQuizLoading, setChatQuizLoading] = useState(false);
  const [chatQuizError, setChatQuizError] = useState<string | null>(null);
  const [chatQuizData, setChatQuizData] = useState<{
    questions: QuizQuestion[];
    topic_summary: string;
    subject: string;
  } | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);
  const [recapData, setRecapData] = useState<SessionRecapResponse | null>(null);

  // ── Adaptive Tutor Agent (NEW — real-time, probability-based) ────────────
  // Use refs for values that feed into learningSignals to avoid circular deps
  const [lastMsgTime, setLastMsgTime] = useState(Date.now());
  const [repeatedQCount, setRepeatedQCount] = useState(0);
  const agentAttemptsRef = useRef(0);  // avoids circular ref: adaptiveState → useMemo → hook
  const lastUserQRef = useRef("");
  const sessionRef = useRef(session);
  const onGenerateImageRef = useRef<(() => void) | null>(null);
  const onSpeakRef = useRef<((index: number, text: string) => Promise<void>) | null>(null);
  const speakForFlowRef = useRef<((text: string) => Promise<void>) | null>(null);
  const imageBusyRef = useRef(false);
  const sendingRef = useRef(false);
  const speakingIndexRef = useRef<number | null>(null);
  const ttsAutoReadRef = useRef(settings.ttsAutoRead);

  sessionRef.current = session;
  ttsAutoReadRef.current = settings.ttsAutoRead;
  imageBusyRef.current = imageBusy;
  sendingRef.current = sending;
  speakingIndexRef.current = speakingIndex;

  /** Resolve text to read aloud for voice-aid tools. */
  const getVoiceText = useCallback((
    payload: AgentActionPayload,
    content: string,
    messages: ChatMessage[],
  ): string => {
    if (
      payload.localAction === "USE_VOICE_AID" ||
      payload.tool === "speak_aloud"
    ) {
      const prior = messages.filter((m) => m.role === "assistant");
      // Read the last substantive explanation, not the short intro stub
      for (let i = prior.length - 1; i >= 0; i--) {
        const text = prior[i]?.content ?? "";
        if (text.length > 80) return text;
      }
      return prior[prior.length - 1]?.content ?? content;
    }
    return content;
  }, []);

  const executeAgentTool = useCallback((
    _decision: PolicyResult,
    payload?: AgentActionPayload,
  ) => {
    if (!payload) return;
    const content = resolveAgentContent(payload);
    if (!content) return;

    agentAttemptsRef.current += 1;
    const priorMessages = sessionRef.current?.messages ?? [];

    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: [
          ...prev.messages,
          {
            role: "assistant" as const,
            content,
            timestamp: new Date().toISOString(),
            image_url: null,
          },
        ],
      };
    });

    const effects = resolveSideEffects(payload);
    if (effects.triggerImage && !imageBusyRef.current && !sendingRef.current) {
      setTimeout(() => onGenerateImageRef.current?.(), 500);
    }
    if (
      effects.triggerVoice &&
      ttsAutoReadRef.current &&
      speakingIndexRef.current === null &&
      !sendingRef.current
    ) {
      const voiceText = getVoiceText(payload, content, priorMessages);
      setTimeout(() => onSpeakRef.current?.(-1, voiceText), 700);
    }
  }, [getVoiceText]);

  // agentLearningSignals is declared BEFORE useAdaptiveTutorAgent
  // and uses agentAttemptsRef (not adaptiveState) to avoid TDZ
  const agentLearningSignals = useMemo(() => {
    const msgs = session?.messages ?? [];
    const userMsgs = msgs.filter((m) => m.role === "user");
    const asstMsgs = msgs.filter((m) => m.role === "assistant");
    const lastQ = userMsgs[userMsgs.length - 1]?.content ?? "";
    const lastA = asstMsgs[asstMsgs.length - 1]?.content ?? "";
    return {
      secondsSinceLastMessage: Math.round((Date.now() - lastMsgTime) / 1000),
      repeatedQuestionCount: repeatedQCount,
      wrongAnswerStreak: 0,
      currentTopicDifficulty: 2,
      messageContainsConfusion: containsConfusion(lastQ),
      consecutiveAgentAttempts: agentAttemptsRef.current,
      lastUserMessageText: lastQ.slice(0, 300),
      lastTutorAnswerText: lastA.slice(0, 500),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.messages, lastMsgTime, repeatedQCount]);

  const {
    state: adaptiveState,
    videoRef: agentVideoRef,
    startCamera: agentStartCamera,
    stopCamera: agentStopCamera,
    onStudentNewMessage: agentOnStudentNewMessage,
    submitFeedback: agentSubmitFeedback,
    onStudentUnderstood: agentOnUnderstood,
    getPreferredFormat: agentGetPreferredFormat,
  } = useAdaptiveTutorAgent({
    sessionId,
    currentTopic: session?.subject ?? "",
    learningSignals: agentLearningSignals,
    onAction: executeAgentTool,
    studentEmail: user?.email ?? "",
  });

  // ── Comprehension flow callbacks (popup ladder) ───────────────────────────
  const appendAssistantMessage = useCallback((content: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: [
          ...prev.messages,
          {
            role: "assistant" as const,
            content,
            timestamp: new Date().toISOString(),
            image_url: null,
          },
        ],
      };
    });
  }, []);

  const comprehensionCallbacks = useMemo(
    () => ({
      onAppendMessage: appendAssistantMessage,
      onGenerateImage: async () => {
        await onGenerateImageRef.current?.();
      },
      onSpeak: (text: string) =>
        speakForFlowRef.current?.(text) ?? Promise.resolve(),
    }),
    [appendAssistantMessage],
  );

  const lastUserQuestion = useMemo(() => {
    const msgs = session?.messages ?? [];
    const userMsgs = msgs.filter((m) => m.role === "user");
    return userMsgs[userMsgs.length - 1]?.content ?? "";
  }, [session?.messages]);

  const lastAssistantAnswer = useMemo(() => {
    const msgs = session?.messages ?? [];
    const asst = msgs.filter((m) => m.role === "assistant");
    return asst[asst.length - 1]?.content ?? "";
  }, [session?.messages]);

  const {
    flow: comprehensionFlow,
    onAssistantAnswer: flowOnAssistantAnswer,
    onStudentQuestion: flowOnStudentQuestion,
    onPopupYes: flowOnPopupYes,
    onPopupNo: flowOnPopupNo,
    onAttemptSendWhileBlocked: flowOnAttemptBlocked,
    onBreathingComplete: flowOnBreathingComplete,
    onMcqAnswered: flowOnMcqAnswered,
  } = useComprehensionFlow({
    sessionId,
    subject: session?.subject ?? "General",
    studentEmail: user?.email ?? null,
    hybridScores: adaptiveState.teachingEmotion?.hybridScores ?? null,
    hybridDominant: adaptiveState.teachingEmotion?.hybridDominant ?? null,
    cameraEnabled: adaptiveState.cameraEnabled,
    lastQuestion: lastUserQuestion,
    lastAnswer: lastAssistantAnswer,
    messageCount: session?.messages.length ?? 0,
    scrollContainerRef: scrollRef,
    answerEndRef,
    callbacks: comprehensionCallbacks,
  });

  const inputBlocked =
    comprehensionFlow.blockInput ||
    comprehensionFlow.showPopup ||
    comprehensionFlow.pendingPopup ||
    comprehensionFlow.imageViewActive ||
    comprehensionFlow.mcqActive ||
    comprehensionFlow.showBreathing;

  // Lock page scroll while popup / MCQ / breathing is open (Problem 6)
  useEffect(() => {
    const lock =
      comprehensionFlow.showPopup ||
      comprehensionFlow.mcqActive ||
      comprehensionFlow.showBreathing ||
      chatQuizOpen;
    if (!lock) return;
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const scroller = scrollRef.current;
    const prevScroll = scroller?.style.overflow ?? "";
    if (scroller) scroller.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      if (scroller) scroller.style.overflow = prevScroll;
    };
  }, [
    comprehensionFlow.showPopup,
    comprehensionFlow.mcqActive,
    comprehensionFlow.showBreathing,
    chatQuizOpen,
  ]);

  const showComprehensionPopup =
    comprehensionFlow.showPopup &&
    !comprehensionFlow.mcqActive &&
    !sending &&
    (session?.messages.some((m) => m.role === "assistant") ?? false);

  // ── Camera consent flow ───────────────────────────────────────────────────
  const [consentModalOpen, setConsentModalOpen] = useState(false);

  useEffect(() => {
    const consent = getCameraConsent();
    if (consent === "granted") {
      agentStartCamera();
    } else if (consent === "pending") {
      const timer = setTimeout(() => setConsentModalOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConsentAllow = useCallback(async () => {
    setCameraConsent("granted");
    setConsentModalOpen(false);
    await agentStartCamera();
  }, [agentStartCamera]);

  const handleConsentDecline = useCallback(() => {
    setCameraConsent("denied");
    setConsentModalOpen(false);
  }, []);

  // ── Track user message timestamps for learning signals ────────────────────
  const prevMsgCount = useRef(0);
  useEffect(() => {
    const msgs = session?.messages ?? [];
    const userMsgs = msgs.filter((m) => m.role === "user");
    if (userMsgs.length > prevMsgCount.current) {
      prevMsgCount.current = userMsgs.length;
      setLastMsgTime(Date.now());
      const lastQ = userMsgs[userMsgs.length - 1]?.content ?? "";
      // Detect repeated question
      if (lastQ && lastQ.trim() === lastUserQRef.current.trim()) {
        setRepeatedQCount((c) => c + 1);
      } else {
        setRepeatedQCount(0);
      }
      lastUserQRef.current = lastQ;
    }
  }, [session?.messages]);

  // ── Popup after bot answer (scroll gate — not on every assistant stub) ───
  const flowOnAssistantAnswerRef = useRef(flowOnAssistantAnswer);
  flowOnAssistantAnswerRef.current = flowOnAssistantAnswer;

  const handleUnderstoodRef = useRef<(() => void) | null>(null);
  const handleNotUnderstoodRef = useRef<(() => void) | null>(null);

  // Load the session + tutor config in parallel on mount / id change.
  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setLoadError(null);
    Promise.all([chatApi.get(sessionId), chatApi.config()])
      .then(([s, cfg]) => {
        if (cancelled) return;
        setSession(s);
        setConfig(cfg);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError(t.pages.chat.notFound);
        } else {
          setLoadError(t.auth.errors.generic);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, t.pages.chat.notFound, t.auth.errors.generic]);

  // Stop any in-flight audio when the session changes or the user navigates.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [sessionId]);

  // Keep the message list scrolled to the bottom — except while waiting for read-to-end.
  useEffect(() => {
    if (!scrollRef.current) return;
    if (comprehensionFlow.pendingPopup && comprehensionFlow.popupGate === "scroll") return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.messages.length, sending, comprehensionFlow.pendingPopup, comprehensionFlow.popupGate]);

  const onSend = useCallback(
    async (overrideContent?: string) => {
      const content = (overrideContent ?? draft).trim();
      if (!content || sending || !session) return;

      if (inputBlocked || flowOnAttemptBlocked()) {
        return;
      }

      setSending(true);
      setSendError(null);

      // Optimistically push the user bubble so the UI feels instant.
      const optimistic: ChatMessage = {
        role: "user",
        content,
        timestamp: new Date().toISOString(),
        image_url: null,
      };
      setSession((prev) =>
        prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev,
      );
      setDraft("");

      try {
        const preferredFormat = agentGetPreferredFormat();
        const reply = await chatApi.send(sessionId, content, preferredFormat);
        const showComprehensionPopup = shouldShowComprehensionPopup(reply);
        setSession((prev) => {
          if (!prev) return prev;
          const next = [...prev.messages];
          if (reply.user_message) next[next.length - 1] = reply.user_message;
          next.push(reply.assistant_message);
          return {
            ...prev,
            messages: next,
            timestamp: reply.session.timestamp ?? prev.timestamp,
          };
        });
        // Always reset ladder state on a new Q&A; popup only for textbook content.
        flowOnStudentQuestion();
        if (showComprehensionPopup) {
          agentOnStudentNewMessage();
          flowOnAssistantAnswerRef.current();
          if (ttsAutoReadRef.current) {
            const text = reply.assistant_message.content?.trim();
            if (text) {
              setTimeout(() => speakForFlowRef.current?.(text), 400);
            }
          }
        }
      } catch (err) {
        // Roll back optimistic message and surface the error.
        setSession((prev) =>
          prev ? { ...prev, messages: prev.messages.slice(0, -1) } : prev,
        );
        setDraft(content);
        if (err instanceof ApiError) setSendError(err.detail);
        else setSendError(t.auth.errors.generic);
      } finally {
        setSending(false);
        textareaRef.current?.focus();
      }
    },
    [draft, sending, session, sessionId, t.auth.errors.generic, agentGetPreferredFormat, agentOnStudentNewMessage, flowOnStudentQuestion, flowOnAttemptBlocked, inputBlocked],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (inputBlocked) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        flowOnAttemptBlocked();
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  // ── Visual aid generation ─────────────────────────────────────────────────
  // The backend router decides whether to attach a DALL·E illustration
  // (countable arithmetic / concept questions) or a KaTeX step card
  // (fractions / decimals / algebra) — we just merge whichever payload comes
  // back into the right message. See `chat_engine.generate_visual_aid`.
  const onGenerateImage = useCallback(async () => {
    if (!session || imageBusy || sending) return;
    setImageBusy(true);
    setImageError(null);
    try {
      const result = await chatApi.generateVisualAid(sessionId);
      setSession((prev) => {
        if (!prev) return prev;
        const targetIndex = findTutorAnswerIndex(prev.messages);
        const next = prev.messages.map((m, i) => {
          if (i !== targetIndex) return m;
          const cleared = { image_url: null, math_steps: null, emoji_counting: null, factor_tree: null, fraction_bar: null, number_line: null, bar_chart: null, percentage_bar: null, times_table: null, geometry: null, ratio: null };
          if (result.kind === "image")         return { ...m, ...cleared, image_url: result.image_url };
          if (result.kind === "emoji_counting") return { ...m, ...cleared, emoji_counting: result.emoji_counting };
          if (result.kind === "factor_tree")    return { ...m, ...cleared, factor_tree: result.factor_tree };
          if (result.kind === "fraction_bar")   return { ...m, ...cleared, fraction_bar: result.fraction_bar };
          if (result.kind === "number_line")    return { ...m, ...cleared, number_line: result.number_line };
          if (result.kind === "bar_chart")      return { ...m, ...cleared, bar_chart: result.bar_chart };
          if (result.kind === "percentage_bar") return { ...m, ...cleared, percentage_bar: result.percentage_bar };
          if (result.kind === "times_table")    return { ...m, ...cleared, times_table: result.times_table };
          if (result.kind === "geometry")       return { ...m, ...cleared, geometry: result.geometry };
          if (result.kind === "ratio")          return { ...m, ...cleared, ratio: result.ratio };
          return { ...m, ...cleared, math_steps: result.math_steps };
        });
        return { ...prev, messages: next };
      });
    } catch (err) {
      setImageError(err instanceof ApiError ? err.detail : t.auth.errors.generic);
    } finally {
      setImageBusy(false);
    }
  }, [session, imageBusy, sending, sessionId, t.auth.errors.generic]);

  // ── Chat Quiz ─────────────────────────────────────────────────────────────
  const onOpenChatQuiz = useCallback(async () => {
    if (!sessionId) return;
    setChatQuizOpen(true);
    if (chatQuizData) return; // already loaded
    setChatQuizLoading(true);
    setChatQuizError(null);
    try {
      const res = await chatApi.generateChatQuiz(sessionId);
      setChatQuizData({ questions: res.questions, topic_summary: res.topic_summary, subject: res.subject });
    } catch (err) {
      setChatQuizError(err instanceof ApiError ? err.detail : "Could not create quiz. Please try again.");
    } finally {
      setChatQuizLoading(false);
    }
  }, [sessionId, chatQuizData]);

  const onCloseChatQuiz = useCallback(() => {
    setChatQuizOpen(false);
  }, []);

  const onRetakeChatQuiz = useCallback(() => {
    setChatQuizData(null);
    setChatQuizError(null);
    onOpenChatQuiz();
  }, [onOpenChatQuiz]);

  const onOpenRecap = useCallback(async () => {
    if (!sessionId) return;
    setRecapOpen(true);
    setRecapLoading(true);
    setRecapError(null);
    try {
      const res = await chatApi.getRecap(sessionId);
      setRecapData(res);
    } catch (err) {
      setRecapData(null);
      setRecapError(err instanceof ApiError ? err.detail : "Could not load recap. Please try again.");
    } finally {
      setRecapLoading(false);
    }
  }, [sessionId]);

  const onCloseRecap = useCallback(() => {
    setRecapOpen(false);
  }, []);

  // ── Read-aloud (TTS) ──────────────────────────────────────────────────────
  // Streams base64 MP3 from the API into an in-memory <audio> element so we
  // never write throwaway audio to disk and so a second click cleanly stops
  // the previous clip.
  const onSpeak = useCallback(
    async (index: number, text: string) => {
      if (speakingIndex === index) {
        audioRef.current?.pause();
        audioRef.current = null;
        setSpeakingIndex(null);
        return;
      }
      audioRef.current?.pause();
      setSpeakingIndex(index);
      try {
        const { audio_base64, mime_type } = await chatApi.speak(
          text,
          locale === "ur" ? "ur" : "en",
        );
        const audio = new Audio(`data:${mime_type};base64,${audio_base64}`);
        audioRef.current = audio;
        await playTtsAudio(audio, { playbackRate: 1, gain: 1.35 });
        setSpeakingIndex(null);
      } catch (err) {
        console.error("TTS failed", err);
        setSpeakingIndex(null);
      }
    },
    [locale, speakingIndex],
  );

  const speakForFlow = useCallback(async (text: string) => {
    audioRef.current?.pause();
    setSpeakingIndex(-1);
    try {
      const { audio_base64, mime_type } = await chatApi.speak(
        text,
        locale === "ur" ? "ur" : "en",
      );
      const audio = new Audio(`data:${mime_type};base64,${audio_base64}`);
      audioRef.current = audio;
      await playTtsAudio(audio, { playbackRate: 1.05, gain: 1.45 });
      setSpeakingIndex(null);
    } catch (err) {
      console.error("TTS failed", err);
      setSpeakingIndex(null);
    }
  }, [locale]);

  onGenerateImageRef.current = onGenerateImage;
  onSpeakRef.current = onSpeak;
  speakForFlowRef.current = speakForFlow;

  // ── Understanding Check handlers ───────────────────────────────────────────
  const handleUnderstood = useCallback(() => {
    flowOnPopupYes();
    agentSubmitFeedback("understood");
    agentOnUnderstood();
  }, [flowOnPopupYes, agentSubmitFeedback, agentOnUnderstood]);

  const handleNotUnderstood = useCallback(() => {
    flowOnPopupNo();
  }, [flowOnPopupNo]);

  handleUnderstoodRef.current = handleUnderstood;
  handleNotUnderstoodRef.current = handleNotUnderstood;

  // Auto-grow the textarea as the student types (max 5 lines).
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [draft]);

  // ── Loading / error states ────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 px-6 py-4 text-rose-700 flex items-center gap-2">
          <AlertCircle size={18} /> {loadError}
        </div>
      </div>
    );
  }
  if (!session) {
    return <CenteredMessage text={t.pages.chat.loading} />;
  }

  const subjectName = session.subject ?? "your subject";

  return (
    <>
    <BreathingModal
      open={comprehensionFlow.showBreathing}
      onComplete={flowOnBreathingComplete}
    />
    <CameraConsentModal
      open={consentModalOpen}
      onAllow={handleConsentAllow}
      onDecline={handleConsentDecline}
    />
    <AdaptiveAgentPanel
      state={adaptiveState}
      videoRef={agentVideoRef}
      onStart={agentStartCamera}
      onStop={agentStopCamera}
    />
    {/* Recap + Quiz modals use fixed positioning (outside overflow-hidden panel) */}
    <AnimatePresence>
      {recapOpen && (
        <RecapModal
          loading={recapLoading}
          error={recapError}
          data={recapData}
          subject={session?.subject ?? ""}
          onClose={onCloseRecap}
          onRefresh={onOpenRecap}
        />
      )}
    </AnimatePresence>
    <AnimatePresence>
      {chatQuizOpen && session && (
        <ChatQuizModal
          loading={chatQuizLoading}
          error={chatQuizError}
          data={chatQuizData}
          subject={session.subject ?? ""}
          sessionId={sessionId}
          onClose={onCloseChatQuiz}
          onRetake={onRetakeChatQuiz}
        />
      )}
    </AnimatePresence>
    <div className="relative flex-1 flex flex-col rounded-3xl glass-strong shadow-soft overflow-hidden">
      {/* Header: subject + tutor-configured banner if applicable. */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/40">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-glacier-200 to-glacier-300 text-xl">
          {subjectIcon(session.subject)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-lg font-extrabold text-deep truncate">
            {session.subject ?? t.pages.dashboard.subjects.heading}
          </div>
          <div className="text-xs text-deep-muted">
            {t.pages.dashboard.gradeLabel} {session.grade}
          </div>
        </div>
        {/* Recap — always available for this chat session */}
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={onOpenRecap}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold text-white shadow-md hover:shadow-lg transition-all flex-shrink-0 ring-2 ring-amber-300/60"
          title="See what you learned in this chat"
        >
          <ClipboardList size={16} />
          <span className="hidden sm:inline">Recap</span>
        </motion.button>
        {/* Take a Quiz button — only show when there's enough chat history */}
        {session.messages.length >= 4 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={onOpenChatQuiz}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-sm font-bold text-white shadow hover:shadow-md transition-all flex-shrink-0"
            title="Take a quiz based on this chat"
          >
            <Trophy size={16} />
            <span className="hidden sm:inline">Take a Quiz</span>
          </motion.button>
        )}
      </div>

      {config?.tutor_configured === false && (
        <div className="px-4 md:px-6 pt-4">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 shadow-soft">
            <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Sparkles size={15} />
            </span>
            <div className="leading-snug">
              <div className="font-bold">{t.pages.chat.notConfiguredTitle}</div>
              <div className="opacity-90 mt-0.5">{t.pages.chat.notConfiguredBody}</div>
            </div>
          </div>
        </div>
      )}

      {imageError && (
        <div className="px-4 md:px-6 pt-3">
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/90 px-3 py-2 text-sm text-rose-700">
            <AlertCircle size={14} /> {imageError}
          </div>
        </div>
      )}

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4 min-h-[400px]">
        {session.messages.length === 0 ? (
          <EmptyConversation
            subject={subjectName}
            onPick={(s) => onSend(s)}
            disabled={sending}
          />
        ) : (
          <AnimatePresence initial={false}>
            {session.messages.map((m, i) => {
              // Only the LAST assistant message is interactive — earlier
              // ones could still be re-illustrated, but limiting the surface
              // area keeps the UI calm and avoids accidental cost spikes.
              const isLastAssistant =
                m.role === "assistant" && i === session.messages.length - 1;
              return (
                <div key={`${i}-${m.timestamp}`}>
                  <Bubble message={m} />
                  {isLastAssistant &&
                    comprehensionFlow.pendingPopup &&
                    comprehensionFlow.popupGate === "scroll" &&
                    !sending && (
                    <div
                      ref={answerEndRef}
                      className="h-px w-full pointer-events-none"
                      aria-hidden
                      data-answer-end
                    />
                  )}
                  {isLastAssistant &&
                    comprehensionFlow.mcqActive &&
                    comprehensionFlow.mcqQuestions[comprehensionFlow.mcqIndex] && (
                    <StepMcqPanel
                      key={`${comprehensionFlow.mcqPhase}-${comprehensionFlow.mcqIndex}`}
                      question={comprehensionFlow.mcqQuestions[comprehensionFlow.mcqIndex]}
                      stepNumber={comprehensionFlow.mcqIndex + 1}
                      totalSteps={comprehensionFlow.mcqQuestions.length}
                      allowTeachingDefer={
                        comprehensionFlow.mcqPhase === "recall" &&
                        comprehensionFlow.mcqIndex === 1
                      }
                      onAnswer={(result) => void flowOnMcqAnswered(result)}
                    />
                  )}
                </div>
              );
            })}
            {sending && <ThinkingBubble />}
          </AnimatePresence>
        )}
      </div>

      {/* Fixed “Did you get it?” popup — background chat no longer scrolls behind it */}
      <AnimatePresence>
        {showComprehensionPopup && (
          <>
            <motion.div
              key="popup-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[55] bg-black/20 backdrop-blur-[1px]"
              aria-hidden
            />
            <motion.div
              key="popup-panel"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-x-0 bottom-[5.5rem] md:bottom-28 z-[60] px-4 md:px-6 pointer-events-none"
            >
              <div className="max-w-2xl mx-auto pointer-events-auto shadow-2xl rounded-2xl">
                <UnderstandingCheck
                  key={`popup-${comprehensionFlow.adaptationRound}-${comprehensionFlow.popupStartedAt}`}
                  popupKey={`${comprehensionFlow.adaptationRound}-${comprehensionFlow.popupStartedAt}`}
                  agentTried={comprehensionFlow.adaptationStepsTaken > 0}
                  typingBlocked={comprehensionFlow.typingBlocked}
                  popupDancing={comprehensionFlow.popupDancing}
                  cvHappyMode={comprehensionFlow.cvHappyMode}
                  promptIndex={comprehensionFlow.popupPromptIndex}
                  happyPromptIndex={comprehensionFlow.happyPromptIndex}
                  onUnderstood={() => handleUnderstoodRef.current?.()}
                  onNotUnderstood={() => handleNotUnderstoodRef.current?.()}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Composer */}
      <div className="border-t border-white/40 px-4 md:px-6 py-4 bg-white/40">
        {sendError && (
          <div className="mb-2 text-sm text-rose-600 flex items-center gap-1.5">
            <AlertCircle size={14} /> {sendError}
          </div>
        )}
        {inputBlocked && !sending && (
          <div className="mb-2 text-xs font-semibold text-amber-700 text-center">
            {comprehensionFlow.mcqActive
              ? comprehensionFlow.mcqPhase === "appreciation"
                ? "Fun check time — do your best, no pressure! 🌟"
                : comprehensionFlow.mcqPhase === "teaching"
                ? "Step-by-step checks — finish them before typing ✏️"
                : "Finish the quick checks above before typing ✏️"
              : comprehensionFlow.imageViewActive
                ? "🎨 Study the picture for 1 minute — then the check-in will appear"
              : comprehensionFlow.pendingPopup && comprehensionFlow.popupGate === "scroll"
                ? "📖 Scroll to the end of the answer — check-in appears after 30 seconds of reading"
                : comprehensionFlow.showPopup
                  ? comprehensionFlow.adaptationStepsTaken > 0
                    ? `Help step ${comprehensionFlow.adaptationStepsTaken}/5 — please answer the popup 👆`
                    : "Please answer “Did you get it?” first 👆"
                  : "Take a breath… then we'll continue 🌿"}
          </div>
        )}
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              if (inputBlocked) {
                flowOnAttemptBlocked();
                return;
              }
              setDraft(e.target.value);
            }}
            onKeyDown={onKeyDown}
            placeholder={
              inputBlocked
                ? "Answer the popup above first…"
                : t.pages.chat.placeholder
            }
            rows={1}
            disabled={sending || inputBlocked}
            className="flex-1 resize-none rounded-2xl border border-glacier-200 bg-white/80 px-4 py-3 text-deep placeholder:text-deep-muted focus:outline-none focus:ring-2 focus:ring-glacier-400 transition-shadow"
            aria-label={t.pages.chat.placeholder}
          />
          <button
            type="button"
            onClick={() => onSend()}
            disabled={sending || inputBlocked || !draft.trim()}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-br from-glacier-500 to-deep text-white font-bold px-5 py-3 shadow-soft hover:shadow-deep disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
          >
            <Send size={16} />
            <span className="hidden sm:inline">{t.pages.chat.send}</span>
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

// ─── Bubbles ────────────────────────────────────────────────────────────────

/**
 * GPT often writes math using LaTeX-style delimiters like `\( \frac{1}{2} \)`
 * or `\[ a^2 + b^2 = c^2 \]`. ReactMarkdown sees `\(` as an escaped paren and
 * silently drops the backslash, leaving raw LaTeX visible to the student.
 *
 * Normalize those (and bare `$$...$$` / `$...$`) into the `$`-style delimiters
 * `remark-math` parses out of the box, so KaTeX can render them.
 */
function normalizeMath(input: string): string {
  if (!input) return input;
  let s = input;
  // Display math: \[ ... \]   →   $$ ... $$
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body) => `\n$$${body.trim()}$$\n`);
  // Inline math: \( ... \)   →   $ ... $
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body) => `$${body.trim()}$`);
  return s;
}

function MarkdownContent({ text }: { text: string }) {
  const normalized = normalizeMath(text);
  return (
    <div className="markdown-body space-y-2 text-[15px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="m-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-deep">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="list-disc pl-5 space-y-1 marker:text-glacier-500">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-1 marker:text-glacier-500 marker:font-semibold">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold text-deep mt-1">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-deep mt-1">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-deep mt-1">{children}</h3>
          ),
          code: ({ children, ...props }) => {
            const inline = !(props as { className?: string }).className;
            if (inline) {
              return (
                <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.9em] text-deep font-mono">
                  {children}
                </code>
              );
            }
            return (
              <code className="block rounded-xl bg-slate-900/90 text-slate-50 px-4 py-3 text-[0.9em] overflow-x-auto font-mono">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="m-0">{children}</pre>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-glacier-600 underline underline-offset-2 hover:text-glacier-700"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-glacier-300 pl-3 italic text-slate-700">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-slate-200 my-2" />,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-slate-200 px-2 py-1 text-left font-semibold bg-slate-50">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-200 px-2 py-1">{children}</td>
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Renders a `MathStepCard` (worked solution) inside a chat bubble.
 *
 * Each step has a plain-English caption above a typeset equation. The
 * equations come from the backend as raw LaTeX without surrounding `$`
 * delimiters, so we wrap them in `$...$` here and let `remark-math` +
 * `rehype-katex` turn them into real fractions/exponents.
 *
 * Used for fraction/decimal/algebra questions where DALL·E miscounts and
 * miswrites math symbols — see `utils/visual_aids.generate_math_steps`.
 */
/**
 * Animated in-browser emoji counting illustration.
 *
 * Replaces DALL·E for simple whole-number +/-/× questions. The backend
 * returns structured data (n1, n2, op, emoji, …) and this component renders
 * a beautiful, always-accurate, zero-cost visual that animates in phases:
 *
 *  Phase 1 — Group A emojis appear one by one
 *  Phase 2 — Operator appears
 *  Phase 3 — Group B emojis appear one by one
 *  Phase 4 — Equals sign + result group appear
 *
 * For subtraction: Group A shown, then n2 items crossed out, remainder
 * highlighted.
 * For multiplication: n1 rows of n2 emojis, then result row.
 */
// ─────────────────────────────────────────────────────────────────────────────
// EmojiCountingView — animated hand-counting illustration
//
// A pointing hand (🫵) slides item by item through the emoji groups, pausing
// on each one while a count number pops up and the item glows. After the hand
// finishes counting it plays a celebratory result badge. Students can tap
// "Watch again" to replay the whole sequence.
//
// Voice narration uses the built-in Web Speech API (speechSynthesis) — free,
// instant, no API key required. The hand speaks each number as it lands on
// the item, then reads the full equation at the end.
// ─────────────────────────────────────────────────────────────────────────────

// ── Speech helpers ────────────────────────────────────────────────────────────
const _NUM_WORDS = [
  "zero","one","two","three","four","five","six","seven","eight","nine","ten",
  "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen",
  "eighteen","nineteen","twenty",
];
function numWord(n: number): string {
  return _NUM_WORDS[n] ?? String(n);
}
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate  = 0.88;  // slightly slower — clearer for young learners
  utt.pitch = 1.15;  // a little higher — friendlier tone
  window.speechSynthesis.speak(utt);
}
function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/** One slot in the counting row. Shows the hand + count badge when active. */
function CountSlot({
  emojiChar,
  countNum,
  isActive,
  isRevealed,
  isCrossed = false,
  isDimmed = false,
}: {
  emojiChar: string;
  countNum: number;
  isActive: boolean;
  isRevealed: boolean;
  isCrossed?: boolean;
  isDimmed?: boolean;
}) {
  if (!isRevealed) return null;
  return (
    <div className="relative flex flex-col items-center" style={{ minWidth: 48 }}>
      {/* Bouncing hand pointer */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            key="hand"
            initial={{ opacity: 0, y: -6, scale: 0.7 }}
            animate={{ opacity: 1, y: [0, -5, 0], scale: 1 }}
            exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.15 } }}
            transition={{ y: { duration: 0.5, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.15 }, scale: { duration: 0.15 } }}
            className="text-2xl leading-none select-none"
            style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.18))" }}
          >
            🫵
          </motion.div>
        )}
      </AnimatePresence>

      {/* Count badge — shows when active, stays small after */}
      <AnimatePresence mode="wait">
        {isActive ? (
          <motion.span
            key="badge-active"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="absolute -top-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-glacier-500 text-[10px] font-black text-white shadow-md"
          >
            {countNum}
          </motion.span>
        ) : (
          <motion.span
            key="badge-done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.45 }}
            className="absolute -top-1 -right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-glacier-200 text-[9px] font-bold text-glacier-600"
          >
            {countNum}
          </motion.span>
        )}
      </AnimatePresence>

      {/* The emoji itself */}
      <motion.div
        initial={{ scale: 0, opacity: 0, y: 6 }}
        animate={{
          scale: isActive ? 1.38 : isDimmed ? 0.85 : 1,
          opacity: isDimmed ? 0.32 : 1,
          y: 0,
        }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
        className="relative select-none text-4xl leading-none"
        style={{
          filter: isActive
            ? "drop-shadow(0 0 10px rgba(96,165,250,0.7)) drop-shadow(0 4px 8px rgba(0,0,0,0.18))"
            : isDimmed
            ? "grayscale(50%)"
            : "drop-shadow(0 2px 4px rgba(0,0,0,0.10))",
        }}
      >
        {emojiChar}
        {/* Cross-out slash for subtraction */}
        {isCrossed && (
          <motion.span
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 380 }}
            className="absolute inset-0 flex items-center justify-center text-3xl pointer-events-none"
          >
            ❌
          </motion.span>
        )}
      </motion.div>
    </div>
  );
}

/** Animated operator sign (+, −, ×) that pops in. */
function OpBadge({ char, color = "text-glacier-600" }: { char: string; color?: string }) {
  return (
    <motion.span
      initial={{ scale: 0, rotate: -15 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 18 }}
      className={`mx-1 text-2xl font-black select-none ${color}`}
    >
      {char}
    </motion.span>
  );
}

/** Celebratory result badge. */
function ResultBadge({ value, label }: { value: number; label: string }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 16 }}
      className="mt-4 flex items-center justify-center gap-2"
    >
      <motion.span
        animate={{ rotate: [0, -10, 10, -6, 6, 0] }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="text-2xl"
      >
        🎉
      </motion.span>
      <span className="rounded-xl bg-gradient-to-br from-glacier-400 to-cyan-400 px-4 py-1.5 text-xl font-black text-white shadow-lg tracking-wide">
        {label}
      </span>
      <motion.span
        animate={{ rotate: [0, 10, -10, 6, -6, 0] }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="text-2xl"
      >
        🌟
      </motion.span>
    </motion.div>
  );
}

const STEP_MS = 720; // ms per item

function EmojiCountingView({
  data,
}: {
  data: import("@/lib/api/client").EmojiCountingData;
}) {
  const { n1, n2, op, result, emoji, emoji2, title } = data;

  // `step` advances by 1 every STEP_MS.  Maps to:
  //  Addition   : 1..n1 = group A items, n1+1 = op sign, n1+2..n1+n2+1 = group B, n1+n2+2 = result
  //  Subtraction: 1..n1 = count all, n1+1..n1+n2 = cross-out, n1+n2+1 = result
  //  Multiply   : 1..n1*n2 = each cell, n1*n2+1 = result
  const totalAdd = n1 + 1 + n2 + 1;
  const totalSub = n1 + n2 + 1;
  const totalMul = n1 * n2 + 1;
  const totalSteps = op === "+" ? totalAdd : op === "-" ? totalSub : totalMul;

  const [step, setStep] = React.useState(0);
  const [running, setRunning] = React.useState(true);

  // ── Step timer ─────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!running || step > totalSteps) return;
    const delay = step === 0 ? 500 : STEP_MS;
    const t = setTimeout(() => setStep((s) => s + 1), delay);
    return () => clearTimeout(t);
  }, [step, running, totalSteps]);

  // ── Voice narration — speaks only the final equation once animation ends ──
  React.useEffect(() => {
    if (op === "+" && step === n1 + n2 + 2) {
      speak(`${numWord(n1)} plus ${numWord(n2)} equals ${numWord(result)}`);
    } else if (op === "-" && step === n1 + n2 + 1) {
      speak(`${numWord(n1)} minus ${numWord(n2)} equals ${numWord(result)}`);
    } else if (op !== "+" && op !== "-" && step === n1 * n2 + 1) {
      speak(`${numWord(n1)} times ${numWord(n2)} equals ${numWord(result)}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Stop speaking when the card unmounts
  React.useEffect(() => () => stopSpeaking(), []);

  const replay = () => {
    stopSpeaking();
    setStep(0);
    setRunning(true);
  };

  const isDone = step > totalSteps;

  // ── Icons / colours per operator ────────────────────────────────────────
  const opIcon  = op === "+" ? "🟢" : op === "-" ? "🔴" : "🟣";
  const opColor = op === "+" ? "bg-emerald-100 text-emerald-700"
                : op === "-" ? "bg-rose-100 text-rose-700"
                : "bg-violet-100 text-violet-700";

  // ── ADDITION ─────────────────────────────────────────────────────────────
  if (op === "+") {
    const opVisible    = step > n1;
    const resultVisible = step > n1 + 1 + n2;
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-sm rounded-2xl border border-glacier-200/70 bg-white/95 px-5 py-5 shadow-lg"
        style={{ perspective: 800 }}
        data-testid="emoji-counting-view"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-base ${opColor}`}>
              {opIcon}
            </span>
            <span className="font-display text-sm font-extrabold text-deep">{title}</span>
          </div>
          {isDone && (
            <button
              onClick={replay}
              className="text-[11px] font-semibold text-glacier-500 hover:text-glacier-700 transition-colors"
            >
              ▶ Watch again
            </button>
          )}
        </div>

        {/* Counting row */}
        <div className="flex flex-wrap items-end gap-2 min-h-[80px]">
          {/* Group A */}
          {Array.from({ length: n1 }, (_, i) => (
            <CountSlot
              key={`a${i}`}
              emojiChar={emoji}
              countNum={i + 1}
              isActive={step === i + 1}
              isRevealed={step > i}
            />
          ))}

          {/* Operator */}
          {opVisible && <OpBadge char="+" />}

          {/* Group B */}
          {Array.from({ length: n2 }, (_, i) => {
            const itemStep = n1 + 2 + i;
            return (
              <CountSlot
                key={`b${i}`}
                emojiChar={emoji2}
                countNum={n1 + i + 1}
                isActive={step === itemStep}
                isRevealed={step > itemStep - 1}
              />
            );
          })}
        </div>

        {/* Equation label */}
        {resultVisible && (
          <ResultBadge value={result} label={`${n1} + ${n2} = ${result}`} />
        )}
      </motion.div>
    );
  }

  // ── SUBTRACTION ───────────────────────────────────────────────────────────
  if (op === "-") {
    // Steps 1..n1: hand counts all items left→right
    // Steps n1+1..n1+n2: hand crosses out first n2 items (take away)
    // Step n1+n2+1: result
    const crossingPhase  = step > n1;
    const resultVisible  = step > n1 + n2;
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-sm rounded-2xl border border-rose-100 bg-white/95 px-5 py-5 shadow-lg"
        data-testid="emoji-counting-view"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-base ${opColor}`}>
              {opIcon}
            </span>
            <span className="font-display text-sm font-extrabold text-deep">{title}</span>
          </div>
          {isDone && (
            <button onClick={replay} className="text-[11px] font-semibold text-glacier-500 hover:text-glacier-700 transition-colors">
              ▶ Watch again
            </button>
          )}
        </div>

        {/* "Take away" caption during crossing phase */}
        <AnimatePresence>
          {crossingPhase && !resultVisible && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-2 text-xs font-semibold text-rose-500"
            >
              ✋ Now take away {n2}…
            </motion.p>
          )}
        </AnimatePresence>

        {/* All n1 slots (counting phase then crossing phase) */}
        <div className="flex flex-wrap items-end gap-2 min-h-[80px]">
          {Array.from({ length: n1 }, (_, i) => {
            const isCrossed = crossingPhase && i < n2 && step > n1 + i;
            const isDimmed  = resultVisible && i < n2;
            // In counting phase: hand is at step i+1
            // In crossing phase: hand is at n1+1+i for first n2 items
            const isActiveCount = !crossingPhase && step === i + 1;
            const isActiveCross = crossingPhase && i < n2 && step === n1 + 1 + i;
            return (
              <CountSlot
                key={`s${i}`}
                emojiChar={emoji}
                countNum={i + 1}
                isActive={isActiveCount || isActiveCross}
                isRevealed={true}
                isCrossed={isCrossed}
                isDimmed={isDimmed}
              />
            );
          })}
        </div>

        {resultVisible && (
          <ResultBadge value={result} label={`${n1} − ${n2} = ${result}`} />
        )}
      </motion.div>
    );
  }

  // ── MULTIPLICATION ────────────────────────────────────────────────────────
  // Lay out n1 rows × n2 cols. Hand sweeps across each cell in reading order.
  const totalCells    = n1 * n2;
  const resultVisible = step > totalCells;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-sm rounded-2xl border border-violet-100 bg-white/95 px-5 py-5 shadow-lg"
      data-testid="emoji-counting-view"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-base ${opColor}`}>
            {opIcon}
          </span>
          <span className="font-display text-sm font-extrabold text-deep">{title}</span>
        </div>
        {isDone && (
          <button onClick={replay} className="text-[11px] font-semibold text-glacier-500 hover:text-glacier-700 transition-colors">
            ▶ Watch again
          </button>
        )}
      </div>

      <div className="space-y-2">
        {Array.from({ length: n1 }, (_, row) => (
          <div key={`row${row}`} className="flex items-end gap-2">
            <span className="w-5 text-right text-xs font-bold text-deep-muted">{row + 1}.</span>
            {Array.from({ length: n2 }, (_, col) => {
              const cellIdx = row * n2 + col; // 0-based
              const itemStep = cellIdx + 1;
              return (
                <CountSlot
                  key={`c${row}_${col}`}
                  emojiChar={emoji}
                  countNum={cellIdx + 1}
                  isActive={step === itemStep}
                  isRevealed={step > cellIdx}
                />
              );
            })}
          </div>
        ))}
      </div>

      {resultVisible && (
        <ResultBadge value={result} label={`${n1} × ${n2} = ${result}`} />
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FactorTreeView — prime factorization division ladder with HCF / LCM
// ─────────────────────────────────────────────────────────────────────────────
function FactorTreeView({ data }: { data: import("@/lib/api/client").FactorTreeData }) {
  const { title, task, numbers, ladders, prime_factors, hcf, lcm, common_factors } = data;
  const [step, setStep] = React.useState(0);
  const totalSteps = ladders.reduce((s, l) => s + l.length, 0) + 1;
  React.useEffect(() => {
    if (step >= totalSteps) return;
    const t = setTimeout(() => setStep(s => s + 1), step === 0 ? 400 : 550);
    return () => clearTimeout(t);
  }, [step, totalSteps]);

  const accentColor = task === "hcf" ? "text-emerald-600" : task === "lcm" ? "text-violet-600" : "text-glacier-600";
  const badgeBg    = task === "hcf" ? "bg-emerald-50 border-emerald-200" : task === "lcm" ? "bg-violet-50 border-violet-200" : "bg-glacier-50 border-glacier-200";

  let globalStep = 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-md rounded-2xl border border-glacier-200/70 bg-white/95 px-5 py-5 shadow-lg"
      data-testid="factor-tree-view"
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-glacier-100 text-glacier-700 text-base">🌳</span>
        <span className={`font-display text-sm font-extrabold ${accentColor}`}>{title}</span>
      </div>

      {/* Division ladders side by side */}
      <div className="flex gap-6 flex-wrap">
        {numbers.map((num, ni) => {
          const ladder = ladders[ni];
          const pf = prime_factors[ni];
          return (
            <div key={ni} className="flex-1 min-w-[120px]">
              <div className="text-xs font-bold text-deep-muted mb-1">Number: {num}</div>
              <table className="border-collapse text-sm font-mono">
                <tbody>
                  {ladder.map((row, ri) => {
                    globalStep++;
                    const visible = step >= globalStep;
                    const isCommon = common_factors.includes(row.divisor) && task !== "factorize";
                    return (
                      <AnimatePresence key={ri}>
                        {visible && (
                          <motion.tr
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25 }}
                          >
                            <td className={`pr-2 py-0.5 font-bold border-r-2 border-b border-glacier-300 ${isCommon ? "text-emerald-600" : "text-glacier-700"}`}>
                              {row.divisor}
                            </td>
                            <td className="pl-2 py-0.5 text-deep border-b border-glacier-100">{ri === 0 ? num : ladder[ri - 1].quotient}</td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    );
                  })}
                  {step >= globalStep && (
                    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <td className="pr-2 py-0.5 text-deep-muted"></td>
                      <td className="pl-2 py-0.5 font-bold text-deep">1</td>
                    </motion.tr>
                  )}
                </tbody>
              </table>
              {step > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                  className="mt-2 text-xs text-deep-muted">
                  = {pf.join(" × ")}
                </motion.div>
              )}
            </div>
          );
        })}
      </div>

      {/* Common factors highlight */}
      {common_factors.length > 0 && step >= totalSteps && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="mt-4 flex flex-wrap gap-1 items-center">
          <span className="text-xs text-deep-muted">Common:</span>
          {common_factors.map((f, i) => (
            <span key={i} className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">{f}</span>
          ))}
        </motion.div>
      )}

      {/* Result badge */}
      {step >= totalSteps && (hcf != null || lcm != null) && (
        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.3 }}
          className={`mt-4 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black ${badgeBg} ${accentColor}`}
        >
          <span>🎯</span>
          {task === "hcf" && <span>HCF = {hcf}</span>}
          {task === "lcm" && <span>LCM = {lcm}</span>}
          {task === "factorize" && numbers.length === 2 && hcf != null && <span>HCF = {hcf} &nbsp;|&nbsp; LCM = {lcm}</span>}
        </motion.div>
      )}
    </motion.div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// FractionBarView — shaded rectangle fraction illustration
// ─────────────────────────────────────────────────────────────────────────────
function FractionBarView({ data }: { data: import("@/lib/api/client").FractionBarData }) {
  const { title, fractions, op, result } = data;
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setStep(1), 400);
    const t2 = result ? setTimeout(() => setStep(2), 1200) : undefined;
    return () => { clearTimeout(t); if (t2) clearTimeout(t2); };
  }, [result]);

  const COLORS = ["bg-glacier-400", "bg-amber-400", "bg-rose-400", "bg-violet-400"];
  const LIGHT  = ["bg-glacier-100", "bg-amber-100", "bg-rose-100", "bg-violet-100"];

  const SingleBar = ({ frac, color, light, label }: {
    frac: { num: number; den: number }; color: string; light: string; label?: string;
  }) => (
    <div className="w-full">
      {label && <div className="text-xs font-semibold text-deep-muted mb-1">{label}</div>}
      <div className="flex h-8 w-full rounded-lg overflow-hidden border border-glacier-200 shadow-sm">
        {Array.from({ length: frac.den }, (_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: step >= 1 ? 1 : 0, scaleY: step >= 1 ? 1 : 0 }}
            transition={{ delay: i * 0.06, duration: 0.2 }}
            className={`flex-1 border-r border-white last:border-r-0 ${i < frac.num ? color : light}`}
          />
        ))}
      </div>
      <div className="mt-1 text-center text-sm font-black text-deep">{frac.num}/{frac.den}</div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-sm rounded-2xl border border-glacier-200/70 bg-white/95 px-5 py-5 shadow-lg"
      data-testid="fraction-bar-view"
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 text-base">▬</span>
        <span className="font-display text-sm font-extrabold text-deep">{title}</span>
      </div>
      <div className="space-y-4">
        {fractions.map((f, i) => (
          <SingleBar key={i} frac={f} color={COLORS[i % COLORS.length]} light={LIGHT[i % LIGHT.length]}
            label={fractions.length > 1 ? `${i === 0 ? "First" : i === 1 ? "Second" : `Part ${i + 1}`}: ${f.num}/${f.den}` : undefined} />
        ))}
        {result && step >= 2 && (
          <>
            <div className="flex items-center gap-2 text-lg font-black text-deep-muted">
              <span className="flex-1 h-px bg-glacier-200" />
              <span>{op === "+" ? "+" : op === "-" ? "−" : op === "*" ? "×" : "÷"}</span>
              <span className="flex-1 h-px bg-glacier-200" />
            </div>
            <SingleBar frac={result} color="bg-gradient-to-r from-glacier-400 to-cyan-400"
              light="bg-glacier-50" label={`Result: ${result.num}/${result.den}`} />
          </>
        )}
      </div>
    </motion.div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// NumberLineView — integers on a line with optional addition/subtraction arrow
// ─────────────────────────────────────────────────────────────────────────────
function NumberLineView({ data }: { data: import("@/lib/api/client").NumberLineData }) {
  const { title, points, min_val, max_val, result, arrows } = data;
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 300);
    const t2 = arrows.length ? setTimeout(() => setStep(2), 900) : undefined;
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2); };
  }, [arrows.length]);

  const range = max_val - min_val;
  const pct = (v: number) => ((v - min_val) / range) * 100;
  const ticks = Array.from({ length: range + 1 }, (_, i) => min_val + i);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-md rounded-2xl border border-glacier-200/70 bg-white/95 px-5 py-6 shadow-lg"
      data-testid="number-line-view"
    >
      <div className="flex items-center gap-2 mb-5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 text-base">↔</span>
        <span className="font-display text-sm font-extrabold text-deep">{title}</span>
      </div>

      <div className="relative h-16 mx-2">
        {/* The line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-glacier-300 -translate-y-1/2" />
        {/* Arrow heads */}
        <div className="absolute top-1/2 -left-2 -translate-y-1/2 text-glacier-400 text-xs">◀</div>
        <div className="absolute top-1/2 -right-2 -translate-y-1/2 text-glacier-400 text-xs">▶</div>

        {/* Tick marks and labels */}
        {ticks.map(v => (
          <div key={v} className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
            style={{ left: `${pct(v)}%` }}>
            <div className={`w-px ${v === 0 ? "h-6 bg-deep" : "h-3 bg-glacier-400"} -translate-y-1.5`} />
            <span className={`text-[10px] mt-3 font-${v === 0 ? "bold" : "normal"} ${v === 0 ? "text-deep" : "text-deep-muted"}`}>{v}</span>
          </div>
        ))}

        {/* Arrow for operation */}
        {step >= 2 && arrows.map((arr, i) => {
          const x1 = pct(arr.from);
          const x2 = pct(arr.to);
          const mid = (x1 + x2) / 2;
          const isRight = arr.to > arr.from;
          return (
            <motion.div key={i} initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.5 }}
              className="absolute top-0 h-full pointer-events-none"
              style={{ left: `${Math.min(x1, x2)}%`, width: `${Math.abs(x2 - x1)}%`, transformOrigin: isRight ? "left center" : "right center" }}>
              <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 0 60 Q 50 20 100 60" fill="none" stroke="#22d3ee" strokeWidth="6" strokeLinecap="round" />
                {isRight
                  ? <polygon points="96,55 104,65 88,65" fill="#22d3ee" />
                  : <polygon points="4,55 -4,65 12,65" fill="#22d3ee" />}
              </svg>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 text-xs font-black text-cyan-600 whitespace-nowrap">{arr.label}</div>
            </motion.div>
          );
        })}

        {/* Point markers */}
        {step >= 1 && points.map((v, i) => (
          <motion.div key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.1, type: "spring", stiffness: 300 }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
            style={{ left: `${pct(v)}%` }}>
            <div className={`h-4 w-4 rounded-full border-2 border-white shadow-md ${v < 0 ? "bg-rose-500" : v === 0 ? "bg-deep" : "bg-glacier-500"}`} />
          </motion.div>
        ))}

        {/* Result marker */}
        {step >= 2 && result != null && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, delay: 0.4 }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
            style={{ left: `${pct(result)}%` }}>
            <div className="h-5 w-5 rounded-full bg-amber-400 border-2 border-white shadow-md" />
          </motion.div>
        )}
      </div>

      {result != null && step >= 2 && (
        <ResultBadge value={result} label={title} />
      )}
    </motion.div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// BarChartView — animated SVG bar/pie chart for data handling questions
// ─────────────────────────────────────────────────────────────────────────────
function BarChartView({ data }: { data: import("@/lib/api/client").BarChartData }) {
  const { title, labels, values, x_label, y_label, chart_type } = data;
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => { setTimeout(() => setReady(true), 300); }, []);

  const maxVal = Math.max(...values);
  const PALETTE = ["#22d3ee","#34d399","#f59e0b","#f87171","#a78bfa","#fb923c","#60a5fa","#4ade80"];

  if (chart_type === "pie") {
    // Simple pie chart using SVG arc paths
    const total = values.reduce((s, v) => s + v, 0);
    let cumAngle = -Math.PI / 2;
    const slices = values.map((v, i) => {
      const angle = (v / total) * 2 * Math.PI;
      const x1 = 50 + 40 * Math.cos(cumAngle);
      const y1 = 50 + 40 * Math.sin(cumAngle);
      cumAngle += angle;
      const x2 = 50 + 40 * Math.cos(cumAngle);
      const y2 = 50 + 40 * Math.sin(cumAngle);
      const large = angle > Math.PI ? 1 : 0;
      const midAngle = cumAngle - angle / 2;
      const lx = 50 + 52 * Math.cos(midAngle);
      const ly = 50 + 52 * Math.sin(midAngle);
      return { d: `M50,50 L${x1},${y1} A40,40 0 ${large},1 ${x2},${y2} Z`, lx, ly, i };
    });
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-2xl border border-glacier-200/70 bg-white/95 px-5 py-5 shadow-lg"
        data-testid="bar-chart-view">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🥧</span>
          <span className="font-display text-sm font-extrabold text-deep">{title}</span>
        </div>
        <svg viewBox="0 0 100 100" className="w-full max-w-[180px] mx-auto">
          {slices.map((s, i) => (
            <motion.path key={i} d={s.d} fill={PALETTE[i % PALETTE.length]}
              initial={{ scale: 0 }} animate={{ scale: ready ? 1 : 0 }}
              transition={{ delay: i * 0.1 }} style={{ transformOrigin: "50px 50px" }} />
          ))}
        </svg>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 justify-center">
          {labels.map((lb, i) => (
            <div key={i} className="flex items-center gap-1 text-xs">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="text-deep-muted">{lb} ({values[i]})</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  // Bar chart
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm rounded-2xl border border-glacier-200/70 bg-white/95 px-5 py-5 shadow-lg"
      data-testid="bar-chart-view">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">📊</span>
        <span className="font-display text-sm font-extrabold text-deep">{title}</span>
      </div>
      {y_label && <div className="text-[10px] text-deep-muted mb-1 ml-6">{y_label}</div>}
      <div className="flex items-end gap-2 h-36 px-2">
        {values.map((v, i) => {
          const heightPct = maxVal > 0 ? (v / maxVal) * 100 : 0;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] font-bold text-deep">{v}</span>
              <motion.div
                className="w-full rounded-t-lg"
                style={{ background: PALETTE[i % PALETTE.length] }}
                initial={{ height: 0 }}
                animate={{ height: ready ? `${heightPct}%` : 0 }}
                transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 px-2 mt-1">
        {labels.map((lb, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-deep-muted truncate">{lb}</div>
        ))}
      </div>
      {x_label && <div className="text-[10px] text-deep-muted text-center mt-1">{x_label}</div>}
    </motion.div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// PercentageBarView — shaded bar showing N% of 100
// ─────────────────────────────────────────────────────────────────────────────
function PercentageBarView({ data }: { data: import("@/lib/api/client").PercentageBarData }) {
  const { title, percentage, label } = data;
  const [filled, setFilled] = React.useState(0);
  React.useEffect(() => { setTimeout(() => setFilled(percentage), 400); }, [percentage]);

  const color = percentage >= 75 ? "from-emerald-400 to-green-400"
              : percentage >= 40 ? "from-glacier-400 to-cyan-400"
              : "from-amber-400 to-orange-400";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm rounded-2xl border border-glacier-200/70 bg-white/95 px-5 py-5 shadow-lg"
      data-testid="percentage-bar-view">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">📊</span>
        <span className="font-display text-sm font-extrabold text-deep">{title}</span>
      </div>

      {/* Main percentage bar */}
      <div className="relative h-10 w-full rounded-xl bg-glacier-100 overflow-hidden border border-glacier-200">
        <motion.div
          className={`h-full rounded-xl bg-gradient-to-r ${color}`}
          initial={{ width: "0%" }}
          animate={{ width: `${filled}%` }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
            className="text-sm font-black text-white drop-shadow">
            {percentage}%
          </motion.span>
        </div>
      </div>

      {/* Tick marks for every 10% */}
      <div className="flex justify-between mt-1 px-0.5">
        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => (
          <span key={v} className="text-[9px] text-deep-muted">{v}</span>
        ))}
      </div>

      {label && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
          className="mt-3 text-center text-sm font-bold text-deep">
          {label}
        </motion.div>
      )}
    </motion.div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// TimesTableView — animated multiplication table grid
// ─────────────────────────────────────────────────────────────────────────────
function TimesTableView({ data }: { data: import("@/lib/api/client").TimesTableData }) {
  const { title, multiplier, rows } = data;
  const [visibleRows, setVisibleRows] = React.useState(0);
  React.useEffect(() => {
    if (visibleRows >= rows.length) return;
    const t = setTimeout(() => setVisibleRows(v => v + 1), visibleRows === 0 ? 300 : 180);
    return () => clearTimeout(t);
  }, [visibleRows, rows.length]);

  const maxProduct = Math.max(...rows.map(r => r.product));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-xs rounded-2xl border border-violet-100 bg-white/95 px-5 py-5 shadow-lg"
      data-testid="times-table-view">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">✖️</span>
        <span className="font-display text-sm font-extrabold text-violet-700">{title}</span>
      </div>
      <div className="space-y-1.5">
        {rows.slice(0, visibleRows).map((row, i) => {
          const barWidth = (row.product / maxProduct) * 100;
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2">
              <span className="w-28 text-xs font-mono text-deep-soft shrink-0">
                {multiplier} × {row.factor} =
              </span>
              <div className="flex-1 h-5 bg-violet-50 rounded-md overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-400 to-purple-400 rounded-md transition-all duration-300"
                  style={{ width: `${barWidth}%` }} />
              </div>
              <span className="w-8 text-right text-sm font-black text-violet-700 shrink-0">{row.product}</span>
            </motion.div>
          );
        })}
      </div>
      {visibleRows >= rows.length && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="mt-3 text-center text-xs text-deep-muted font-medium">
          {multiplier} × 12 = {multiplier * 12} ✓
        </motion.div>
      )}
    </motion.div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// GeometryView — SVG shape with labelled dimensions
// ─────────────────────────────────────────────────────────────────────────────
function GeometryView({ data }: { data: import("@/lib/api/client").GeometryData }) {
  const { title, shape, dimensions: dim, area, perimeter, angles } = data;
  const focus = data.focus ?? "shape";
  const unit = data.unit ?? "";
  const dimLbl = (v: number) => (unit ? `${v} ${unit}` : String(v));
  const showAreaBadge = (focus === "area" || focus === "both") && area != null;
  const showPerimeterBadge = (focus === "perimeter" || focus === "both") && perimeter != null;
  const [show, setShow] = React.useState(false);
  React.useEffect(() => { setTimeout(() => setShow(true), 300); }, []);

  const ShapeSVG = () => {
    if (shape === "circle") {
      const r = dim.radius ?? 40;
      const isPerimeter = focus === "perimeter" || focus === "both";
      const fill = focus === "area" ? "#fef9c3" : "none";
      const stroke = focus === "perimeter" ? "#2563eb" : "#0891b2";
      return (
        <svg viewBox="0 0 120 120" className="w-36 h-36">
          <motion.circle cx="60" cy="60" r="45" fill={fill} stroke={stroke} strokeWidth={focus === "perimeter" ? 4 : 3}
            initial={{ scale: 0 }} animate={{ scale: show ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 200 }} style={{ transformOrigin: "60px 60px" }} />
          <line x1="60" y1="60" x2="105" y2="60" stroke="#2563eb" strokeWidth="2" strokeDasharray="4 2" />
          <text x="82" y="55" fontSize="11" fill="#2563eb" fontWeight="bold">{dimLbl(r)}</text>
          {isPerimeter && (
            <text x="60" y="115" fontSize="10" fill="#2563eb" textAnchor="middle" fontWeight="bold">
              around the edge
            </text>
          )}
        </svg>
      );
    }
    if (shape === "square") {
      const s = dim.side ?? 5;
      const isPerimeter = focus === "perimeter" || focus === "both";
      const fill = focus === "perimeter" ? "none" : "#fef9c3";
      const stroke = focus === "perimeter" ? "#2563eb" : "#ca8a04";
      const sw = focus === "perimeter" ? 4 : 2;
      return (
        <svg viewBox="0 0 140 140" className="w-40 h-40">
          <motion.rect x="25" y="25" width="90" height="90" fill={fill} stroke={stroke} strokeWidth={sw} rx="2"
            initial={{ scale: 0 }} animate={{ scale: show ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 200 }} style={{ transformOrigin: "70px 70px" }} />
          <text x="70" y="18" fontSize="11" fill="#1e40af" textAnchor="middle" fontWeight="bold">{dimLbl(s)}</text>
          <text x="70" y="128" fontSize="11" fill="#1e40af" textAnchor="middle" fontWeight="bold">{dimLbl(s)}</text>
          <text x="12" y="74" fontSize="11" fill="#1e40af" textAnchor="middle" fontWeight="bold">{dimLbl(s)}</text>
          <text x="128" y="74" fontSize="11" fill="#1e40af" textAnchor="middle" fontWeight="bold">{dimLbl(s)}</text>
          {isPerimeter && (
            <text x="70" y="72" fontSize="10" fill="#64748b" textAnchor="middle">empty inside</text>
          )}
        </svg>
      );
    }
    if (shape === "rectangle") {
      const l = dim.length ?? 6, w = dim.width ?? 4;
      const fill = focus === "perimeter" ? "none" : "#fef9c3";
      const stroke = focus === "perimeter" ? "#2563eb" : "#ca8a04";
      const sw = focus === "perimeter" ? 4 : 2;
      return (
        <svg viewBox="0 0 180 130" className="w-44 h-36">
          <motion.rect x="20" y="30" width="140" height="70" fill={fill} stroke={stroke} strokeWidth={sw} rx="2"
            initial={{ scaleX: 0 }} animate={{ scaleX: show ? 1 : 0 }}
            transition={{ duration: 0.5 }} style={{ transformOrigin: "90px 65px" }} />
          <text x="90" y="22" fontSize="11" fill="#1e40af" textAnchor="middle" fontWeight="bold">{dimLbl(l)}</text>
          <text x="90" y="118" fontSize="11" fill="#1e40af" textAnchor="middle" fontWeight="bold">{dimLbl(l)}</text>
          <text x="8" y="68" fontSize="11" fill="#1e40af" textAnchor="middle" fontWeight="bold">{dimLbl(w)}</text>
          <text x="172" y="68" fontSize="11" fill="#1e40af" textAnchor="middle" fontWeight="bold">{dimLbl(w)}</text>
        </svg>
      );
    }
    if (shape === "triangle") {
      const b = dim.base ?? 6, h = dim.height ?? 4;
      const fill = focus === "perimeter" ? "none" : "#d1fae5";
      const stroke = focus === "perimeter" ? "#2563eb" : "#34d399";
      return (
        <svg viewBox="0 0 120 120" className="w-32 h-32">
          <motion.polygon points="60,15 110,105 10,105" fill={fill} stroke={stroke} strokeWidth={focus === "perimeter" ? 4 : 3}
            initial={{ scale: 0 }} animate={{ scale: show ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 180 }} style={{ transformOrigin: "60px 60px" }} />
          <text x="60" y="115" fontSize="11" fill="#065f46" textAnchor="middle" fontWeight="bold">base={dimLbl(b)}</text>
          <text x="15" y="65" fontSize="11" fill="#065f46" textAnchor="end" fontWeight="bold">h={dimLbl(h)}</text>
        </svg>
      );
    }
    if (shape === "angle") {
      const deg = dim.degrees ?? 90;
      const rad = (deg * Math.PI) / 180;
      const x2 = 20 + 70 * Math.cos(rad);
      const y2 = 100 - 70 * Math.sin(rad);
      return (
        <svg viewBox="0 0 120 120" className="w-32 h-32">
          <line x1="20" y1="100" x2="90" y2="100" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
          <motion.line x1="20" y1="100" x2={x2} y2={y2} stroke="#6366f1" strokeWidth="3" strokeLinecap="round"
            initial={{ opacity: 0 }} animate={{ opacity: show ? 1 : 0 }} transition={{ delay: 0.3, duration: 0.4 }} />
          <path d={`M 42 100 A 22 22 0 0 1 ${20 + 22 * Math.cos(rad)} ${100 - 22 * Math.sin(rad)}`}
            fill="none" stroke="#a5b4fc" strokeWidth="2" />
          <text x="48" y="90" fontSize="12" fill="#4f46e5" fontWeight="bold">{deg}°</text>
        </svg>
      );
    }
    return <div className="text-4xl">📐</div>;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm rounded-2xl border border-amber-100 bg-white/95 px-5 py-5 shadow-lg"
      data-testid="geometry-view">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">📐</span>
        <span className="font-display text-sm font-extrabold text-amber-700">{title}</span>
      </div>
      <div className="flex items-center justify-center mb-4">
        <ShapeSVG />
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {showAreaBadge && (
          <span className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-700">
            Area = {area}{unit ? ` ${unit}²` : ""}
          </span>
        )}
        {showPerimeterBadge && (
          <span className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-700">
            Perimeter = {perimeter}{unit ? ` ${unit}` : ""}
          </span>
        )}
        {focus === "perimeter" && perimeter != null && shape === "square" && dim.side != null && (
          <span className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
            {dimLbl(dim.side)} + {dimLbl(dim.side)} + {dimLbl(dim.side)} + {dimLbl(dim.side)} = {dimLbl(perimeter)}
          </span>
        )}
        {angles && angles.length > 0 && (
          <span className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-1 text-xs font-bold text-violet-700">
            Angles: {angles.join("°, ")}°
          </span>
        )}
      </div>
    </motion.div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// RatioView — balance scale comparing two quantities
// ─────────────────────────────────────────────────────────────────────────────
function RatioView({ data }: { data: import("@/lib/api/client").RatioData }) {
  const { title, left_label, left_value, right_label, right_value, ratio_text, simplified } = data;
  const total = left_value + right_value;
  const leftPct = (left_value / total) * 100;
  const rightPct = (right_value / total) * 100;
  const [show, setShow] = React.useState(false);
  React.useEffect(() => { setTimeout(() => setShow(true), 300); }, []);

  const isEqual = simplified === ratio_text || left_value === right_value;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm rounded-2xl border border-rose-100 bg-white/95 px-5 py-5 shadow-lg"
      data-testid="ratio-view">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">⚖️</span>
        <span className="font-display text-sm font-extrabold text-deep">{title}</span>
      </div>

      {/* Balance beam SVG */}
      <div className="flex items-end justify-center gap-0 mb-4 h-28">
        {/* Left pan */}
        <div className="flex flex-col items-center gap-1">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: show ? 1 : 0, y: show ? 0 : -10 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl bg-glacier-100 border-2 border-glacier-300 flex items-center justify-center font-black text-glacier-700 text-lg"
            style={{ width: 64, height: 64 }}>
            {left_value}
          </motion.div>
          <div className="text-xs font-semibold text-deep-muted">{left_label}</div>
        </div>

        {/* Beam */}
        <div className="flex flex-col items-center mx-3 mb-8">
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: show ? 1 : 0 }}
            transition={{ duration: 0.5 }}
            className="h-1 bg-deep rounded-full" style={{ width: 120 }} />
          <div className="w-2 h-12 bg-deep rounded-b-full" />
          <div className="text-lg font-black text-deep">▲</div>
        </div>

        {/* Right pan */}
        <div className="flex flex-col items-center gap-1">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: show ? 1 : 0, y: show ? 0 : -10 }}
            transition={{ delay: 0.3 }}
            className="rounded-xl bg-rose-100 border-2 border-rose-300 flex items-center justify-center font-black text-rose-700 text-lg"
            style={{ width: 64, height: 64 }}>
            {right_value}
          </motion.div>
          <div className="text-xs font-semibold text-deep-muted">{right_label}</div>
        </div>
      </div>

      {/* Ratio bar */}
      <div className="flex h-6 w-full rounded-lg overflow-hidden border border-glacier-200">
        <motion.div className="bg-glacier-400 flex items-center justify-center text-white text-[10px] font-bold"
          initial={{ width: "0%" }} animate={{ width: show ? `${leftPct}%` : "0%" }}
          transition={{ duration: 0.8, delay: 0.4 }}>
          {left_value}
        </motion.div>
        <motion.div className="bg-rose-400 flex items-center justify-center text-white text-[10px] font-bold"
          initial={{ width: "0%" }} animate={{ width: show ? `${rightPct}%` : "0%" }}
          transition={{ duration: 0.8, delay: 0.4 }}>
          {right_value}
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
        className="mt-3 flex items-center justify-center gap-3">
        <span className="text-sm font-bold text-deep">Ratio: <span className="text-glacier-600">{ratio_text}</span></span>
        {!isEqual && (
          <span className="text-sm font-bold text-deep">Simplified: <span className="text-emerald-600">{simplified}</span></span>
        )}
      </motion.div>
    </motion.div>
  );
}


function MathStepCardView({ card }: { card: import("@/lib/api/client").MathStepCard }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-md rounded-2xl border border-glacier-200/80 bg-white/90 px-5 py-4 shadow-soft"
      data-testid="math-step-card"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-glacier-100 text-glacier-700">
          <BookOpenCheck size={15} />
        </span>
        <div className="font-display text-sm font-extrabold text-deep tracking-tight" data-testid="math-step-card-title">
          {card.title}
        </div>
      </div>
      <ol className="space-y-3">
        {card.steps.map((step, idx) => (
          <li key={idx} className="flex gap-3">
            <span className="flex-shrink-0 mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-glacier-100 text-glacier-700 text-xs font-bold">
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              {step.caption && (
                // Captions occasionally contain inline math like
                // "Convert $\frac{1}{2}$ to sixths" — running through
                // MarkdownContent lets KaTeX typeset those inline.
                <div className="text-sm text-deep-soft leading-snug">
                  <MarkdownContent text={step.caption} />
                </div>
              )}
              {step.latex && (
                <div className="mt-1 rounded-lg bg-slate-50/80 px-3 py-2 text-deep">
                  <MarkdownContent text={`$${step.latex}$`} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {card.final_answer && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-gradient-to-br from-glacier-100 to-white px-3 py-2 border border-glacier-200/70">
          <span className="text-xs font-bold uppercase tracking-wider text-glacier-700">
            =
          </span>
          <div className="flex-1 text-deep">
            <MarkdownContent text={`$${card.final_answer}$`} />
          </div>
        </div>
      )}
    </motion.div>
  );
}

interface BubbleProps {
  message: ChatMessage;
}

function Bubble({ message }: BubbleProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}
      >
        <div
          className={`rounded-3xl px-5 py-3.5 leading-relaxed shadow-soft ${
            isUser
              ? "bg-gradient-to-br from-glacier-500 to-deep text-white rounded-br-md whitespace-pre-wrap"
              : "bg-white/90 text-deep rounded-bl-md border border-white/60"
          }`}
        >
          {isUser ? message.content : <MarkdownContent text={message.content} />}
        </div>

        {/* Inline illustration if the assistant attached one (countable
            arithmetic / concept questions). */}
        {message.image_url && (
          <motion.img
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            src={resolveImageUrl(message.image_url)}
            alt=""
            className="rounded-2xl border border-white/60 shadow-soft max-h-72 w-auto bg-white/60"
            loading="lazy"
          />
        )}

        {/* Animated emoji counting for simple +/-/× questions */}
        {message.emoji_counting && (
          <EmojiCountingView data={message.emoji_counting} />
        )}

        {/* Factor tree — HCF / LCM / prime factorization */}
        {message.factor_tree && (
          <FactorTreeView data={message.factor_tree} />
        )}

        {/* Fraction bar — visual shaded rectangle */}
        {message.fraction_bar && (
          <FractionBarView data={message.fraction_bar} />
        )}

        {/* Number line — integers with optional operation arrow */}
        {message.number_line && (
          <NumberLineView data={message.number_line} />
        )}

        {/* Bar / pie chart — data handling */}
        {message.bar_chart && (
          <BarChartView data={message.bar_chart} />
        )}

        {/* Percentage bar */}
        {message.percentage_bar && (
          <PercentageBarView data={message.percentage_bar} />
        )}

        {/* Times / multiplication table */}
        {message.times_table && (
          <TimesTableView data={message.times_table} />
        )}

        {/* Geometry shape (SVG) */}
        {message.geometry && (
          <GeometryView data={message.geometry} />
        )}

        {/* Ratio / balance scale */}
        {message.ratio && (
          <RatioView data={message.ratio} />
        )}

        {/* KaTeX step card for symbolic math (fractions / algebra / long division) */}
        {message.math_steps && message.math_steps.steps.length > 0 && (
          <MathStepCardView card={message.math_steps} />
        )}
      </div>
    </motion.div>
  );
}

function ThinkingBubble() {
  const { t } = useLocale();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex justify-start"
    >
      <div className="rounded-3xl rounded-bl-md bg-white/90 border border-white/60 px-5 py-3.5 shadow-soft flex items-center gap-2 text-deep-soft">
        <span className="flex gap-1">
          {[0, 0.15, 0.3].map((d, i) => (
            <motion.span
              key={i}
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: d, ease: "easeInOut" }}
              className="inline-block w-1.5 h-1.5 rounded-full bg-glacier-500"
            />
          ))}
        </span>
        <span className="text-sm">{t.pages.chat.thinking}</span>
      </div>
    </motion.div>
  );
}

// ─── Empty conversation (suggestions) ──────────────────────────────────────

function EmptyConversation({
  subject,
  onPick,
  disabled,
}: {
  subject: string;
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  const { t } = useLocale();
  const examples = useMemo(() => suggestionsFor(subject, t), [subject, t]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center h-full text-center py-10"
    >
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-glacier-200 to-glacier-300 text-deep mb-4">
        <Sparkles size={26} />
      </div>
      <h3 className="font-display text-2xl font-extrabold text-deep">
        {t.pages.chat.emptyTitle}
      </h3>
      <p className="mt-2 text-deep-soft max-w-sm">
        {t.pages.chat.emptySub.replace("{subject}", subject)}
      </p>
      <div className="mt-6 w-full max-w-md">
        <div className="text-xs uppercase tracking-wider font-bold text-deep-muted mb-3">
          {t.pages.chat.suggestions}
        </div>
        <div className="space-y-2">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={disabled}
              onClick={() => onPick(ex)}
              className="w-full text-left rounded-xl bg-white/80 hover:bg-white border border-white/60 px-4 py-3 text-sm text-deep transition-all hover:shadow-soft hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function suggestionsFor(
  subject: string,
  t: ReturnType<typeof useLocale>["t"],
): readonly string[] {
  const s = subject.toLowerCase();
  if (s.includes("math")) return t.pages.chat.examples.maths;
  if (s.includes("science")) return t.pages.chat.examples.science;
  if (s.includes("computer")) return t.pages.chat.examples.computer;
  return t.pages.chat.examples.general;
}

function subjectIcon(subject: string | null): string {
  if (!subject) return "📚";
  const s = subject.toLowerCase();
  if (s.includes("math")) return "🔢";
  if (s.includes("science")) return "🔬";
  if (s.includes("computer")) return "💻";
  return "📚";
}

// ─── RecapModal ───────────────────────────────────────────────────────────────
//
// Shows key points from the current chat session, or a friendly empty message.
//
function RecapModal({
  loading, error, data, subject, onClose, onRefresh,
}: {
  loading: boolean;
  error: string | null;
  data: SessionRecapResponse | null;
  subject: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Session recap"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.96 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          aria-label="Close recap"
        >
          <X size={16} />
        </button>

        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold opacity-90">
            <ClipboardList size={18} />
            Session Recap
          </div>
          <h2 className="mt-1 font-display text-xl font-extrabold">
            {subject || "Your chat"}
          </h2>
        </div>

        <div className="px-6 py-5">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-8 text-deep-muted">
              <Loader2 size={28} className="animate-spin text-amber-500" />
              <p className="text-sm">Building your recap…</p>
            </div>
          )}

          {!loading && error && (
            <div className="space-y-4 py-4">
              <p className="text-sm text-rose-600">{error}</p>
              <button
                onClick={onRefresh}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && data?.empty && (
            <div className="py-6 text-center">
              <BookOpenCheck size={40} className="mx-auto text-amber-400 mb-3" />
              <p className="text-deep text-sm leading-relaxed">
                {data.message || "You haven't learned any lesson in this chat yet. Ask a question first!"}
              </p>
            </div>
          )}

          {!loading && !error && data && !data.empty && (
            <div className="space-y-4">
              {data.topic_summary && (
                <p className="text-sm font-bold text-deep">{data.topic_summary}</p>
              )}
              {data.key_points.length > 0 ? (
                <ul className="space-y-2">
                  {data.key_points.map((point, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-sm text-deep leading-snug rounded-xl bg-amber-50 px-3 py-2"
                    >
                      <span className="text-amber-600 font-bold flex-shrink-0">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-deep-muted">No key points could be extracted from this chat.</p>
              )}
              <button
                onClick={onRefresh}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900"
              >
                <RotateCcw size={14} />
                Refresh recap
              </button>
            </div>
          )}

          {!loading && !error && !data && (
            <div className="flex flex-col items-center gap-3 py-8 text-deep-muted">
              <Loader2 size={28} className="animate-spin text-amber-500" />
              <p className="text-sm">Loading recap…</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── ChatQuizModal ────────────────────────────────────────────────────────────
//
// An overlay that slides up from the bottom of the chat panel. It shows a
// 5-question quiz generated specifically from the current conversation, lets
// the student answer one question at a time, and submits the result.
//
function ChatQuizModal({
  loading, error, data, subject, sessionId, onClose, onRetake,
}: {
  loading: boolean;
  error: string | null;
  data: { questions: QuizQuestion[]; topic_summary: string; subject: string } | null;
  subject: string;
  sessionId: string;
  onClose: () => void;
  onRetake: () => void;
}) {
  const [qIndex, setQIndex] = React.useState(0);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [answers, setAnswers] = React.useState<string[]>([]);
  const [timings, setTimings] = React.useState<number[]>([]);
  const [phase, setPhase] = React.useState<"quiz" | "result">("quiz");
  const [submitResult, setSubmitResult] = React.useState<{ score_percent: number; num_correct: number; num_questions: number; stars_earned: number } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const qStart = React.useRef(Date.now());
  const totalStart = React.useRef(Date.now());

  // Reset when data changes (retake)
  React.useEffect(() => {
    if (data) {
      setQIndex(0);
      setSelected(null);
      setRevealed(false);
      setAnswers([]);
      setTimings([]);
      setPhase("quiz");
      setSubmitResult(null);
      qStart.current = Date.now();
      totalStart.current = Date.now();
    }
  }, [data]);

  const choose = (opt: string) => {
    if (revealed || !data) return;
    setSelected(opt);
    setRevealed(true);
  };

  const advance = async () => {
    if (!data) return;
    const elapsed = (Date.now() - qStart.current) / 1000;
    const newAnswers = [...answers, selected ?? ""];
    const newTimings = [...timings, elapsed];

    if (qIndex + 1 < data.questions.length) {
      setAnswers(newAnswers);
      setTimings(newTimings);
      setQIndex((i) => i + 1);
      setSelected(null);
      setRevealed(false);
      qStart.current = Date.now();
    } else {
      // Submit
      setSubmitting(true);
      try {
        const totalTime = (Date.now() - totalStart.current) / 1000;
        const res = await quizApi.submit({
          subject: data.subject,
          questions: data.questions,
          answers: newAnswers,
          time_per_question: newTimings,
          total_time: totalTime,
        });
        setSubmitResult(res);
        setAnswers(newAnswers);
        setTimings(newTimings);
        setPhase("result");
      } catch {
        setPhase("result");
        setSubmitResult({ score_percent: 0, num_correct: 0, num_questions: data.questions.length, stars_earned: 1 });
      } finally {
        setSubmitting(false);
      }
    }
  };

  const q = data?.questions[qIndex];
  const pct = submitResult?.score_percent ?? 0;
  const gradeMsg = pct >= 90 ? "Amazing! 🏆" : pct >= 70 ? "Great job! 🌟" : pct >= 50 ? "Good effort! 💪" : "Keep practising! 🌱";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.96 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative w-full max-w-lg mx-4 rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-glacier-100 hover:bg-glacier-200 text-deep-soft transition-colors"
        >
          <X size={16} />
        </button>

        <div className="px-6 py-6">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center py-16 gap-4">
              <Loader2 size={36} className="text-violet-400 animate-spin" />
              <p className="text-deep-soft font-medium">Building your quiz from this chat…</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex flex-col items-center py-12 gap-4 text-center">
              <div className="text-rose-500 text-sm">{error}</div>
              <button onClick={onRetake} className="rounded-xl bg-glacier-100 px-5 py-2 text-sm font-bold text-glacier-700 hover:bg-glacier-200 transition">
                Try again
              </button>
            </div>
          )}

          {/* Quiz phase */}
          {!loading && !error && data && phase === "quiz" && q && (
            <AnimatePresence mode="wait">
              <motion.div
                key={qIndex}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
              >
                {/* Header */}
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy size={18} className="text-violet-500" />
                    <span className="font-display text-sm font-bold text-violet-600">{data.topic_summary}</span>
                  </div>
                  <div className="flex justify-between text-xs text-deep-soft mb-2">
                    <span>Question {qIndex + 1} of {data.questions.length}</span>
                    <span>{subject}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-glacier-100 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-violet-600 to-blue-600"
                      animate={{ width: `${((qIndex + 1) / data.questions.length) * 100}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                </div>

                {/* Question */}
                <QuizMarkdown text={q.question} size="lg" className="mb-5 text-deep font-display" />

                {/* Options */}
                <div className="space-y-2.5 mb-5">
                  {q.options.map((opt, i) => {
                    const isCorrect = opt === q.correct;
                    const isSelected = opt === selected;
                    let cls = "border-glacier-200 bg-white hover:bg-glacier-50 hover:border-glacier-300 cursor-pointer";
                    if (revealed) {
                      if (isCorrect) cls = "border-emerald-400 bg-emerald-50 cursor-default";
                      else if (isSelected) cls = "border-rose-400 bg-rose-50 cursor-default";
                      else cls = "border-glacier-100 bg-glacier-50/50 opacity-50 cursor-default";
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => choose(opt)}
                        className={`w-full flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all ${cls}`}
                      >
                        <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold
                          ${revealed && isCorrect ? "bg-emerald-400 text-white" : revealed && isSelected ? "bg-rose-400 text-white" : "bg-glacier-100 text-glacier-600"}`}>
                          {["A","B","C","D"][i]}
                        </span>
                        <span className="flex-1 text-sm font-medium text-deep break-words">
                          <QuizMarkdown text={opt} size="sm" />
                        </span>
                        {revealed && isCorrect && <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />}
                        {revealed && isSelected && !isCorrect && <XCircle size={16} className="text-rose-500 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Explanation */}
                <AnimatePresence>
                  {revealed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className={`mb-4 rounded-2xl px-4 py-3 border overflow-hidden ${selected === q.correct ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}
                    >
                      <div className={`text-xs font-bold mb-1 ${selected === q.correct ? "text-emerald-600" : "text-amber-600"}`}>
                        {selected === q.correct ? "Correct! 🎉" : (
                          <>Correct answer: <QuizMarkdown text={q.correct} size="sm" className="inline" /></>
                        )}
                      </div>
                      <QuizMarkdown text={q.explanation} size="sm" className="text-deep" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Next */}
                {revealed && (
                  <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={advance}
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 py-3.5 font-bold text-white shadow hover:shadow-md transition-all hover:scale-[1.01] disabled:opacity-60"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                    {qIndex + 1 === data.questions.length ? "See results!" : <>Next <ChevronRight size={16} /></>}
                  </motion.button>
                )}
              </motion.div>
            </AnimatePresence>
          )}

          {/* Result phase */}
          {!loading && !error && phase === "result" && submitResult && data && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="mb-2">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-glacier-100 shadow-inner mb-3">
                  <span className="text-3xl font-extrabold text-deep">{Math.round(pct)}%</span>
                </div>
              </div>
              <h3 className="font-display text-xl font-extrabold text-deep mb-1">{gradeMsg}</h3>
              <p className="text-deep-soft text-sm mb-2">
                {submitResult.num_correct} out of {submitResult.num_questions} correct
              </p>
              {/* Stars */}
              <div className="flex items-center justify-center gap-1 mb-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3 + i * 0.08, type: "spring", stiffness: 300 }}
                  >
                    <Star size={22} className={i < submitResult.stars_earned ? "text-amber-400 fill-amber-400" : "text-glacier-200 fill-glacier-100"} />
                  </motion.span>
                ))}
              </div>
              <p className="text-xs text-deep-soft mb-6">+{submitResult.stars_earned} stars added to your profile</p>

              {/* Review */}
              <div className="text-left space-y-2 mb-6">
                {data.questions.map((q, i) => {
                  const correct = answers[i] === q.correct;
                  return (
                    <div key={i} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${correct ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50"}`}>
                      {correct
                        ? <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                        : <XCircle size={15} className="text-rose-500 mt-0.5 flex-shrink-0" />}
                      <span className="text-deep truncate">{q.question}</span>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={onRetake}
                  className="flex items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-violet-50 py-3 text-sm font-bold text-violet-600 hover:bg-violet-100 transition"
                >
                  <RotateCcw size={15} /> Try again
                </button>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 py-3 text-sm font-bold text-white shadow hover:shadow-md transition"
                >
                  Back to chat
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
