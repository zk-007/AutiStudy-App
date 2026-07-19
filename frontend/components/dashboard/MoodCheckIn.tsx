"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MoodId } from "@/lib/api/client";

const MOODS: { id: MoodId; emoji: string; labelEn: string; labelUr: string }[] = [
  { id: "great", emoji: "😄", labelEn: "Great", labelUr: "بہت اچھا" },
  { id: "good", emoji: "🙂", labelEn: "Good", labelUr: "اچھا" },
  { id: "okay", emoji: "😐", labelEn: "Okay", labelUr: "ٹھیک" },
  { id: "tired", emoji: "😴", labelEn: "Tired", labelUr: "تھکا ہوا" },
  { id: "frustrated", emoji: "😣", labelEn: "Frustrated", labelUr: "پریشان" },
];

interface Props {
  open: boolean;
  isUr: boolean;
  title: string;
  sub: string;
  saving: boolean;
  onSelect: (mood: MoodId) => void;
  onSkip: () => void;
  skipLabel: string;
}

export function MoodCheckIn({
  open,
  isUr,
  title,
  sub,
  saving,
  onSelect,
  onSkip,
  skipLabel,
}: Props) {
  const [picked, setPicked] = useState<MoodId | null>(null);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-deep/40 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 8 }}
            className="w-full max-w-md rounded-3xl bg-white/95 border border-glacier-100 shadow-2xl p-6 md:p-8"
          >
            <h2 className="font-display text-2xl font-extrabold text-deep text-center">{title}</h2>
            <p className="mt-2 text-sm text-deep-soft text-center">{sub}</p>

            <div className="mt-6 grid grid-cols-5 gap-2">
              {MOODS.map((m) => {
                const selected = picked === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setPicked(m.id);
                      onSelect(m.id);
                    }}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 transition-all ${
                      selected
                        ? "bg-violet-100 ring-2 ring-violet-400 scale-105"
                        : "bg-glacier-50 hover:bg-glacier-100"
                    } disabled:opacity-60`}
                  >
                    <span className="text-2xl" aria-hidden>{m.emoji}</span>
                    <span className="text-[10px] font-bold text-deep-soft leading-tight text-center">
                      {isUr ? m.labelUr : m.labelEn}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onSkip}
              disabled={saving}
              className="mt-5 w-full text-center text-sm font-bold text-deep-muted hover:text-deep transition-colors"
            >
              {skipLabel}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
