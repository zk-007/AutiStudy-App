"use client";

/**
 * Gap #4 — Replace blocking "Did you get it?" popups with a simple 👍/👎 bar
 * (doc Part A, Step 4). Non-blocking: student can keep typing; no nagging.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface ThumbsFeedbackBarProps {
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  /** Changes when a new answer / help step is shown — resets local UI state. */
  feedbackKey?: string;
  /** Camera saw a smile — subtle positive hint only (doc: observe, don't force). */
  cvHappyMode?: boolean;
  adaptationRound?: number;
}

const THUMBS_UP_NOTES = [
  "Great! 🌟",
  "Nice work! ✨",
  "You got it! 👍",
];

export function ThumbsFeedbackBar({
  onThumbsUp,
  onThumbsDown,
  feedbackKey = "0",
  cvHappyMode = false,
  adaptationRound = 0,
}: ThumbsFeedbackBarProps) {
  const [answered, setAnswered] = useState<"up" | "down" | null>(null);
  const upNote = THUMBS_UP_NOTES[Math.floor(Math.random() * THUMBS_UP_NOTES.length)];

  useEffect(() => {
    setAnswered(null);
  }, [feedbackKey]);

  const handleUp = () => {
    if (answered) return;
    setAnswered("up");
    // Let the child actually read "Great! 🌟" etc. before the bar closes.
    setTimeout(onThumbsUp, 1800);
  };

  const handleDown = () => {
    if (answered) return;
    setAnswered("down");
    onThumbsDown();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`mt-3 rounded-2xl border px-4 py-3 shadow-sm ${
        cvHappyMode
          ? "border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-green-50/80"
          : "border-glacier-200/80 bg-white/70"
      }`}
      role="group"
      aria-label="Understanding feedback"
    >
      <AnimatePresence mode="wait">
        {answered === null && (
          <motion.div key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-sm font-semibold text-deep-soft text-center mb-2.5">
              {adaptationRound > 0
                ? "Did that help?"
                : "👍 if you understand · 👎 if not"}
            </p>
            <div className="flex gap-2 justify-center">
              <motion.button
                type="button"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={handleUp}
                className="flex items-center gap-2 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 text-white px-5 py-2.5 font-bold text-sm shadow-sm min-w-[7rem] justify-center"
                aria-label="I understand"
              >
                <span className="text-xl leading-none">👍</span>
                Got it
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={handleDown}
                className="flex items-center gap-2 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-400 text-white px-5 py-2.5 font-bold text-sm shadow-sm min-w-[7rem] justify-center"
                aria-label="I do not understand yet"
              >
                <span className="text-xl leading-none">👎</span>
                Not yet
              </motion.button>
            </div>
          </motion.div>
        )}

        {answered === "up" && (
          <motion.p
            key="up"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-sm font-bold text-emerald-700 text-center py-1"
          >
            {upNote}
          </motion.p>
        )}

        {answered === "down" && (
          <motion.p
            key="down"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm font-semibold text-deep-soft text-center py-1"
          >
            Let me try another way… 🤗
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
