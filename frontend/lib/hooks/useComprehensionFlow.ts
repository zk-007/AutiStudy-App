"use client";



import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import {

  TutorComprehensionFlow,

  POPUP_WAIT_MS,

  TEXT_READ_MS,

  IMAGE_VIEW_MS,

  type FlowSnapshot,

  type StepMcq,

} from "@/lib/agent/TutorComprehensionFlow";

import {

  classifyEmotionBucket,

  shouldAutoAdapt,

  shouldPauseCvAfterYes,

} from "@/lib/agent/emotionBuckets";

import type { LabEmotion } from "@/expression-lab/types";

import { API_BASE } from "@/lib/api/client";



const CV_TICK_MS = 2000;

const AUTO_ADAPT_STABLE_MS = 4000;

const HAPPY_PROMPT_COOLDOWN_MS = 8000;

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

  onAppendMessage: (content: string) => void;

  onGenerateImage: () => Promise<void>;

  onSpeak: (text: string) => Promise<void>;

}



export interface UseComprehensionFlowOptions {

  sessionId: string | null;

  subject: string;

  hybridScores: Partial<Record<LabEmotion, number>> | null;

  /** From HybridEmotionEngine — aligns popup happy mode with agent panel. */
  hybridDominant?: LabEmotion | null;

  cameraEnabled: boolean;

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



const CELEBRATION_INTROS = [
  "You did great sticking with it! 🌟 Let's do a quick fun check!",
  "I'm proud of you for trying! 🌈 A few easy questions to celebrate!",
  "Awesome effort! ⭐ Let's see what you remember — no pressure!",
  "You're doing wonderfully! 🎉 Quick check time — you've got this!",
];

const CELEBRATION_OUTROS = [
  "Amazing work! 🏆 You tried your best — that's what learning is all about!",
  "Super star! 🌟 You showed up and kept going — I'm so proud of you!",
  "Wonderful job! 🎈 Remember, every step forward counts!",
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recallStepMcqs(lastQuestion: string, lastAnswer: string): StepMcq[] {
  const topic = lastQuestion.trim().slice(0, 60) || "this topic";
  const snippet =
    lastAnswer.replace(/\s+/g, " ").trim().slice(0, 80) || "the explanation above";

  return [
    {
      step_label: "Remember",
      question: "Do you remember what you asked about?",
      options: [topic.slice(0, 45), "Something else", "I'm not sure"],
      correct_index: 0,
      wrong_hint: "Look at your question in the chat above and try again.",
    },
    {
      step_label: "Main idea",
      question: "What was the main idea of the answer?",
      options: [snippet.slice(0, 45), "I don't know yet", "Skip this"],
      correct_index: 0,
      wrong_hint: "Re-read the tutor's answer — pick the main idea, or choose Skip for step-by-step help.",
    },
  ];
}



export function useComprehensionFlow({

  sessionId,

  subject,

  hybridScores,

  hybridDominant,

  cameraEnabled,

  lastQuestion,

  lastAnswer,

  messageCount,
  scrollContainerRef,
  answerEndRef,
  callbacks,
}: UseComprehensionFlowOptions) {

  const flowRef = useRef(new TutorComprehensionFlow());

  const [flow, setFlow] = useState<FlowSnapshot>(() => flowRef.current.snapshot());

  const adaptingRef = useRef(false);

  const bucketSinceRef = useRef<{ bucket: string; since: number } | null>(null);

  const lastHappyPromptAtRef = useRef(0);

  const callbacksRef = useRef(callbacks);

  callbacksRef.current = callbacks;



  const sync = useCallback(() => {

    setFlow(flowRef.current.snapshot());

  }, []);



  const runAdaptation = useCallback(async (round: number) => {

    if (!sessionId || adaptingRef.current) return;

    adaptingRef.current = true;

    const f = flowRef.current;

    f.clearPopupEffects();



    try {

      if (round === 1) {

        const content = await fetchContent(

          "SHOW_FLOWCHART_STEPS",

          sessionId,

          subject,

          lastQuestion,

          lastAnswer,

        );

        if (content) {

          f.onAdaptationContent(content);

          callbacksRef.current.onAppendMessage(content);

        }

        f.onAdaptationComplete("scroll");

      } else if (round === 2) {

        callbacksRef.current.onAppendMessage("Let me read this out loud for you! 🔊");

        f.onContentDelivered("tts");

        sync();

        const text = truncateForSpeech(f.lastAdaptationContent || lastAnswer);

        if (text) await callbacksRef.current.onSpeak(text);

        f.activatePopup();

      } else if (round === 3) {
        callbacksRef.current.onAppendMessage("Here's a picture to help! 🎨");
        sync();
        await callbacksRef.current.onGenerateImage();
        f.onImageViewStart();
        sync();
        await delay(IMAGE_VIEW_MS);
        f.onImageViewEnd();
        f.activatePopup();
      } else if (round === 4) {
        f.onMcqsLoaded(recallStepMcqs(lastQuestion, lastAnswer), "recall");

      } else if (round === 5) {

        f.onBreathingStart();

      }

    } finally {

      adaptingRef.current = false;

      sync();

    }

  }, [sessionId, subject, lastQuestion, lastAnswer, sync]);



  const triggerAdaptation = useCallback(() => {
    const f = flowRef.current;
    f.clearPopupEffects();
    const round = f.onNeedAdaptation();
    sync();
    if (round) {
      void runAdaptation(round);
      return;
    }
    if (f.adaptationRound >= 5) {
      f.onLadderExhausted();
      callbacksRef.current.onAppendMessage(
        "We've tried lots of ways together! 🌿 Take a short break if you need one, or ask your question in a new way — I'm still here to help.",
      );
      sync();
    }
  }, [runAdaptation, sync]);



  const onAssistantAnswer = useCallback(() => {

    flowRef.current.onContentDelivered("scroll");

    bucketSinceRef.current = null;

    sync();

  }, [sync]);



  const onStudentQuestion = useCallback(() => {

    flowRef.current.onStudentQuestion();

    bucketSinceRef.current = null;

    sync();

  }, [sync]);



  const onPopupYes = useCallback(async () => {
    const f = flowRef.current;

    // Step 4+ — always celebrate + quiz, ignore happy/sad CV
    if (f.adaptationRound >= 4 && !f.mcqActive) {
      f.closePopupForCelebrationQuiz();
      callbacksRef.current.onAppendMessage(
        CELEBRATION_INTROS[Math.floor(Math.random() * CELEBRATION_INTROS.length)],
      );
      let mcqs = await fetchAppreciationMcqs(
        sessionId!,
        subject,
        lastQuestion,
        lastAnswer,
        f.lastAdaptationContent,
      );
      if (mcqs.length === 0) {
        mcqs = recallStepMcqs(lastQuestion, lastAnswer);
      }
      f.onMcqsLoaded(mcqs, "appreciation");
      bucketSinceRef.current = null;
      sync();
      return;
    }

    const bucket = resolveEmotionBucket(hybridScores ?? {}, hybridDominant);
    const pause = shouldPauseCvAfterYes(bucket);
    f.onPopupYes(pause);
    bucketSinceRef.current = null;
    sync();
  }, [hybridScores, sync, sessionId, subject, lastQuestion, lastAnswer]);



  const onPopupNo = useCallback(() => {

    triggerAdaptation();

  }, [triggerAdaptation]);



  const onAttemptSendWhileBlocked = useCallback((): boolean => {

    const blocked = flowRef.current.onAttemptSendWhileBlocked();

    sync();

    return blocked;

  }, [sync]);



  const onBreathingComplete = useCallback(() => {

    flowRef.current.onBreathingComplete();

    sync();

  }, [sync]);



  const onMcqAnswered = useCallback(
    async (result: { correct: boolean; defer?: boolean }) => {
      const f = flowRef.current;
      if (result.defer && f.mcqPhase === "recall" && f.mcqIndex === 1) {
        let teaching = await fetchTeachingMcqs(
          sessionId!,
          subject,
          lastQuestion,
          lastAnswer,
          f.lastAdaptationContent,
        );
        if (teaching.length === 0) {
          teaching = await fetchStepMcqs(sessionId!, subject, lastQuestion, lastAnswer);
        }
        f.onTeachingMcqsLoaded(teaching);
        sync();
        return;
      }
      const outcome = f.onMcqAnswered(result.correct);
      if (outcome === "celebrate") {
        callbacksRef.current.onAppendMessage(
          CELEBRATION_OUTROS[Math.floor(Math.random() * CELEBRATION_OUTROS.length)],
        );
      }
      sync();
    },
    [sessionId, subject, lastQuestion, lastAnswer, sync],
  );



  // End-marker + read gate: IntersectionObserver on answer end + 30s read window
  useEffect(() => {
    if (!flow.pendingPopup || flow.popupGate !== "scroll") return;

    const container = scrollContainerRef.current;
    const marker = answerEndRef.current;
    if (!container || !marker) return;

    let endVisible = false;

    const tryActivate = () => {
      const f = flowRef.current;
      if (!f.pendingPopup || f.popupGate !== "scroll") return;

      const deliveredAt = f.contentDeliveredAt || Date.now();
      const readTimeOk = Date.now() - deliveredAt >= TEXT_READ_MS;

      if (readTimeOk && endVisible) {
        f.activatePopup();
        sync();
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        endVisible = entries.some((e) => e.isIntersecting);
        tryActivate();
      },
      { root: container, threshold: 0.25 },
    );

    observer.observe(marker);
    const interval = setInterval(tryActivate, 1000);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [
    flow.pendingPopup,
    flow.popupGate,
    flow.contentDeliveredAt,
    messageCount,
    scrollContainerRef,
    answerEndRef,
    sync,
  ]);



  // CV monitoring during popup wait

  useEffect(() => {

    if (!flow.showPopup || flow.cvPaused || adaptingRef.current) return;



    const id = setInterval(() => {

      const f = flowRef.current;

      if (!f.showPopup || f.cvPaused) return;



      const bucket = cameraEnabled

        ? resolveEmotionBucket(hybridScores ?? {}, hybridDominant)

        : "neutral_serious";



      const now = Date.now();

      if (!bucketSinceRef.current || bucketSinceRef.current.bucket !== bucket) {

        bucketSinceRef.current = { bucket, since: now };

      }

      const stableFor = now - (bucketSinceRef.current?.since ?? now);



      if (bucket === "happy") {
        if (now - lastHappyPromptAtRef.current >= HAPPY_PROMPT_COOLDOWN_MS) {
          lastHappyPromptAtRef.current = now;
          f.onCvHappyDuringWait();
          sync();
        }
        return;
      }

      const timedOut = f.popupTimedOut();

      const shouldAdapt =

        shouldAutoAdapt(bucket) &&

        (timedOut || stableFor >= AUTO_ADAPT_STABLE_MS || bucket === "distressed");



      if (shouldAdapt && !adaptingRef.current) {

        triggerAdaptation();

      }

    }, CV_TICK_MS);



    return () => clearInterval(id);

  }, [

    flow.showPopup,

    flow.cvPaused,

    hybridScores,

    hybridDominant,

    cameraEnabled,

    triggerAdaptation,

    sync,

  ]);



  return {

    flow,

    onAssistantAnswer,

    onStudentQuestion,

    onPopupYes,

    onPopupNo,

    onAttemptSendWhileBlocked,

    onBreathingComplete,

    onMcqAnswered,

    popupWaitMs: POPUP_WAIT_MS,

    textReadMs: TEXT_READ_MS,

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



async function fetchAppreciationMcqs(
  sessionId: string,
  subject: string,
  lastQuestion: string,
  lastAnswer: string,
  adaptationContent: string,
): Promise<StepMcq[]> {
  try {
    const token = localStorage.getItem("autistudy_token");
    const res = await fetch(`${API_BASE}/api/agent/step-mcqs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        session_id: sessionId,
        subject,
        last_question: lastQuestion,
        last_answer: lastAnswer,
        adaptation_content: adaptationContent,
        mode: "appreciation",
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.questions ?? []) as StepMcq[];
  } catch {
    return [];
  }
}

async function fetchTeachingMcqs(
  sessionId: string,
  subject: string,
  lastQuestion: string,
  lastAnswer: string,
  adaptationContent: string,
): Promise<StepMcq[]> {
  try {
    const token = localStorage.getItem("autistudy_token");
    const res = await fetch(`${API_BASE}/api/agent/step-mcqs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        session_id: sessionId,
        subject,
        last_question: lastQuestion,
        last_answer: lastAnswer,
        adaptation_content: adaptationContent,
        mode: "teaching",
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.questions ?? []) as StepMcq[];
  } catch {
    return [];
  }
}

async function fetchStepMcqs(

  sessionId: string,

  subject: string,

  lastQuestion: string,

  lastAnswer: string,

): Promise<StepMcq[]> {

  try {

    const token = localStorage.getItem("autistudy_token");

    const res = await fetch(`${API_BASE}/api/agent/step-mcqs`, {

      method: "POST",

      headers: {

        "Content-Type": "application/json",

        ...(token ? { Authorization: `Bearer ${token}` } : {}),

      },

      body: JSON.stringify({

        session_id: sessionId,

        subject,

        last_question: lastQuestion,

        last_answer: lastAnswer,

      }),

    });

    if (!res.ok) return [];

    const data = await res.json();

    return (data.questions ?? []) as StepMcq[];

  } catch {

    return [];

  }

}


