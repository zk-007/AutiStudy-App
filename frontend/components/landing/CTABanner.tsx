"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { DancingButton } from "@/components/primitives/DancingButton";

/**
 * Final call-to-action banner that sits between "How it works" and the footer.
 *
 * Design intent:
 * - One clear, friendly invitation. No bullet points, no extra noise.
 * - Same icy/glacier palette as the hero so the page feels like a single canvas.
 * - Slow, subtle floating sparkles in the background — autism-friendly motion
 *   (low-frequency, low-contrast), never strobing.
 */
export function CTABanner() {
  const { t, isRTL } = useLocale();
  return (
    <section className="relative px-6 md:px-10 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative mx-auto max-w-5xl overflow-hidden rounded-[32px] bg-gradient-to-br from-glacier-200 via-mint-200 to-glacier-300 p-10 md:p-14 text-center shadow-deep"
      >
        {/* Floating sparkles — purely decorative, calm motion. */}
        <FloatingSparkle className="top-6 left-8" delay={0} />
        <FloatingSparkle className="top-10 right-12" delay={1.2} />
        <FloatingSparkle className="bottom-12 left-16" delay={2.4} />
        <FloatingSparkle className="bottom-8 right-10" delay={0.6} />

        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2, type: "spring", stiffness: 200 }}
          className="relative mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/70 backdrop-blur-sm shadow-soft"
        >
          <Sparkles size={26} className="text-glacier-700" />
        </motion.div>

        <h2 className="relative mt-6 font-display text-3xl md:text-5xl font-extrabold tracking-tight text-deep text-balance">
          {t.cta.heading}
        </h2>
        <p className="relative mt-4 max-w-xl mx-auto text-lg text-deep-soft">{t.cta.sub}</p>

        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/signup">
            <DancingButton variant="primary">
              {t.cta.primary}
              <ArrowRight size={18} className={isRTL ? "rotate-180" : ""} />
            </DancingButton>
          </Link>
          <Link href="/about">
            <DancingButton variant="ghost">{t.cta.secondary}</DancingButton>
          </Link>
        </div>

        <p className="relative mt-6 text-xs uppercase tracking-[0.2em] font-bold text-deep-muted">
          {t.cta.assurance}
        </p>
      </motion.div>
    </section>
  );
}

function FloatingSparkle({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  return (
    <motion.div
      aria-hidden
      animate={{ y: [0, -10, 0], opacity: [0.35, 0.7, 0.35], rotate: [0, 12, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay }}
      className={`pointer-events-none absolute ${className}`}
    >
      <Sparkles size={20} className="text-white/80" />
    </motion.div>
  );
}
