"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

interface PostBreathingChoiceModalProps {
  open: boolean;
  onRetry: () => void;
  onNewQuestion: () => void;
}

export function PostBreathingChoiceModal({
  open,
  onRetry,
  onNewQuestion,
}: PostBreathingChoiceModalProps) {
  const { locale } = useLocale();
  const isUr = locale === "ur";
  useBodyScrollLock(open);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            className="w-full max-w-md rounded-3xl bg-white shadow-2xl p-6 text-center"
          >
            <h2 className="font-display text-lg font-extrabold text-deep mb-4">
              {isUr ? "آپ کیا کرنا چاہیں گے؟" : "What would you like to do?"}
            </h2>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="rounded-2xl bg-violet-600 px-4 py-3 font-bold text-white hover:bg-violet-700"
              >
                {isUr ? "🔄 وہی سوال دوبارہ" : "🔄 Try same question again"}
              </button>
              <button
                type="button"
                onClick={onNewQuestion}
                className="rounded-2xl border-2 border-glacier-200 px-4 py-3 font-bold text-deep hover:bg-glacier-50"
              >
                {isUr ? "✏️ نیا سوال پوچھیں" : "✏️ Ask a new question"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
