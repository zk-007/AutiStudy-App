"use client";

import { motion } from "framer-motion";
import type { ThumbsFeedback } from "@/lib/agent/childLedTypes";

interface FeedbackBarProps {
  feedback: ThumbsFeedback | null;
  onUp: () => void;
  onDown: () => void;
  disabled?: boolean;
  highlight?: boolean;
  isUr?: boolean;
}

export function FeedbackBar({
  feedback,
  onUp,
  onDown,
  disabled = false,
  highlight = false,
  isUr = false,
}: FeedbackBarProps) {
  if (feedback === "up") {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mt-3 flex justify-center"
      >
        <div className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-2.5 text-white font-bold text-sm shadow-md">
          <span className="text-xl">👍</span>
          {isUr ? "سمجھ آ گیا!" : "Got it!"}
        </div>
      </motion.div>
    );
  }

  if (feedback === "down") {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mt-3 flex justify-center"
      >
        <div className="inline-flex items-center gap-2 rounded-2xl bg-rose-500 px-5 py-2.5 text-white font-bold text-sm shadow-md">
          <span className="text-xl">👎</span>
          {isUr ? "ابھی نہیں سمجھ آیا" : "Not yet"}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      animate={highlight ? { scale: [1, 1.03, 1] } : {}}
      transition={highlight ? { duration: 0.6, repeat: Infinity } : {}}
      className="mt-3 flex gap-3 justify-center"
    >
      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        disabled={disabled}
        onClick={onUp}
        className="flex items-center gap-2 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 px-5 py-2.5 text-white font-bold text-sm shadow-md disabled:opacity-50"
      >
        <span className="text-xl">👍</span>
        {isUr ? "سمجھ آ گیا" : "Got it"}
      </motion.button>
      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        disabled={disabled}
        onClick={onDown}
        className="flex items-center gap-2 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-400 px-5 py-2.5 text-white font-bold text-sm shadow-md disabled:opacity-50"
      >
        <span className="text-xl">👎</span>
        {isUr ? "ابھی نہیں" : "Not yet"}
      </motion.button>
    </motion.div>
  );
}
