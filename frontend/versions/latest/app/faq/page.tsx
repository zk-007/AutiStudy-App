"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export default function FAQPage() {
  const { t } = useLocale();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <PageShell title={t.pages.faq.title}>
      <div className="space-y-4">
        {t.pages.faq.items.map((item, i) => {
          const isOpen = open === i;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              className="rounded-2xl glass-strong overflow-hidden shadow-soft"
            >
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 p-5 md:p-6 text-left hover:bg-glacier-100/40 transition-colors"
              >
                <span className="font-display text-lg md:text-xl font-bold text-deep">
                  {item.q}
                </span>
                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-glacier-200 text-deep flex-shrink-0"
                >
                  <ChevronDown size={18} />
                </motion.div>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                  >
                    <p className="px-5 md:px-6 pb-6 text-base text-deep-soft leading-relaxed">
                      {item.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </PageShell>
  );
}
