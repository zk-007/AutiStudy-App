"use client";

/**
 * Optional break / rest prompt — student picks, agent never nags in chat.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

interface StudyOrRestChoiceProps {
  variant: "break" | "tomorrow";
  onKeepStudying: () => void;
  onRest: () => void;
}

export function StudyOrRestChoice({ variant, onKeepStudying, onRest }: StudyOrRestChoiceProps) {
  const [answered, setAnswered] = useState<"study" | "rest" | null>(null);

  const title =
    variant === "tomorrow"
      ? "You've been working hard! What would you like to do? 🌙"
      : "Want to pause for a bit, or keep going? ☕";

  const handleStudy = () => {
    setAnswered("study");
    setTimeout(onKeepStudying, 600);
  };

  const handleRest = () => {
    setAnswered("rest");
    setTimeout(onRest, 600);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mt-3 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white px-4 py-4"
    >
      <AnimatePresence mode="wait">
        {answered === null && (
          <motion.div key="question" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-sm font-bold text-deep mb-3 text-center">{title}</p>
            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleStudy}
                className="flex-1 flex flex-col items-center gap-1.5 rounded-2xl bg-gradient-to-br from-glacier-400 to-deep text-white py-3 font-bold text-sm shadow-md"
              >
                <span className="text-2xl">📚</span>
                Keep studying
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRest}
                className="flex-1 flex flex-col items-center gap-1.5 rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 text-white py-3 font-bold text-sm shadow-md"
              >
                <span className="text-2xl">{variant === "tomorrow" ? "😴" : "☕"}</span>
                {variant === "tomorrow" ? "Rest for tonight" : "Take a break"}
              </motion.button>
            </div>
          </motion.div>
        )}

        {answered === "study" && (
          <motion.p
            key="study"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm font-semibold text-deep text-center"
          >
            Awesome! Let&apos;s keep learning together! 🌟
          </motion.p>
        )}

        {answered === "rest" && (
          <motion.p
            key="rest"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm font-semibold text-deep text-center"
          >
            Great effort today! Rest up — your lessons will be here when you&apos;re ready. 💤
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
