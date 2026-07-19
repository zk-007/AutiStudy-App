"use client";

import { motion } from "framer-motion";
import {
  MODALITY_LABELS,
  type ModalityChoice,
} from "@/lib/agent/teachingModalities";

interface ModalityChoiceBarProps {
  choices: ModalityChoice[];
  onPick: (choice: ModalityChoice) => void;
  prompt?: string;
}

export function ModalityChoiceBar({ choices, onPick, prompt }: ModalityChoiceBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 shadow-sm"
      role="group"
      aria-label="Choose how to learn next"
    >
      <p className="text-sm font-semibold text-deep text-center mb-2.5">
        {prompt ?? "Which would help you understand better?"}
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {choices.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            className={`rounded-2xl px-4 py-2 text-xs font-bold transition-all hover:-translate-y-0.5 ${
              c === "next_question"
                ? "bg-white border border-glacier-200 text-deep-soft hover:bg-glacier-50"
                : c === "breathing"
                  ? "bg-teal-500 text-white shadow-sm"
                  : "bg-gradient-to-br from-glacier-500 to-deep text-white shadow-sm"
            }`}
          >
            {MODALITY_LABELS[c]}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
