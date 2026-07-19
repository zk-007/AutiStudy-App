"use client";

import { motion } from "framer-motion";

interface CvHappyFollowUpBarProps {
  message: string;
  moveOnLabel: string;
  anotherOptionLabel: string;
  onMoveOn: () => void;
  onAnotherOption: () => void;
}

export function CvHappyFollowUpBar({
  message,
  moveOnLabel,
  anotherOptionLabel,
  onMoveOn,
  onAnotherOption,
}: CvHappyFollowUpBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mt-3 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/90 to-green-50/90 px-4 py-3 shadow-sm"
      role="group"
      aria-label="Understanding check"
    >
      <p className="text-sm font-semibold text-emerald-800 text-center mb-2.5">{message}</p>
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          type="button"
          onClick={onMoveOn}
          className="rounded-2xl px-4 py-2 text-xs font-bold text-white bg-gradient-to-br from-emerald-500 to-green-600 shadow-sm transition-all hover:-translate-y-0.5"
        >
          {moveOnLabel}
        </button>
        <button
          type="button"
          onClick={onAnotherOption}
          className="rounded-2xl px-4 py-2 text-xs font-bold text-emerald-800 bg-white border border-emerald-200 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-50"
        >
          {anotherOptionLabel}
        </button>
      </div>
    </motion.div>
  );
}
