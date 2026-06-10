"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { POPUP_PROMPTS, HAPPY_POPUP_PROMPTS } from "@/lib/agent/TutorComprehensionFlow";

interface UnderstandingCheckProps {
  onUnderstood: () => void;
  onNotUnderstood: () => void;
  agentTried?: boolean;
  typingBlocked?: boolean;
  popupDancing?: boolean;
  cvHappyMode?: boolean;
  promptIndex?: number;
  happyPromptIndex?: number;
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
  popupDancing = false,
  cvHappyMode = false,
  promptIndex = 0,
  happyPromptIndex = 0,
  popupKey = "0",
}: UnderstandingCheckProps) {
  const [answered, setAnswered] = useState<"yes" | "no" | null>(null);
  const appreciation = APPRECIATIONS[Math.floor(Math.random() * APPRECIATIONS.length)];
  const prompt = cvHappyMode
    ? (HAPPY_POPUP_PROMPTS[happyPromptIndex % HAPPY_POPUP_PROMPTS.length] ??
        "You look like you understood! Did you get it? 😊")
    : (POPUP_PROMPTS[promptIndex % POPUP_PROMPTS.length] ??
        (agentTried ? "Did that help? Do you understand now? 😊" : "Did you get it? 😊"));

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

  const dancing = popupDancing && answered === null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={
        dancing
          ? { opacity: 1, y: [0, -6, 0, -4, 0], scale: [1, 1.02, 1, 1.01, 1] }
          : { opacity: 1, y: 0, scale: 1 }
      }
      transition={
        dancing
          ? { duration: 0.85, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
      }
      className={`mt-3 rounded-2xl border-2 px-4 py-4 shadow-md ${
        cvHappyMode && !typingBlocked
          ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-green-50 ring-2 ring-emerald-200"
          : typingBlocked
            ? "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 ring-2 ring-amber-200"
            : "border-glacier-200 bg-gradient-to-br from-glacier-50 to-white"
      }`}
    >
      {cvHappyMode && answered === null && (
        <p className="text-xs font-bold text-emerald-700 text-center mb-2">
          Looks like you&apos;re getting it! 😊
        </p>
      )}
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
