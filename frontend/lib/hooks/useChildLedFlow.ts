"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api/client";
import type { GenerateVisualAidOptions } from "@/lib/api/client";
import {
  ALL_MODALITIES,
  type ChildLedFeedbackPayload,
  type LearningPreferences,
  type Modality,
  type ThumbsFeedback,
  preferredFormatForModality,
} from "@/lib/agent/childLedTypes";

export interface ChildLedCallbacks {
  onAppendMessage: (content: string) => void;
  onGenerateImage: (options?: GenerateVisualAidOptions) => Promise<void>;
  onSpeak: (text: string) => Promise<void>;
  getAssistantIndex: () => number;
}

export interface ChildLedFlowState {
  preferences: LearningPreferences | null;
  prefsLoaded: boolean;
  pendingFeedbackIndex: number | null;
  feedbackByIndex: Record<number, ThumbsFeedback>;
  usedModalities: Modality[];
  currentModality: Modality | null;
  showModalityPicker: boolean;
  pickerOptions: Modality[];
  showBreathing: boolean;
  showPostBreathingChoice: boolean;
  feedbackReminder: boolean;
  delivering: boolean;
  activeQuestion: string;
  inputBlocked: boolean;
  needsFeedback: boolean;
  needsOnboarding: boolean;
}

async function apiGetPrefs(): Promise<LearningPreferences> {
  const token = localStorage.getItem("autistudy_token");
  const res = await fetch(`${API_BASE}/api/agent/learning-preferences`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to load preferences");
  return res.json();
}

async function apiSavePrefs(order: Modality[]): Promise<LearningPreferences> {
  const token = localStorage.getItem("autistudy_token");
  const res = await fetch(`${API_BASE}/api/agent/learning-preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ modality_order: order }),
  });
  if (!res.ok) throw new Error("Failed to save preferences");
  return res.json();
}

async function apiFeedback(body: ChildLedFeedbackPayload): Promise<LearningPreferences> {
  const token = localStorage.getItem("autistudy_token");
  const res = await fetch(`${API_BASE}/api/agent/child-led/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to record feedback");
  return res.json();
}

async function fetchStepContent(
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
        action: "SHOW_FLOWCHART_STEPS",
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

export function useChildLedFlow({
  sessionId,
  subject,
  studentEmail,
  callbacks,
}: {
  sessionId: string | null;
  subject: string;
  studentEmail: string | null;
  callbacks: ChildLedCallbacks;
}) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const [preferences, setPreferences] = useState<LearningPreferences | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [pendingFeedbackIndex, setPendingFeedbackIndex] = useState<number | null>(null);
  const [feedbackByIndex, setFeedbackByIndex] = useState<Record<number, ThumbsFeedback>>({});
  const [usedModalities, setUsedModalities] = useState<Modality[]>([]);
  const [currentModality, setCurrentModality] = useState<Modality | null>(null);
  const [showModalityPicker, setShowModalityPicker] = useState(false);
  const [pickerOptions, setPickerOptions] = useState<Modality[]>([]);
  const [showBreathing, setShowBreathing] = useState(false);
  const [showPostBreathingChoice, setShowPostBreathingChoice] = useState(false);
  const [feedbackReminder, setFeedbackReminder] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState("");
  const [lastAnswerText, setLastAnswerText] = useState("");

  const effectiveOrder = preferences?.effective_order?.length
    ? preferences.effective_order
    : ALL_MODALITIES;

  useEffect(() => {
    if (!studentEmail) {
      setPrefsLoaded(true);
      return;
    }
    apiGetPrefs()
      .then(setPreferences)
      .catch(() =>
        setPreferences({
          setup_complete: false,
          modality_order: [...ALL_MODALITIES],
          modality_scores: {},
          effective_order: [...ALL_MODALITIES],
        }),
      )
      .finally(() => setPrefsLoaded(true));
  }, [studentEmail]);

  const savePreferences = useCallback(async (order: Modality[]) => {
    const prefs = await apiSavePrefs(order);
    setPreferences(prefs);
    return prefs;
  }, []);

  const deliverModality = useCallback(
    async (mod: Modality, answerText: string, question: string) => {
      if (!sessionId) return;
      setDelivering(true);
      try {
        const cb = callbacksRef.current;
        if (mod === "voice" && answerText.trim()) {
          await cb.onSpeak(answerText);
        } else if (mod === "image") {
          await cb.onGenerateImage({ attachTo: "last" });
        } else if (mod === "steps") {
          const content = await fetchStepContent(sessionId, subject, question, answerText);
          if (content) {
            cb.onAppendMessage(content);
          }
        }
      } finally {
        setDelivering(false);
      }
    },
    [sessionId, subject],
  );

  const onNewUserQuestion = useCallback((question: string) => {
    setActiveQuestion(question);
    setUsedModalities([]);
    setCurrentModality(null);
    setShowModalityPicker(false);
    setFeedbackReminder(false);
    setPendingFeedbackIndex(null);
  }, []);

  const getFirstModality = useCallback((): Modality => {
    return effectiveOrder[0] ?? "text";
  }, [effectiveOrder]);

  const getPreferredSendFormat = useCallback((): string => {
    const first = getFirstModality();
    return preferredFormatForModality(first);
  }, [getFirstModality]);

  const onBookAnswer = useCallback(
    async (messageIndex: number, question: string, answerText: string) => {
      setActiveQuestion(question);
      setLastAnswerText(answerText);
      setPendingFeedbackIndex(messageIndex);
      setFeedbackReminder(false);

      const first = getFirstModality();
      setCurrentModality(first);
      setUsedModalities([first]);

      if (first === "voice") {
        await deliverModality("voice", answerText, question);
      } else if (first === "image") {
        await deliverModality("image", answerText, question);
      }
      // text / steps: answer already delivered via chat send format
    },
    [deliverModality, getFirstModality],
  );

  const recordFeedback = useCallback(
    async (payload: Omit<ChildLedFeedbackPayload, "question" | "subject">) => {
      if (!studentEmail) return;
      try {
        const prefs = await apiFeedback({
          question: activeQuestion,
          subject,
          ...payload,
        });
        setPreferences(prefs);
      } catch {
        /* memory optional */
      }
    },
    [activeQuestion, subject, studentEmail],
  );

  const onThumbsUp = useCallback(
    async (messageIndex: number) => {
      setFeedbackByIndex((prev) => ({ ...prev, [messageIndex]: "up" }));
      setPendingFeedbackIndex(null);
      setShowModalityPicker(false);
      setFeedbackReminder(false);
      await recordFeedback({
        modality: currentModality ?? "text",
        feedback: "up",
      });
    },
    [currentModality, recordFeedback],
  );

  const onThumbsDown = useCallback(
    async (messageIndex: number) => {
      setFeedbackByIndex((prev) => ({ ...prev, [messageIndex]: "down" }));
      setFeedbackReminder(false);
      await recordFeedback({
        modality: currentModality ?? "text",
        feedback: "down",
      });

      const remaining = effectiveOrder.filter((m) => !usedModalities.includes(m));
      if (remaining.length === 0) {
        setShowModalityPicker(false);
        setShowBreathing(true);
        await recordFeedback({
          modality: currentModality ?? "text",
          feedback: "down",
          break_after_fail: true,
        });
        return;
      }

      setPickerOptions(remaining);
      setShowModalityPicker(true);
    },
    [currentModality, effectiveOrder, recordFeedback, usedModalities],
  );

  const onPickModality = useCallback(
    async (mod: Modality) => {
      setShowModalityPicker(false);
      setCurrentModality(mod);
      setUsedModalities((prev) => [...prev, mod]);
      setFeedbackByIndex({});
      const idx = callbacksRef.current.getAssistantIndex();
      setPendingFeedbackIndex(idx);
      await recordFeedback({
        modality: mod,
        feedback: "down",
        child_selected: true,
      });
      await deliverModality(mod, lastAnswerText, activeQuestion);
    },
    [activeQuestion, deliverModality, lastAnswerText, recordFeedback],
  );

  const onSkipQuestion = useCallback(async () => {
    setShowModalityPicker(false);
    setPendingFeedbackIndex(null);
    setFeedbackReminder(false);
    await recordFeedback({
      modality: currentModality ?? "text",
      feedback: "down",
      skipped: true,
    });
  }, [currentModality, recordFeedback]);

  const onAttemptSendWithoutFeedback = useCallback((): boolean => {
    if (pendingFeedbackIndex === null) return false;
    setFeedbackReminder(true);
    return true;
  }, [pendingFeedbackIndex]);

  const onBreathingComplete = useCallback(() => {
    setShowBreathing(false);
    setShowPostBreathingChoice(true);
  }, []);

  const onRetrySameQuestion = useCallback(async () => {
    setShowPostBreathingChoice(false);
    setUsedModalities([]);
    const best = effectiveOrder[0] ?? "text";
    setCurrentModality(best);
    setUsedModalities([best]);
    const idx = callbacksRef.current.getAssistantIndex();
    setPendingFeedbackIndex(idx);
    await deliverModality(best, lastAnswerText, activeQuestion);
  }, [activeQuestion, deliverModality, effectiveOrder, lastAnswerText]);

  const onNewQuestionAfterBreak = useCallback(async () => {
    setShowPostBreathingChoice(false);
    setPendingFeedbackIndex(null);
    setUsedModalities([]);
    setCurrentModality(null);
    await recordFeedback({
      modality: currentModality ?? "text",
      feedback: "down",
      skipped: true,
    });
  }, [currentModality, recordFeedback]);

  const inputBlocked =
    delivering || showModalityPicker || showBreathing || showPostBreathingChoice;
  const needsFeedback = pendingFeedbackIndex !== null;

  const state: ChildLedFlowState = {
    preferences,
    prefsLoaded,
    pendingFeedbackIndex,
    feedbackByIndex,
    usedModalities,
    currentModality,
    showModalityPicker,
    pickerOptions,
    showBreathing,
    showPostBreathingChoice,
    feedbackReminder,
    delivering,
    activeQuestion,
    inputBlocked,
    needsFeedback,
    needsOnboarding: prefsLoaded && !!studentEmail && !preferences?.setup_complete,
  };

  return {
    state,
    savePreferences,
    onNewUserQuestion,
    onBookAnswer,
    onThumbsUp,
    onThumbsDown,
    onPickModality,
    onSkipQuestion,
    onAttemptSendWithoutFeedback,
    onBreathingComplete,
    onRetrySameQuestion,
    onNewQuestionAfterBreak,
    getPreferredSendFormat,
    getFirstModality,
  };
}
