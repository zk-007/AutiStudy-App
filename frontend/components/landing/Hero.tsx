"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { DancingButton } from "@/components/primitives/DancingButton";
import { ArrowRight, Play } from "lucide-react";

export function Hero() {
  const { t, isRTL } = useLocale();

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center px-6 md:px-10 py-24"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Text */}
        <motion.div
          initial={{ opacity: 0, x: isRTL ? 40 : -40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={isRTL ? "lg:order-2" : ""}
        >
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full bg-glacier-100 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-glacier-700"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-glacier-500 animate-breathe" />
            {t.brand}
          </motion.span>

          <h1 className="mt-5 font-display text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] text-deep text-balance">
            {t.hero.title}
          </h1>

          <p className="mt-6 max-w-xl text-lg md:text-xl text-deep-soft leading-relaxed">
            {t.hero.subtitle}
          </p>

          <div className="mt-9 flex flex-wrap gap-4">
            <Link href="/signup">
              <DancingButton variant="primary">
                {t.hero.cta}
                <ArrowRight size={18} className={isRTL ? "rotate-180" : ""} />
              </DancingButton>
            </Link>
            <DancingButton variant="ghost">
              <Play size={16} />
              {t.hero.ctaSecondary}
            </DancingButton>
          </div>
        </motion.div>

        {/* Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className={`relative ${isRTL ? "lg:order-1" : ""}`}
        >
          <div className="relative aspect-[4/5] w-full max-w-[480px] mx-auto">
            {/* Soft glow halo */}
            <div className="absolute -inset-8 rounded-[40%] bg-gradient-to-br from-glacier-300/50 via-mint-300/40 to-glacier-200/30 blur-3xl" />
            {/* Image card */}
            <div className="relative h-full w-full overflow-hidden rounded-[32px] glass-strong shadow-deep">
              <Image
                src="https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1200&q=80"
                alt="Calm icy ocean — calming visual for autistic learners"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 480px"
                className="object-cover"
              />
              {/* Soft top mist overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-glacier-100/30 via-transparent to-glacier-200/40" />
            </div>
            {/* Floating mini-cards */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -left-4 top-10 glass-strong rounded-2xl px-4 py-3 shadow-soft hidden md:flex items-center gap-2"
            >
              <span className="h-2 w-2 rounded-full bg-mint-400 animate-breathe" />
              <span className="text-xs font-bold text-deep">Adaptive · Calm</span>
            </motion.div>
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-4 bottom-12 glass-strong rounded-2xl px-4 py-3 shadow-soft hidden md:flex items-center gap-2"
            >
              <span className="h-2 w-2 rounded-full bg-glacier-500 animate-breathe" />
              <span className="text-xs font-bold text-deep">EN · اردو</span>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
