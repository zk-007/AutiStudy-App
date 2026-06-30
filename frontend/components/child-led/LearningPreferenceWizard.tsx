"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  ALL_MODALITIES,
  MODALITY_LABELS,
  type Modality,
} from "@/lib/agent/childLedTypes";

interface LearningPreferenceWizardProps {
  onComplete: (order: Modality[]) => void | Promise<void>;
}

export function LearningPreferenceWizard({ onComplete }: LearningPreferenceWizardProps) {
  const { locale } = useLocale();
  const isUr = locale === "ur";
  const [order, setOrder] = useState<Modality[]>([...ALL_MODALITIES]);
  const [saving, setSaving] = useState(false);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setOrder(next);
  };

  const submit = useCallback(async () => {
    setSaving(true);
    try {
      await onComplete(order);
    } finally {
      setSaving(false);
    }
  }, [onComplete, order]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16 bg-gradient-to-br from-violet-50 via-white to-purple-50">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-violet-100 p-8"
      >
        <h1 className="font-display text-2xl font-extrabold text-deep text-center mb-2">
          {isUr ? "آپ کس طرح سیکھنا پسند کرتے ہیں؟" : "How do you like to learn?"}
        </h1>
        <p className="text-sm text-deep-soft text-center mb-6">
          {isUr
            ? "1 سب سے پسندیدہ — 4 کم پسند۔ ↑↓ سے ترتیب بدلیں۔"
            : "1 = favourite, 4 = least. Use arrows to reorder."}
        </p>
        <ul className="space-y-2 mb-8">
          {order.map((mod, i) => {
            const label = MODALITY_LABELS[mod];
            return (
              <li
                key={mod}
                className="flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50/40 px-4 py-3"
              >
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-violet-600 text-white text-sm font-bold">
                  {i + 1}
                </span>
                <span className="flex-1 font-bold text-deep">
                  {label.emoji} {isUr ? label.ur : label.en}
                </span>
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="px-2 py-1 text-deep-soft disabled:opacity-30"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                  className="px-2 py-1 text-deep-soft disabled:opacity-30"
                  aria-label="Move down"
                >
                  ↓
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 py-3.5 font-bold text-white shadow-lg disabled:opacity-60"
        >
          {saving ? "…" : isUr ? "شروع کریں 🚀" : "Let's start! 🚀"}
        </button>
      </motion.div>
    </main>
  );
}
