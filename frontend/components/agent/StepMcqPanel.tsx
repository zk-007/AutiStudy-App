"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import type { StepMcq } from "@/lib/agent/TutorComprehensionFlow";

export interface McqAnswerResult {
  correct: boolean;
  defer?: boolean;
  pickedIndex: number;
}

interface StepMcqPanelProps {
  question: StepMcq;
  stepNumber: number;
  totalSteps: number;
  /** When true, Skip / Don't know triggers step-by-step teaching MCQs */
  allowTeachingDefer?: boolean;
  onAnswer: (result: McqAnswerResult) => void;
}

function isDeferOption(label: string): boolean {
  return /skip|don'?t know|not sure|something else/i.test(label.trim());
}

export function StepMcqPanel({
  question,
  stepNumber,
  totalSteps,
  allowTeachingDefer = false,
  onAnswer,
}: StepMcqPanelProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handlePick = (idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    const option = question.options[idx] ?? "";
    const isCorrect = idx === question.correct_index;
    const defer = !isCorrect && isDeferOption(option) && allowTeachingDefer;

    if (defer) {
      setFeedback("No worries — let's go step by step! 📚");
      setTimeout(
        () => onAnswer({ correct: false, defer: true, pickedIndex: idx }),
        900,
      );
      return;
    }

    if (isCorrect) {
      setFeedback("Great job! 🌟");
      setTimeout(() => onAnswer({ correct: true, pickedIndex: idx }), 900);
    } else {
      setFeedback(
        question.wrong_hint ??
          "Not quite — read the hint above and try again! 💡",
      );
      setTimeout(() => {
        setPicked(null);
        setFeedback(null);
      }, 2200);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white px-4 py-4"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600">
          Quick check {stepNumber}/{totalSteps}
        </span>
        <span className="text-[10px] text-violet-500">{question.step_label}</span>
      </div>
      <p className="text-sm font-bold text-deep mb-3">{question.question}</p>
      <div className="grid gap-2">
        {question.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            disabled={picked !== null && picked === question.correct_index}
            onClick={() => handlePick(i)}
            className={`rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all border ${
              picked === i
                ? i === question.correct_index
                  ? "border-green-400 bg-green-50 text-green-800"
                  : "border-amber-400 bg-amber-50 text-amber-900"
                : "border-violet-100 bg-white hover:border-violet-300 text-deep"
            } disabled:cursor-default`}
          >
            {opt}
          </button>
        ))}
      </div>
      {feedback && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 text-xs font-semibold text-center text-violet-700"
        >
          {feedback}
        </motion.p>
      )}
    </motion.div>
  );
}
