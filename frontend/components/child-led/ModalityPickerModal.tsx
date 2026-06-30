"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { Modality } from "@/lib/agent/childLedTypes";
import { MODALITY_LABELS } from "@/lib/agent/childLedTypes";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

interface ModalityPickerModalProps {
  open: boolean;
  options: Modality[];
  onSelect: (mod: Modality) => void;
  onSkip: () => void;
  onClose?: () => void;
}

export function ModalityPickerModal({
  open,
  options,
  onSelect,
  onSkip,
}: ModalityPickerModalProps) {
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
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 12 }}
            className="w-full max-w-md rounded-3xl bg-white shadow-2xl p-6"
          >
            <h2 className="font-display text-lg font-extrabold text-deep text-center mb-2">
              {isUr
                ? "ٹھیک ہے، کیا میں دوسرے طریقے سے سمجھاؤں؟"
                : "Want me to explain another way?"}
            </h2>
            <p className="text-xs text-deep-soft text-center mb-5">
              {isUr ? "ایک option چنیں:" : "Pick one:"}
            </p>
            <div className="flex flex-col gap-2">
              {options.map((mod) => {
                const label = MODALITY_LABELS[mod];
                return (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => onSelect(mod)}
                    className="w-full rounded-2xl border-2 border-violet-200 bg-violet-50/50 px-4 py-3 text-left font-bold text-deep hover:bg-violet-100 transition-colors"
                  >
                    {label.emoji} {isUr ? label.ur : label.en}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={onSkip}
                className="w-full rounded-2xl border-2 border-glacier-200 bg-white px-4 py-3 font-bold text-deep-soft hover:bg-glacier-50 transition-colors mt-1"
              >
                {isUr ? "⏭️ اگلا سوال پوچھیں" : "⏭️ Move to next question"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
