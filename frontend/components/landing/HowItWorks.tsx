"use client";

import { motion } from "framer-motion";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { MessageCircle, Wand2, BookOpen, BarChart3 } from "lucide-react";

const ICONS = [MessageCircle, Wand2, BookOpen, BarChart3];

export function HowItWorks() {
  const { t, isRTL } = useLocale();
  return (
    <section id="how" className="relative px-6 md:px-10 py-24">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="text-center max-w-2xl mx-auto"
        >
          <h2 className="font-display text-3xl md:text-5xl font-extrabold tracking-tight text-deep">
            {t.how.heading}
          </h2>
          <p className="mt-4 text-lg text-deep-soft">{t.how.sub}</p>
        </motion.div>

        <div className="mt-16 relative">
          {/* Soft connecting line behind the steps */}
          <div className="absolute top-7 left-0 right-0 h-px bg-gradient-to-r from-transparent via-glacier-300 to-transparent hidden md:block" />

          <div className={`grid grid-cols-1 md:grid-cols-4 gap-8 ${isRTL ? "md:[direction:rtl]" : ""}`}>
            {t.how.steps.map((step, i) => {
              const Icon = ICONS[i];
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.6, delay: i * 0.15, ease: "easeOut" }}
                  className="relative flex flex-col items-center text-center"
                >
                  {/* Step circle */}
                  <motion.div
                    whileHover={{ scale: 1.08, rotate: 4 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-glacier-300 to-mint-300 shadow-soft"
                  >
                    <Icon size={22} className="text-deep" strokeWidth={2.2} />
                    <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-deep text-[10px] font-extrabold text-white">
                      {i + 1}
                    </span>
                  </motion.div>
                  <h3 className="mt-5 font-display text-lg font-extrabold text-deep">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-deep-soft max-w-[200px]">
                    {step.desc}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
