"use client";

/**
 * useAdaptiveTutorAgent — REBUILT with ComprehensionStateMachine
 * ==============================================================
 *
 * Priority order:
 *   1. Direct feedback ("Not yet" → immediate escalation)
 *   2. Learning behavior (silence, repeated Q, wrong answers)
 *   3. Camera face signals
 *
 * Camera NEVER overrides direct student feedback.
 *
 * Expression detection: Hybrid Strategy C (MediaPipe + face-api + 3s smoothing).
 *
 * Key fixes from previous version:
 *   - FPS: analysis throttled to 15fps (was 1fps)
 *   - Neutral face ≠ focused (neutral_uncertain added)
 *   - "Not yet" click → immediate escalation, bypasses all gates
 *   - ComprehensionStateMachine manages state properly
 *   - Thresholds: 0.55 strong / 0.40 mild (was 0.60)
 *   - Cooldown: 8s (was 12s), Stability: 2.5s (was 4s)
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction, type MutableRefObject } from "react";
import { useMediaPipeEmotion } from "./useMediaPipeEmotion";
import { useFaceApiEmotion } from "./useFaceApiEmotion";
import { FaceSignalBuffer } from "@/lib/agent/FaceSignalBuffer";
import { ComprehensionStateMachine } from "@/lib/agent/ComprehensionStateMachine";
import type { ComprehensionState, PolicyResult } from "@/lib/agent/ComprehensionStateMachine";
import { HybridEmotionEngine } from "@/lib/agent/HybridEmotionEngine";
import { interpretTeachingEmotion } from "@/lib/agent/EmotionStateInterpreter";
import type { TeachingEmotionState } from "@/lib/agent/EmotionStateInterpreter";
import type { AgentActionPayload } from "@/lib/agent/mediaAgentTypes";
import { API_BASE } from "@/lib/api/client";
import type {
  FaceSignal,
  LearningSignals,
  StudentBaseline,
  TutorAction,
  EngagementProbabilities,
} from "@/lib/agent/types";

export type { AgentActionPayload, TeachingEmotionState };

export type { TutorAction, EngagementProbabilities, LearningSignals };
export type { ComprehensionState, PolicyResult };

// ── Camera consent ────────────────────────────────────────────────────────────
const CONSENT_KEY          = "autistudy_camera_consent";
const BASELINE_KEY_PREFIX  = "autistudy_baseline_";

export function getCameraConsent(): "granted" | "denied" | "pending" {
  if (typeof window === "undefined") return "pending";
  const v = localStorage.getItem(CONSENT_KEY);
  return v === "granted" ? "granted" : v === "denied" ? "denied" : "pending";
}
export function setCameraConsent(v: "granted" | "denied") {
  if (typeof window !== "undefined") localStorage.setItem(CONSENT_KEY, v);
}

export function loadBaseline(email: string): StudentBaseline | null {
  try {
    const raw = localStorage.getItem(BASELINE_KEY_PREFIX + email);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── Confusion keywords ────────────────────────────────────────────────────────
const CONFUSION_KEYWORDS = [
  "don't understand", "dont understand", "not understand", "confused",
  "i don't get", "i dont get", "explain again",
  "help me", "what does", "huh", "not yet",
  "طلب", "سمجھ", "نہیں سمجھا",
];

export function containsConfusion(text: string): boolean {
  const lower = text.toLowerCase();
  return CONFUSION_KEYWORDS.some((kw) => lower.includes(kw));
}

const EVAL_INTERVAL_MS = 2000; // evaluate every 2 seconds

// ── State exposed to the UI ───────────────────────────────────────────────────

export interface AdaptiveTutorState {
  cameraEnabled:     boolean;
  cameraError:       string | null;
  mediaPipeReady:    boolean;
  mediaPipeLoading:  boolean;
  mediaPipeFps:      number;   // analysis fps (target 15)
  mediaPipeCamFps:   number;   // raw camera RAF fps
  mediaPipeError:    string | null;
  videoLive:         boolean;  // stream attached + frames flowing
  frameBrightness:   number | null;
  frameBlack:        boolean;
  cameraDeviceLabel: string | null;
  engagement:        EngagementProbabilities | null;
  comprehensionState: ComprehensionState;
  lastDecision:      PolicyResult | null;
  generatingContent: boolean;
  escalationLevel:   number;
  actionsHistory:    Array<{ action: TutorAction; timestamp: number }>;
  // Debug info
  debugReason:       string;
  debugConfusion:    number;
  isCalibrated:      boolean;  // has personal baseline been captured
  teachingEmotion:   TeachingEmotionState | null;
  lastMediaTool:     string | null;
  decidingAgent:     boolean;
  /** True when CV detects boredom/frustration/inattention — show Yes/Not yet UI */
  showUnderstandingPrompt: boolean;
  /** Optional break/rest choice — never auto-nag in chat */
  showRestChoice: "break" | "tomorrow" | null;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseAdaptiveTutorAgentOptions {
  sessionId:        string | null;
  currentTopic?:    string;
  learningSignals?: Partial<LearningSignals>;
  onAction:         (decision: PolicyResult, payload?: AgentActionPayload) => void;
  studentEmail?:    string;
}

export function useAdaptiveTutorAgent({
  sessionId,
  currentTopic = "",
  learningSignals = {},
  onAction,
  studentEmail = "",
}: UseAdaptiveTutorAgentOptions) {
  const [state, setState] = useState<AdaptiveTutorState>({
    cameraEnabled: false, cameraError: null,
    mediaPipeReady: false, mediaPipeLoading: false,
    mediaPipeFps: 0, mediaPipeCamFps: 0, mediaPipeError: null, videoLive: false,
    frameBrightness: null, frameBlack: false, cameraDeviceLabel: null,
    engagement: null, comprehensionState: "IDLE",
    lastDecision: null, generatingContent: false,
    escalationLevel: 0, actionsHistory: [],
    debugReason: "", debugConfusion: 0,
    isCalibrated: false,
    teachingEmotion: null,
    lastMediaTool: null,
    decidingAgent: false,
    showUnderstandingPrompt: false,
    showRestChoice: null,
  });

  const videoRef      = useRef<HTMLVideoElement | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const bufferRef     = useRef(new FaceSignalBuffer());
  const machineRef    = useRef(new ComprehensionStateMachine());
  const baselineRef   = useRef<StudentBaseline | null>(null);
  const evalTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const onActionRef   = useRef(onAction);
  const decidingRef   = useRef(false);
  const toolsUsedRef  = useRef<string[]>([]);
  const engagementRef = useRef<EngagementProbabilities | null>(null);
  const teachingRef = useRef<TeachingEmotionState | null>(null);
  const hybridEngineRef = useRef(new HybridEmotionEngine());
  const restPromptShownRef = useRef(false);
  onActionRef.current = onAction;

  // Load baseline once (from previous session)
  useEffect(() => {
    if (studentEmail) {
      const b = loadBaseline(studentEmail);
      if (b) {
        baselineRef.current = b;
        setState((p) => ({ ...p, isCalibrated: true }));
      }
    }
  }, [studentEmail]);

  // Topic change → reset state machine
  useEffect(() => {
    if (currentTopic) machineRef.current.onTopicChange(currentTopic);
  }, [currentTopic]);

  // ── Stable signal callback (no deps = never recreated) ───────────────────
  const handleSignal = useCallback((signal: FaceSignal) => {
    bufferRef.current.add(signal);
  }, []);

  // ── MediaPipe hook (facial landmarks + blendshapes) ─────────────────────
  const mpState = useMediaPipeEmotion(videoRef, state.cameraEnabled, handleSignal);

  // ── face-api.js hook (real emotion labels: sad/angry/fearful/etc) ────────
  const { emotions: faceApiEmotions } = useFaceApiEmotion(videoRef, state.cameraEnabled);

  // Sync MediaPipe meta (ready/fps) — NOT on every frame
  useEffect(() => {
    const video = videoRef.current;
    const videoLive =
      !!video &&
      !!streamRef.current &&
      video.srcObject === streamRef.current &&
      !video.paused &&
      video.videoWidth > 0;

    setState((p) => ({
      ...p,
      mediaPipeReady:   mpState.ready,
      mediaPipeLoading: mpState.loading,
      mediaPipeFps:     mpState.fps,
      mediaPipeCamFps:  mpState.cameraFps,
      mediaPipeError:   mpState.error,
      videoLive,
    }));
  }, [mpState.ready, mpState.loading, mpState.fps, mpState.cameraFps, mpState.error, state.cameraEnabled]);

  // ── Bind webcam stream to <video> (retries until panel ref is mounted) ───
  const attachStreamToVideo = useCallback(async (): Promise<boolean> => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return false;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
    }

    try {
      if (video.paused) await video.play();
    } catch {
      return false;
    }

    // Wait up to 2s for first decoded frame (videoWidth alone is not enough).
    for (let i = 0; i < 20; i++) {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return video.readyState >= 2 && video.videoWidth > 0;
  }, []);

  // Re-attach whenever the <video> element mounts (panel expand / page load).
  const setVideoElement = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (el && streamRef.current) {
        void attachStreamToVideo().then((ok) => {
          if (ok) setState((p) => ({ ...p, videoLive: true, cameraError: null }));
        });
      }
    },
    [attachStreamToVideo],
  );

  // Keep retrying until stream is bound — panel may mount after getUserMedia.
  useEffect(() => {
    if (!state.cameraEnabled || !streamRef.current) return;

    let cancelled = false;
    const retry = async () => {
      while (!cancelled && streamRef.current) {
        const ok = await attachStreamToVideo();
        if (ok) {
          setState((p) => ({ ...p, videoLive: true, cameraError: null }));
          return;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    };
    void retry();

    return () => {
      cancelled = true;
    };
  }, [state.cameraEnabled, attachStreamToVideo]);

  // Real frame brightness — detects black preview even when videoWidth > 0.
  const brightnessCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!state.cameraEnabled) {
      setState((p) =>
        p.frameBrightness === null && !p.frameBlack
          ? p
          : { ...p, frameBrightness: null, frameBlack: false },
      );
      return;
    }
    if (!brightnessCanvasRef.current && typeof document !== "undefined") {
      brightnessCanvasRef.current = document.createElement("canvas");
    }
    const sample = () => {
      const video = videoRef.current;
      const canvas = brightnessCanvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return;
      canvas.width = 32;
      canvas.height = 24;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      try {
        ctx.drawImage(video, 0, 0, 32, 24);
        const { data } = ctx.getImageData(0, 0, 32, 24);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        const brightness = sum / (data.length / 4);
        const isBlack = brightness < 8;
        setState((p) => {
          const rounded = Math.round(brightness);
          if (p.frameBrightness === rounded && p.frameBlack === isBlack) return p;
          return { ...p, frameBrightness: rounded, frameBlack: isBlack };
        });
      } catch {
        /* tainted canvas — ignore */
      }
    };
    const id = setInterval(sample, 1000);
    sample();
    return () => clearInterval(id);
  }, [state.cameraEnabled]);

  // ── Evaluation loop (every 2s) ────────────────────────────────────────────
  useEffect(() => {
    if (!state.cameraEnabled) return;

    evalTimerRef.current = setInterval(() => {
      const avg = bufferRef.current.average;
      const ls: LearningSignals = {
        secondsSinceLastMessage:  learningSignals.secondsSinceLastMessage  ?? 0,
        repeatedQuestionCount:    learningSignals.repeatedQuestionCount     ?? 0,
        wrongAnswerStreak:        learningSignals.wrongAnswerStreak          ?? 0,
        currentTopicDifficulty:   learningSignals.currentTopicDifficulty    ?? 2,
        messageContainsConfusion: learningSignals.messageContainsConfusion  ?? false,
        consecutiveAgentAttempts: learningSignals.consecutiveAgentAttempts  ?? 0,
        lastUserMessageText:      learningSignals.lastUserMessageText        ?? "",
        lastTutorAnswerText:      learningSignals.lastTutorAnswerText        ?? "",
      };

      // Strategy C — Hybrid fusion (Expression Lab winner)
      const hybrid = hybridEngineRef.current.process(avg, faceApiEmotions, ls);
      const engagement = hybrid.engagement;
      const teaching = hybrid.teaching;

      engagementRef.current = engagement;
      teachingRef.current = teaching;

      setState((p) => ({
        ...p,
        engagement,
        teachingEmotion: teaching,
        debugReason: `CV monitoring — ${teaching.hybridDominant ?? "—"}`,
        debugConfusion: hybrid.hybridScores.confused ?? 0,
      }));
    }, EVAL_INTERVAL_MS);

    return () => { if (evalTimerRef.current) clearInterval(evalTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cameraEnabled, sessionId]);

  // ── Fix IDLE bug: if camera starts while answers already exist → MONITORING ─
  useEffect(() => {
    if (
      state.cameraEnabled &&
      machineRef.current.currentState === "IDLE" &&
      (learningSignals.lastTutorAnswerText ?? "").length > 10
    ) {
      machineRef.current.onAnswerGiven();
      setState((p) => ({ ...p, comprehensionState: "MONITORING" }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cameraEnabled, learningSignals.lastTutorAnswerText]);

  // ── Auto-calibration: capture first 5s of signals as personal baseline ───
  const calibrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runAutoCalibration = useCallback(() => {
    // Wait 5 seconds for the student to settle, then snapshot the buffer
    calibrationTimerRef.current = setTimeout(() => {
      const avg = bufferRef.current.average;
      if (!avg || avg.facePresenceRatio < 0.5 || !studentEmail) return;
      // Only save if we don't have a baseline yet
      if (baselineRef.current) return;
      const baseline: StudentBaseline = {
        browDown:        avg.browDown,
        browInnerUp:     avg.browInnerUp,
        smile:           avg.smile,
        ear:             avg.ear,
        headYaw:         avg.headYaw,
        headPitch:       avg.headPitch,
        normalBlinkRate: Math.max(5, avg.blinkRate), // floor at 5 bpm
        capturedAt:      Date.now(),
        studentEmail,
      };
      baselineRef.current = baseline;
      setState((p) => ({ ...p, isCalibrated: true }));
      try {
        localStorage.setItem(BASELINE_KEY_PREFIX + studentEmail, JSON.stringify(baseline));
      } catch {}
    }, 5000);
  }, [studentEmail]);

  // ── Start camera ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setState((p) => ({
      ...p,
      cameraError: null,
      videoLive: false,
      frameBrightness: null,
      frameBlack: false,
    }));
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const label = track?.label ?? null;
      setState((p) => ({ ...p, cameraEnabled: true, cameraDeviceLabel: label }));
      const ok = await attachStreamToVideo();
      if (ok) setState((p) => ({ ...p, videoLive: true }));
      runAutoCalibration();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((p) => ({ ...p, cameraError: msg, cameraEnabled: false, videoLive: false }));
    }
  }, [runAutoCalibration, attachStreamToVideo]);

  // ── Stop camera ───────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (calibrationTimerRef.current) clearTimeout(calibrationTimerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    bufferRef.current.clear();
    hybridEngineRef.current.clear();
    setState((p) => ({ ...p, cameraEnabled: false, videoLive: false }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Called when tutor sends an answer (start monitoring) ─────────────────
  const onAnswerGiven = useCallback(() => {
    machineRef.current.onAnswerGiven();
    setState((p) => ({
      ...p,
      comprehensionState: "MONITORING",
      showUnderstandingPrompt: false,
    }));
  }, []);

  // ── Student typed a new question — fresh start, stop nagging ─────────────
  const onStudentNewMessage = useCallback(() => {
    restPromptShownRef.current = false;
    machineRef.current.onStudentNewMessage();
    bufferRef.current.clear();
    hybridEngineRef.current.clear();
    setState((p) => ({
      ...p,
      comprehensionState: "MONITORING",
      escalationLevel: 0,
      showUnderstandingPrompt: false,
      showRestChoice: null,
      actionsHistory: [],
    }));
  }, []);

  const onChooseKeepStudying = useCallback(() => {
    machineRef.current.onStudentContinuesStudying();
    setState((p) => ({
      ...p,
      comprehensionState: "MONITORING",
      escalationLevel: 0,
      showRestChoice: null,
    }));
  }, []);

  const onChooseRest = useCallback(() => {
    machineRef.current.onStudentRest();
    setState((p) => ({
      ...p,
      comprehensionState: "UNDERSTOOD",
      showRestChoice: null,
    }));
  }, []);

  // ── Get the format the agent wants for the NEXT answer (proactive) ────────
  // Call this BEFORE sending to the chat API. Returns a format hint.
  const getPreferredFormat = useCallback((): string => {
    const level = machineRef.current.currentEscalationLevel;
    const lastAction = machineRef.current.lastTriggeredAction;
    if (lastAction === "SHOW_FLOWCHART_STEPS" || level >= 3)
      return "step_by_step_flowchart";
    if (lastAction === "SHOW_VISUAL_EXPLANATION" || level >= 2)
      return "with_visual_description";
    if (lastAction === "SIMPLIFY_EXPLANATION"   || level >= 1)
      return "simplified";
    return "normal";
  }, []);

  // ── DIRECT FEEDBACK — highest priority ───────────────────────────────────
  const submitFeedback = useCallback((feedback: "understood" | "not_yet") => {
    const decision = machineRef.current.onFeedback(feedback);
    setState((p) => ({
      ...p,
      comprehensionState: decision.state,
      escalationLevel: decision.escalationLevel,
      lastDecision: decision,
      showUnderstandingPrompt: false,
    }));

    if (feedback === "not_yet") {
      // Comprehension flow owns the "not yet" ladder — no duplicate chat interventions.
      return;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── "Yes, I got it!" ──────────────────────────────────────────────────────
  const onStudentUnderstood = useCallback(() => {
    machineRef.current.onStudentUnderstood();
    bufferRef.current.clear();
    hybridEngineRef.current.clear();
    setState((p) => ({
      ...p,
      comprehensionState: "UNDERSTOOD",
      escalationLevel: 0,
      actionsHistory: [],
      showUnderstandingPrompt: false,
    }));
  }, []);

  return {
    state,
    videoRef,
    setVideoElement,
    startCamera,
    stopCamera,
    onAnswerGiven,
    onStudentNewMessage,
    submitFeedback,
    onStudentUnderstood,
    onChooseKeepStudying,
    onChooseRest,
    getPreferredFormat,
    containsConfusion,
  };
}

// ── Intervention: Media Agent decide → fallback to local generate-content ───────

type SetAdaptiveState = Dispatch<SetStateAction<AdaptiveTutorState>>;

function runIntervention(
  decision: PolicyResult,
  engagement: EngagementProbabilities | null,
  teaching: TeachingEmotionState,
  ls: LearningSignals,
  sessionId: string,
  subject: string,
  toolsUsedRef: MutableRefObject<string[]>,
  decidingRef: MutableRefObject<boolean>,
  onActionRef: MutableRefObject<(d: PolicyResult, p?: AgentActionPayload) => void>,
  setState: SetAdaptiveState,
) {
  if (
    decision.action === "ASK_CHECK_UNDERSTANDING" ||
    decision.action === "SUGGEST_BREAK" ||
    decision.action === "SUGGEST_TRY_TOMORROW"
  ) {
    return;
  }

  decidingRef.current = true;
  setState((p) => ({ ...p, generatingContent: true, decidingAgent: true }));

  resolveIntervention(decision, engagement, teaching, ls, sessionId, subject, toolsUsedRef.current)
    .then((payload) => {
      if (payload?.source === "media_agent" && payload.tool && payload.tool !== "do_nothing") {
        toolsUsedRef.current = [...toolsUsedRef.current, payload.tool];
      }
      setState((p) => ({
        ...p,
        generatingContent: false,
        decidingAgent: false,
        lastMediaTool: payload?.tool ?? p.lastMediaTool,
        actionsHistory: [
          ...p.actionsHistory.slice(-9),
          { action: decision.action, timestamp: Date.now() },
        ],
      }));
      onActionRef.current(decision, payload);
    })
    .catch(() => {
      setState((p) => ({ ...p, generatingContent: false, decidingAgent: false }));
      onActionRef.current(decision);
    })
    .finally(() => {
      decidingRef.current = false;
    });
}

async function resolveIntervention(
  decision: PolicyResult,
  _engagement: EngagementProbabilities | null,
  _teaching: TeachingEmotionState,
  ls: LearningSignals,
  sessionId: string,
  subject: string,
  _toolsUsed: string[],
): Promise<AgentActionPayload | undefined> {
  // Step 2 & 3: minimal chat text — image/voice do the teaching
  if (decision.action === "SHOW_VISUAL_EXPLANATION") {
    return {
      source: "local_fallback",
      localAction: decision.action,
      content: "Here's a picture to help explain this! 🎨",
    };
  }
  if (decision.action === "USE_VOICE_AID") {
    return {
      source: "local_fallback",
      localAction: decision.action,
      content: "Let me read this out loud for you! 🔊",
    };
  }

  const content = await generateContent(decision.action, ls, sessionId, subject);
  if (!content) return undefined;
  return {
    source: "local_fallback",
    localAction: decision.action,
    content,
  };
}

// ── Content generation (LLM for intervention content) ────────────────────────
async function generateContent(
  action: TutorAction,
  learning: LearningSignals,
  sessionId: string,
  subject: string,
): Promise<string | undefined> {
  try {
    const token = localStorage.getItem("autistudy_token");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/agent/generate-content`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          action,
          session_id: sessionId,
          subject,
          last_question: learning.lastUserMessageText,
          last_answer: learning.lastTutorAnswerText,
        }),
      });
    } finally { clearTimeout(timeout); }
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.content as string | undefined;
  } catch { return undefined; }
}
