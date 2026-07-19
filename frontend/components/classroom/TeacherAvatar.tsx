"use client";

import { motion } from "framer-motion";

export type TeacherState = "idle" | "talking" | "pointing" | "listening";

interface TeacherAvatarProps {
  state: TeacherState;
  message?: string;
  className?: string;
}

export function TeacherAvatar({ state, message, className = "" }: TeacherAvatarProps) {
  const talking = state === "talking";
  const pointing = state === "pointing";
  const listening = state === "listening";

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <motion.div
        className="relative"
        animate={talking ? { y: [0, -3, 0] } : listening ? { scale: [1, 1.02, 1] } : { y: 0 }}
        transition={
          talking
            ? { repeat: Infinity, duration: 0.6 }
            : listening
              ? { repeat: Infinity, duration: 1.2 }
              : {}
        }
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 border-3 border-amber-300 shadow-soft relative">
          <div className="absolute top-7 left-5 w-3 h-3 rounded-full bg-deep/80" />
          <div className="absolute top-7 right-5 w-3 h-3 rounded-full bg-deep/80" />
          <motion.div
            className="absolute bottom-5 left-1/2 -translate-x-1/2 w-8 h-3 rounded-full bg-rose-300/70"
            animate={talking ? { scaleX: [1, 1.3, 1] } : {}}
            transition={talking ? { repeat: Infinity, duration: 0.35 } : {}}
          />
        </div>
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-16 h-8 bg-amber-800 rounded-t-full" />
        <div className="w-24 h-20 -mt-2 mx-auto rounded-b-2xl bg-gradient-to-b from-sky-400 to-sky-600 shadow-soft" />
        <motion.div
          className="absolute top-16 -right-6 w-14 h-3 bg-amber-200 rounded-full origin-left"
          animate={
            pointing
              ? { rotate: [-10, -35, -10] }
              : talking
                ? { rotate: [0, 8, 0] }
                : listening
                  ? { rotate: [-20, -10, -20] }
                  : { rotate: -5 }
          }
          transition={{
            duration: 0.8,
            repeat: pointing || talking ? Infinity : 0,
          }}
        />
      </motion.div>

      <p className="mt-2 text-xs font-semibold text-deep-soft text-center">
        {listening
          ? "Listening..."
          : talking
            ? "Speaking..."
            : pointing
              ? "Look at the board!"
              : "Your teacher"}
      </p>

      {message ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 max-w-[200px] rounded-2xl bg-white/90 border border-glacier-200 px-3 py-2 text-xs text-deep text-center shadow-soft"
        >
          {message}
        </motion.div>
      ) : null}
    </div>
  );
}
