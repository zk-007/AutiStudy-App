"use client";

import { useCallback, useRef, useState } from "react";
import { classroomApi, chatApi } from "@/lib/api/client";
import { playTtsAudio } from "@/lib/audio/playTtsAudio";
import type {
  ClassroomLesson,
  InputMode,
  LessonPhase,
  TeachingAttempt,
} from "@/lib/classroom/types";

const CHECK_PHRASE_EN =
  "Did you understand? If yes, tap the green button. If not, I can explain again in a new way.";
const CHECK_PHRASE_UR =
  "Samajh aayi? Agar haan, to green button dabao. Agar nahi, to main dobara samjhaungi.";

export function useClassroomLesson(subject: string, language: "en" | "ur" = "en") {
  const [lesson, setLesson] = useState<ClassroomLesson | null>(null);
  const [phase, setPhase] = useState<LessonPhase>("idle");
  const [retryCount, setRetryCount] = useState(0);
  const [attemptHistory, setAttemptHistory] = useState<TeachingAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [eraseSignal, setEraseSignal] = useState(0);
  const [teacherTalking, setTeacherTalking] = useState(false);
  const [teacherMessage, setTeacherMessage] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const boardDoneRef = useRef<(() => void) | null>(null);
  const lockedQuestionRef = useRef<string>("");

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setTeacherTalking(false);
  }, []);

  const playVoice = useCallback(
    async (script: string) => {
      stopAudio();
      if (!script.trim()) return;
      try {
        const res = await chatApi.speak(script, language);
        const bytes = atob(res.audio_base64);
        const buf = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
        const blob = new Blob([buf], { type: res.mime_type || "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        setTeacherTalking(true);
        await playTtsAudio(audio, { playbackRate: language === "ur" ? 0.92 : 1 });
        URL.revokeObjectURL(url);
      } catch (err) {
        console.warn("[classroom] TTS failed:", err);
      } finally {
        setTeacherTalking(false);
        audioRef.current = null;
      }
    },
    [language, stopAudio],
  );

  const waitForBoard = useCallback(() => {
    return new Promise<void>((resolve) => {
      boardDoneRef.current = resolve;
    });
  }, []);

  const onBoardComplete = useCallback(() => {
    setPlaying(false);
    boardDoneRef.current?.();
    boardDoneRef.current = null;
  }, []);

  const runTeachingFlow = useCallback(
    async (data: ClassroomLesson, heardQuestion: string) => {
      const style = data.teaching_style || "diagram";
      const diagram = data.diagram_used || "custom";
      setTeacherMessage(
        data.retry_count > 0
          ? `Same question — new way! (${style}: ${diagram})`
          : `Good question! Let me explain "${heardQuestion}" on the board.`,
      );
      setPhase("playing");
      setPlaying(true);

      const boardPromise = waitForBoard();
      const explainPromise = playVoice(data.voice_script);
      await Promise.all([boardPromise, explainPromise]);

      setPhase("asking");
      setTeacherMessage("Samajh aayi? Did you understand?");
      const checkPhrase = language === "ur" ? CHECK_PHRASE_UR : CHECK_PHRASE_EN;
      await playVoice(checkPhrase);

      setPhase("finished");
      setTeacherMessage("Tap a button below — same topic, I'll try a new style if needed!");
    },
    [language, playVoice, waitForBoard],
  );

  const askQuestion = useCallback(
    async (question: string, inputMode: InputMode = "type") => {
      setError(null);
      setPhase("loading");
      setPlaying(false);
      stopAudio();
      lockedQuestionRef.current = question;
      setAttemptHistory([]);
      setRetryCount(0);
      setTeacherMessage(
        inputMode === "speak"
          ? "I heard your question. Planning your visual lesson..."
          : "Planning a visual lesson for your question...",
      );

      try {
        const data = await classroomApi.lesson({
          question,
          subject,
          retry_count: 0,
          language,
          input_mode: inputMode,
          attempt_history: [],
        });
        setLesson(data as ClassroomLesson);
        void runTeachingFlow(data as ClassroomLesson, question);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not build lesson");
        setPhase("idle");
        setTeacherMessage("");
      }
    },
    [subject, language, stopAudio, runTeachingFlow],
  );

  const retryLesson = useCallback(async () => {
    const lockedQ = lockedQuestionRef.current || lesson?.question;
    if (!lockedQ) return;

    const prevAttempt: TeachingAttempt = {
      teaching_style: lesson?.teaching_style || "unknown",
      diagram: lesson?.diagram_used || "unknown",
      understood: false,
    };
    const newHistory = [...attemptHistory, prevAttempt];

    setError(null);
    setPhase("loading");
    setPlaying(false);
    stopAudio();
    setEraseSignal((n) => n + 1);
    setTeacherMessage(
      `Same question — let me try a different way (${newHistory.length + 1}${getOrdinal(newHistory.length + 1)} try)...`,
    );

    const nextRetry = retryCount + 1;
    try {
      await new Promise((r) => setTimeout(r, 500));
      const data = await classroomApi.lesson({
        question: lockedQ,
        subject,
        retry_count: nextRetry,
        language,
        input_mode: "type",
        attempt_history: newHistory,
      });
      setAttemptHistory(newHistory);
      setLesson(data as ClassroomLesson);
      setRetryCount(nextRetry);
      void runTeachingFlow(data as ClassroomLesson, lockedQ);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retry lesson");
      setPhase("idle");
      setTeacherMessage("");
    }
  }, [lesson, retryCount, attemptHistory, subject, language, stopAudio, runTeachingFlow]);

  const reset = useCallback(() => {
    stopAudio();
    setLesson(null);
    setPhase("idle");
    setRetryCount(0);
    setAttemptHistory([]);
    lockedQuestionRef.current = "";
    setPlaying(false);
    setEraseSignal((n) => n + 1);
    setError(null);
    setTeacherMessage("Ask me anything — type or tap the mic!");
  }, [stopAudio]);

  return {
    lesson,
    phase,
    error,
    playing,
    eraseSignal,
    retryCount,
    attemptHistory,
    teacherTalking,
    teacherMessage,
    askQuestion,
    retryLesson,
    reset,
    stopAudio,
    onBoardComplete,
  };
}

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
