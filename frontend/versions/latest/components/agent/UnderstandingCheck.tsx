"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { POPUP_PROMPTS } from "@/lib/agent/TutorComprehensionFlow";

interface UnderstandingCheckProps {
  onUnderstood: () => void;
  onNotUnderstood: () => void;
  agentTried?: boolean;
  typingBlocked?: boolean;
  promptIndex?: number;
  popupKey?: string;
}

const APPRECIATIONS = [
  "Amazing! 🌟 You're so smart! Keep going!",
  "Wonderful! 🎉 You got it! I'm so proud of you!",
  "Excellent work! ⭐ You're a superstar learner!",
  "Great job! 🌈 You understood it perfectly!",
  "You did it! 🏆 That's brilliant thinking!",
];

export function UnderstandingCheck({
  onUnderstood,
  onNotUnderstood,
  agentTried = false,
  typingBlocked = false,
  promptIndex = 0,
  popupKey = "0",
}: UnderstandingCheckProps) {
  const [answered, setAnswered] = useState<"yes" | "no" | null>(null);
  const appreciation = APPRECIATIONS[Math.floor(Math.random() * APPRECIATIONS.length)];
  const prompt =
    POPUP_PROMPTS[promptIndex % POPUP_PROMPTS.length] ??
    (agentTried ? "Did that help? Do you understand now? 😊" : "Did you get it? 😊");

  useEffect(() => {
    setAnswered(null);
  }, [popupKey]);

  const handleYes = () => {
    setAnswered("yes");
    setTimeout(onUnderstood, 1200);
  };

  const handleNo = () => {
    setAnswered("no");
    onNotUnderstood();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`mt-3 rounded-2xl border-2 px-4 py-4 shadow-md ${
        typingBlocked
          ? "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 ring-2 ring-amber-200"
          : "border-glacier-200 bg-gradient-to-br from-glacier-50 to-white"
      }`}
    >
      {typingBlocked && answered === null && (
        <p className="text-xs font-bold text-amber-700 text-center mb-2 animate-pulse">
          Please tap Yes or Not yet before typing 👇
        </p>
      )}
      <AnimatePresence mode="wait">
        {answered === null && (
          <motion.div key="question" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-sm font-bold text-deep mb-3 text-center">{prompt}</p>
            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleYes}
                className="flex-1 flex flex-col items-center gap-1.5 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 text-white py-3 font-bold text-sm shadow-md"
              >
                <span className="text-2xl">✅</span>
                Yes, I got it!
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleNo}
                className="flex-1 flex flex-col items-center gap-1.5 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-400 text-white py-3 font-bold text-sm shadow-md"
              >
                <span className="text-2xl">😕</span>
                Not yet...
              </motion.button>
            </div>
          </motion.div>
        )}

        {answered === "yes" && (
          <motion.div
            key="yes"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center gap-2"
          >
            <motion.div
              animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5 }}
              className="text-5xl"
            >
              🌟
            </motion.div>
            <p className="text-base font-extrabold text-deep">{appreciation}</p>
          </motion.div>
        )}

        {answered === "no" && (
          <motion.p
            key="no"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm font-semibold text-deep text-center"
          >
            No worries — let me try another way! 🤗
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
