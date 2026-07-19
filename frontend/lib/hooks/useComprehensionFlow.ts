"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  TutorComprehensionFlow,
  LADDER_EXHAUSTED_MESSAGE,
  type FlowSnapshot,
} from "@/lib/agent/TutorComprehensionFlow";

import {
  classifyEmotionBucket,
  resolveCvTimeoutSignal,
  shouldPauseCvAfterYes,
} from "@/lib/agent/emotionBuckets";

import type { LabEmotion } from "@/expression-lab/types";

import { API_BASE, profileApi, type LearnerProfile } from "@/lib/api/client";

import { normalizeLadderOrder } from "@/lib/agent/adaptationLadder";

import {
  buildModalityChoices,
  modalityToBackendKey,
  parsePreferredModality,
  profilePreferredModality,
  resolvePreferredModality,
  type ModalityChoice,
  type TeachingModality,
} from "@/lib/agent/teachingModalities";
import { stripTutorStubLines } from "@/lib/agent/stripTutorStubLines";

const CV_TICK_MS = 1200;
const HAPPY_PROMPT_COOLDOWN_MS = 8000;
const FEEDBACK_BAR_FADE_MS = 90_000;

function resolveEmotionBucket(
  scores: Partial<Record<LabEmotion, number>>,
  hybridDominant?: LabEmotion | null,
) {
  const bucket = classifyEmotionBucket(scores);
  if (
    bucket !== "distressed" &&
    hybridDominant === "happy" &&
    (scores.happy ?? 0) >= 0.05
  ) {
    return "happy" as const;
  }
  return bucket;
}

export interface ComprehensionFlowCallbacks {
  onAppendMessage: (content: string) => number;
  onReplaceLastAssistantMessage: (
    content: string,
    opts?: { clearVisual?: boolean },
  ) => void;
  getLastAssistantIndex: () => number;
  onGenerateImage: () => Promise<void>;
  onSpeak: (text: string, messageIndex?: number) => Promise<void>;
}

export interface UseComprehensionFlowOptions {
  sessionId: string | null;
  subject: string;
  studentEmail?: string | null;
  hybridScores: Partial<Record<LabEmotion, number>> | null;
  hybridDominant?: LabEmotion | null;
  cameraEnabled: boolean;
  ttsBusy?: boolean;
  lastQuestion: string;
  lastAnswer: string;
  messageCount: number;
  scrollContainerRef: RefObject<HTMLElement | null>;
  answerEndRef: RefObject<HTMLElement | null>;
  callbacks: ComprehensionFlowCallbacks;
}

function stripForSpeech(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#`>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateForSpeech(text: string, maxChars = 600): string {
  const clean = stripForSpeech(text);
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut).trim() + "…";
}

export function useComprehensionFlow({
  sessionId,
  subject,
  studentEmail,
  hybridScores,
  hybridDominant,
  cameraEnabled,
  ttsBusy = false,
  lastQuestion,
  lastAnswer,
  messageCount,
  scrollContainerRef,
  answerEndRef,
  callbacks,
}: UseComprehensionFlowOptions) {
  const flowRef = useRef(new TutorComprehensionFlow());
  const [flow, setFlow] = useState<FlowSnapshot>(() => flowRef.current.snapshot());
  const [cvTimeoutActive, setCvTimeoutActive] = useState(false);

  const adaptingRef = useRef(false);
  const bucketSinceRef = useRef<{ bucket: string; since: number } | null>(null);
  const cvTimeoutSignalRef = useRef<{ signal: "happy" | "distressed"; since: number } | null>(
    null,
  );
  const lastHappyPromptAtRef = useRef(0);
  const feedbackTimedOutRef = useRef(false);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const ladderReadyRef = useRef<Promise<void>>(Promise.resolve());
  const profileReadyRef = useRef<Promise<void>>(Promise.resolve());
  const profileRef = useRef<LearnerProfile | null>(null);
  const learnedModalityRef = useRef<TeachingModality | null>(null);
  const baseAnswerRef = useRef("");
  const baseQuestionRef = useRef("");

  const ttsBusyRef = useRef(ttsBusy);
  ttsBusyRef.current = ttsBusy;
  const prevTtsBusyRef = useRef(ttsBusy);
  const hybridScoresRef = useRef(hybridScores);
  hybridScoresRef.current = hybridScores;
  const hybridDominantRef = useRef(hybridDominant);
  hybridDominantRef.current = hybridDominant;
  const cameraEnabledRef = useRef(cameraEnabled);
  cameraEnabledRef.current = cameraEnabled;
  const cvTimeoutActiveRef = useRef(cvTimeoutActive);
  cvTimeoutActiveRef.current = cvTimeoutActive;

  const sync = useCallback(() => {
    setFlow(flowRef.current.snapshot());
  }, []);

  // Load personalized ladder order (used for future weight-based sorting).
  useEffect(() => {
    if (!studentEmail || !subject) {
      ladderReadyRef.current = Promise.resolve();
      return;
    }
    let cancelled = false;
    const token = localStorage.getItem("autistudy_token");
    ladderReadyRef.current = fetch(
      `${API_BASE}/api/agent/adaptation-ladder?subject=${encodeURIComponent(subject)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.ladder_order) return;
        flowRef.current.setAdaptationOrder(normalizeLadderOrder(data.ladder_order));
        learnedModalityRef.current = parsePreferredModality(data.preferred_modality);
        sync();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [studentEmail, subject, sync]);

  useEffect(() => {
    if (!studentEmail) {
      profileRef.current = null;
      profileReadyRef.current = Promise.resolve();
      return;
    }
    profileReadyRef.current = profileApi
      .get()
      .then((p) => {
        profileRef.current = p;
      })
      .catch(() => {
        profileRef.current = null;
      });
  }, [studentEmail]);

  const recordWinningAdaptation = useCallback(
    (modality: TeachingModality | null, happyCv: boolean) => {
      if (!studentEmail || !modality) return;
      const adaptation = modalityToBackendKey(modality);
      const expression = hybridDominantRef.current ?? null;
      const token = localStorage.getItem("autistudy_token");
      fetch(`${API_BASE}/api/agent/record-adaptation-preference`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          subject,
          adaptation,
          via: happyCv ? "happy_cv" : "popup_yes",
          happy_cv: happyCv,
          expression,
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.ladder_order) {
            flowRef.current.setAdaptationOrder(normalizeLadderOrder(data.ladder_order));
          }
          // Backend now returns the weighted-score winner (recent > total >
          // CV expression) — use it instead of just "whatever was clicked".
          const scored = parsePreferredModality(data?.preferred_modality);
          learnedModalityRef.current = scored ?? modality;
          sync();
        })
        .catch(() => {});
    },
    [studentEmail, subject, sync],
  );

  const recordFailedAdaptation = useCallback(
    (modality: TeachingModality | null) => {
      if (!studentEmail || !modality) return;
      const adaptation = modalityToBackendKey(modality);
      const expression = hybridDominantRef.current ?? null;
      const token = localStorage.getItem("autistudy_token");
      fetch(`${API_BASE}/api/agent/record-adaptation-failure`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subject, adaptation, expression }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.ladder_order) {
            flowRef.current.setAdaptationOrder(normalizeLadderOrder(data.ladder_order));
          }
          const scored = parsePreferredModality(data?.preferred_modality);
          if (scored) learnedModalityRef.current = scored;
          sync();
        })
        .catch(() => {});
    },
    [studentEmail, subject, sync],
  );

  const recordSessionOutcome = useCallback(
    (outcome: "understood" | "stuck", toolsUsed: string[]) => {
      if (!studentEmail || !sessionId) return;
      const token = localStorage.getItem("autistudy_token");
      fetch(`${API_BASE}/api/agent/session-summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          subject,
          topic: lastQuestion.slice(0, 60),
          tools_used: toolsUsed,
          outcome,
        }),
      }).catch(() => {});
    },
    [studentEmail, sessionId, subject, lastQuestion],
  );

  const deliverModality = useCallback(
    async (
      modality: TeachingModality,
      opts?: { autoReadAloud?: boolean; append?: boolean; alreadyDelivered?: boolean },
    ) => {
      if (!sessionId || adaptingRef.current) return;
      adaptingRef.current = true;
      const f = flowRef.current;
      const question = baseQuestionRef.current || lastQuestion;
      const baseAnswer = baseAnswerRef.current;
      const append = opts?.append ?? false;

      const publishText = (text: string): number | undefined => {
        if (append) {
          return callbacksRef.current.onAppendMessage(text);
        }
        callbacksRef.current.onReplaceLastAssistantMessage(text, { clearVisual: true });
        return undefined;
      };

      try {
        if (modality === "simple_text") {
          let text = stripTutorStubLines(baseAnswer);
          if (!text || text.startsWith("Here's a picture")) {
            text = stripTutorStubLines(
              (await fetchContent(
                "SIMPLE_TEXT_ONLY",
                sessionId,
                subject,
                question,
                baseAnswer || lastAnswer,
              )) ?? "",
            );
          }
          if (!text) {
            f.markModalityTried("simple_text");
            return;
          }
          f.markModalityTried(modality);
          if (append || text !== stripTutorStubLines(baseAnswer)) {
            publishText(text);
          }
          f.activateFeedbackBar();
        } else if (modality === "step_by_step") {
          if (opts?.alreadyDelivered && baseAnswer) {
            // The initial /send call already requested step-by-step format
            // directly — content on screen already matches, nothing to
            // fetch or replace (avoids the simple-text-then-replace flash).
            f.markModalityTried(modality);
            f.onAdaptationContent(baseAnswer);
            f.activateFeedbackBar();
            return;
          }
          const content = await fetchContent(
            "STEP_BY_STEP_ONLY",
            sessionId,
            subject,
            question,
            baseAnswer || lastAnswer,
          );
          if (!content) {
            f.markModalityTried("simple_text");
            return;
          }
          f.markModalityTried(modality);
          f.onAdaptationContent(content);
          publishText(content);
          f.activateFeedbackBar();
        } else if (modality === "image") {
          f.markModalityTried(modality);
          publishText("Here's a picture to help! 🎨");
          sync();
          await callbacksRef.current.onGenerateImage();
          f.activateFeedbackBar();
        } else if (modality === "read_aloud") {
          let text = stripTutorStubLines(baseAnswer || lastAnswer);
          if (!text || text.startsWith("Here's a picture")) {
            text = stripTutorStubLines(
              (await fetchContent(
                "SIMPLE_TEXT_ONLY",
                sessionId,
                subject,
                question,
                baseAnswer || lastAnswer,
              )) ?? "",
            );
          }
          if (!text) {
            f.markModalityTried("simple_text");
            return;
          }
          f.markModalityTried(modality);
          let msgIndex: number | undefined;
          if (append) {
            msgIndex = callbacksRef.current.onAppendMessage(text);
          } else {
            callbacksRef.current.onReplaceLastAssistantMessage(text);
            const idx = callbacksRef.current.getLastAssistantIndex();
            msgIndex = idx >= 0 ? idx : undefined;
          }
          sync();
          const speech = truncateForSpeech(text);
          if (speech) {
            f.onContentDelivered("tts");
            sync();
            await callbacksRef.current.onSpeak(speech, msgIndex);
          }
          f.activateFeedbackBar();
        }
      } finally {
        adaptingRef.current = false;
        const f = flowRef.current;
        if (
          !f.showFeedbackBar &&
          !f.showModalityChoice &&
          !f.showCvHappyFollowUp &&
          !f.showBreathing &&
          !f.mcqActive
        ) {
          f.activateFeedbackBar();
        }
        sync();
      }
    },
    [sessionId, subject, lastQuestion, lastAnswer, sync],
  );

  /** Resolve which format the very first /send call should request, BEFORE
   *  sending — lets on-book questions come back already in the preferred
   *  format (e.g. step-by-step) instead of simple-text-then-replace. */
  const getInitialSendAction = useCallback(async (): Promise<{
    action: string;
    modality: TeachingModality;
  }> => {
    await Promise.all([ladderReadyRef.current, profileReadyRef.current]);
    const preferred = resolvePreferredModality(
      profileRef.current,
      learnedModalityRef.current,
    );
    const action = preferred === "step_by_step" ? "step_by_step_only" : "simple_text_only";
    return { action, modality: preferred };
  }, []);

  /** Deliver exactly ONE format — never simple text + step-by-step together. */
  const onPreferredAnswerDelivery = useCallback(
    async (
      settingsAutoRead: boolean,
      answerText?: string,
      questionText?: string,
      deliveredAsModality?: TeachingModality,
    ) => {
      try {
        await Promise.all([ladderReadyRef.current, profileReadyRef.current]);

        baseAnswerRef.current = stripTutorStubLines(answerText ?? lastAnswer);
        baseQuestionRef.current = questionText ?? lastQuestion;
        feedbackTimedOutRef.current = false;
        setCvTimeoutActive(false);

        const preferred = resolvePreferredModality(
          profileRef.current,
          learnedModalityRef.current,
        );

        const autoRead =
          preferred === "read_aloud" &&
          (settingsAutoRead || profileRef.current?.audio_preference === "auto");

        const alreadyDelivered =
          preferred === "step_by_step" && deliveredAsModality === "step_by_step";

        await deliverModality(preferred, {
          append: false,
          autoReadAloud: autoRead,
          alreadyDelivered,
        });
        bucketSinceRef.current = null;
      } catch {
        flowRef.current.markModalityTried("simple_text");
        flowRef.current.activateFeedbackBar();
        sync();
      }
    },
    [deliverModality, lastAnswer, lastQuestion, sync],
  );

  const onAssistantAnswer = useCallback(() => {
    flowRef.current.onContentDelivered("scroll");
    bucketSinceRef.current = null;
    sync();
  }, [sync]);

  const onStudentQuestion = useCallback(() => {
    flowRef.current.onStudentQuestion();
    feedbackTimedOutRef.current = false;
    setCvTimeoutActive(false);
    baseAnswerRef.current = "";
    baseQuestionRef.current = "";
    bucketSinceRef.current = null;
    cvTimeoutSignalRef.current = null;
    sync();
  }, [sync]);

  const onPopupYes = useCallback(async () => {
    const f = flowRef.current;
    const winning = f.currentModality;
    const happyCv = f.cvHappyMode;
    const bucket = resolveEmotionBucket(hybridScores ?? {}, hybridDominant);
    const pause = shouldPauseCvAfterYes(bucket);

    if (winning) {
      learnedModalityRef.current = winning;
    }

    recordWinningAdaptation(winning, happyCv);
    recordSessionOutcome(
      "understood",
      f.triedModalities.map((m) => modalityToBackendKey(m)),
    );

    f.closeModalityChoice();
    f.onThumbsUp(pause);
    feedbackTimedOutRef.current = false;
    setCvTimeoutActive(false);
    bucketSinceRef.current = null;
    sync();
  }, [hybridScores, hybridDominant, recordWinningAdaptation, recordSessionOutcome, sync]);

  const onPopupNo = useCallback(() => {
    const f = flowRef.current;
    recordFailedAdaptation(f.currentModality);
    f.openModalityChoice();
    feedbackTimedOutRef.current = false;
    setCvTimeoutActive(false);
    sync();
  }, [recordFailedAdaptation, sync]);

  /** Happy follow-up — "Move on to next question" button. */
  const onCvHappyMoveOn = useCallback(() => {
    const f = flowRef.current;
    f.dismissForNextQuestion();
    feedbackTimedOutRef.current = false;
    setCvTimeoutActive(false);
    sync();
  }, [sync]);

  /** Happy follow-up — "Select another option" button (same choices as Not yet). */
  const onCvHappyWantsOptions = useCallback(() => {
    const f = flowRef.current;
    f.openModalityChoice(false);
    feedbackTimedOutRef.current = false;
    setCvTimeoutActive(false);
    sync();
  }, [sync]);

  const onModalityChosen = useCallback(
    async (choice: ModalityChoice) => {
      const f = flowRef.current;

      if (choice === "next_question") {
        f.dismissForNextQuestion();
        feedbackTimedOutRef.current = false;
        setCvTimeoutActive(false);
        sync();
        return;
      }

      f.closeModalityChoice();
      setCvTimeoutActive(false);
      sync();

      if (choice === "breathing") {
        f.onBreathingStart();
        sync();
        return;
      }

      await deliverModality(choice, { append: true });
    },
    [deliverModality, sync],
  );

  const onAttemptSendWhileBlocked = useCallback((): boolean => {
    const blocked = flowRef.current.onAttemptSendWhileBlocked();
    sync();
    return blocked;
  }, [sync]);

  const onBreathingComplete = useCallback(() => {
    flowRef.current.onBreathingComplete();
    callbacksRef.current.onAppendMessage(LADDER_EXHAUSTED_MESSAGE);
    recordSessionOutcome(
      "stuck",
      flowRef.current.triedModalities.map((m) => modalityToBackendKey(m)),
    );
    sync();
  }, [recordSessionOutcome, sync]);

  const modalityChoices = useMemo(() => {
    const tried = new Set(flow.triedModalities);
    return buildModalityChoices(tried);
  }, [flow.triedModalities]);

  // Auto-hide 👍/👎 after 90s — then CV may offer choices if confused.
  useEffect(() => {
    if (!flow.showFeedbackBar) return;
    const id = setInterval(() => {
      const f = flowRef.current;
      if (!f.showFeedbackBar || !f.feedbackStartedAt) return;
      if (Date.now() - f.feedbackStartedAt >= FEEDBACK_BAR_FADE_MS) {
        feedbackTimedOutRef.current = true;
        cvTimeoutSignalRef.current = null;
        setCvTimeoutActive(true);
        f.dismissFeedbackBar();
        sync();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [flow.showFeedbackBar, sync]);

  // Hide 👍/👎 while TTS plays; show again when student stops or finishes.
  useEffect(() => {
    const wasBusy = prevTtsBusyRef.current;
    prevTtsBusyRef.current = ttsBusy;
    const f = flowRef.current;

    if (ttsBusy && !wasBusy && f.currentModality === "read_aloud" && f.showFeedbackBar) {
      f.dismissFeedbackBar();
      sync();
      return;
    }

    if (
      !ttsBusy &&
      (wasBusy || flowRef.current.awaitingContentGate === "tts") &&
      f.currentModality === "read_aloud" &&
      !f.showModalityChoice &&
      !f.mcqActive &&
      !f.showBreathing
    ) {
      f.awaitingContentGate = "none";
      f.activateFeedbackBar();
      sync();
    }
  }, [ttsBusy, sync]);

  // CV while 👍/👎 visible — happy hint only; ladder never auto-advances.
  useEffect(() => {
    if (!flow.showFeedbackBar || flow.cvPaused || adaptingRef.current || ttsBusyRef.current) {
      return;
    }
    if (!cameraEnabled) return;

    const id = setInterval(() => {
      const f = flowRef.current;
      if (!f.showFeedbackBar || f.cvPaused || adaptingRef.current || ttsBusyRef.current) return;
      if (f.awaitingContentGate !== "none") return;

      const bucket = cameraEnabled
        ? resolveEmotionBucket(hybridScores ?? {}, hybridDominant)
        : "neutral_serious";

      const now = Date.now();
      if (!bucketSinceRef.current || bucketSinceRef.current.bucket !== bucket) {
        bucketSinceRef.current = { bucket, since: now };
      }

      if (bucket === "happy") {
        if (now - lastHappyPromptAtRef.current >= HAPPY_PROMPT_COOLDOWN_MS) {
          lastHappyPromptAtRef.current = now;
          f.onCvHappyDuringFeedback();
          sync();
        }
      }
    }, CV_TICK_MS);

    return () => clearInterval(id);
  }, [flow.showFeedbackBar, flow.cvPaused, hybridScores, hybridDominant, cameraEnabled, sync]);

  // After 👍/👎 timeout — read latest CV and offer happy dismiss or format choices.
  useEffect(() => {
    if (!cvTimeoutActive) return;
    if (
      flow.showFeedbackBar ||
      flow.showModalityChoice ||
      flow.showCvHappyFollowUp ||
      flow.showBreathing
    ) {
      return;
    }

    const id = setInterval(() => {
      if (!cvTimeoutActiveRef.current) return;

      const f = flowRef.current;
      if (
        f.showFeedbackBar ||
        f.showModalityChoice ||
        f.showCvHappyFollowUp ||
        f.showBreathing
      ) {
        return;
      }
      if (adaptingRef.current || ttsBusyRef.current) return;
      if (!cameraEnabledRef.current) return;

      const scores = hybridScoresRef.current ?? {};
      const dominant = hybridDominantRef.current ?? null;
      const signal = resolveCvTimeoutSignal(scores, dominant);

      // Media Agent scores are already 3s-smoothed — act on the latest
      // reading immediately instead of waiting for repeated stable ticks.
      if (!signal) return;

      feedbackTimedOutRef.current = false;
      setCvTimeoutActive(false);
      cvTimeoutSignalRef.current = null;

      if (signal === "happy") {
        f.openCvHappyFollowUp();
        recordWinningAdaptation(f.currentModality, true);
        recordSessionOutcome(
          "understood",
          f.triedModalities.map((m) => modalityToBackendKey(m)),
        );
      } else {
        recordFailedAdaptation(f.currentModality);
        f.openCvDistressedFollowUp();
      }
      sync();
    }, CV_TICK_MS);

    return () => clearInterval(id);
  }, [
    cvTimeoutActive,
    flow.showFeedbackBar,
    flow.showModalityChoice,
    flow.showCvHappyFollowUp,
    flow.showBreathing,
    recordWinningAdaptation,
    recordFailedAdaptation,
    recordSessionOutcome,
    sync,
  ]);

  // Happy CV follow-up now offers explicit choices — it stays visible until
  // the student picks "move on"/"another option" or types the next question,
  // same as the Not-yet choice bar (no silent auto-dismiss).

  return {
    flow,
    modalityChoices,
    getInitialSendAction,
    onAssistantAnswer,
    onPreferredAnswerDelivery,
    onStudentQuestion,
    onPopupYes,
    onPopupNo,
    onThumbsUp: onPopupYes,
    onThumbsDown: onPopupNo,
    onModalityChosen,
    onCvHappyMoveOn,
    onCvHappyWantsOptions,
    onAttemptSendWhileBlocked,
    onBreathingComplete,
  };
}

async function fetchContent(
  action: string,
  sessionId: string,
  subject: string,
  lastQuestion: string,
  lastAnswer: string,
): Promise<string | undefined> {
  try {
    const token = localStorage.getItem("autistudy_token");
    const res = await fetch(`${API_BASE}/api/agent/generate-content`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        action,
        session_id: sessionId,
        subject,
        last_question: lastQuestion,
        last_answer: lastAnswer,
      }),
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.content as string | undefined;
  } catch {
    return undefined;
  }
}
