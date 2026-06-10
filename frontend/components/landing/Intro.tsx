"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { ChevronDown } from "lucide-react";
import type Lenis from "lenis";

const BIG_WORD = "AUTISTUDY";

export function Intro() {
  const { t } = useLocale();
  const [phase, setPhase] = useState<"big" | "logo" | "scrolled">("big");

  // Phase 1: big word visible. Phase 2 at ~2.6s: morph to logo+tagline.
  // Phase 3 at ~5.0s: auto-scroll to next section.
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("logo"), 2600);
    const t2 = setTimeout(() => {
      setPhase("scrolled");
      const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
      const target = document.getElementById("hero");
      if (target) {
        if (lenis) {
          lenis.scrollTo(target, { duration: 2.4, easing: (x) => 1 - Math.pow(1 - x, 3) });
        } else {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }, 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <section
      id="intro"
      className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden"
    >
      <AnimatePresence mode="wait">
        {phase === "big" && (
          <motion.div
            key="big"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.8 }}
            className="flex flex-col items-center"
          >
            <div className="flex select-none items-center justify-center gap-1 md:gap-2">
              {BIG_WORD.split("").map((letter, i) => (
                <motion.span
                  key={`${letter}-${i}`}
                  initial={{ opacity: 0, y: 40, scale: 0.7 }}
                  animate={{
                    opacity: 1,
                    y: [40, 0, -6, 0],
                    scale: [0.7, 1, 1.02, 1],
                  }}
                  transition={{
                    duration: 1.6,
                    delay: i * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="font-display font-extrabold tracking-tight bg-gradient-to-br from-glacier-600 via-glacier-500 to-deep bg-clip-text text-transparent"
                  style={{
                    fontSize: "clamp(3.5rem, 12vw, 11rem)",
                    lineHeight: 1,
                    textShadow: "0 0 50px rgba(190,227,248,0.3)",
                  }}
                >
                  {letter}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}

        {(phase === "logo" || phase === "scrolled") && (
          <motion.div
            key="logo"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.0, ease: "easeOut" }}
            className="flex flex-col items-center text-center px-6"
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.15 }}
              className="font-display font-extrabold tracking-tight text-shimmer"
              style={{
                fontSize: "clamp(3rem, 9vw, 8rem)",
                lineHeight: 1,
              }}
            >
              {t.brand}
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.7 }}
              className="mt-6 max-w-xl text-balance text-lg md:text-xl font-medium text-deep-soft"
            >
              {t.intro.tagline}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bouncing scroll hint — appears after logo phase, before auto-scroll */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "logo" ? 0.7 : 0 }}
        transition={{ duration: 0.8 }}
        className="absolute bottom-12 flex flex-col items-center gap-2 text-deep-muted"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.2em]">
          {t.intro.scrollHint}
        </span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown size={28} />
        </motion.div>
      </motion.div>
    </section>
  );
}
