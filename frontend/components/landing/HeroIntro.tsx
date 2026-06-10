"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ArrowRight, Play } from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { DancingButton } from "@/components/primitives/DancingButton";
import { EducationalVisual } from "./EducationalVisual";
import { KidLearningVisual } from "./KidLearningVisual";
import { PhotoVisual } from "./PhotoVisual";

// Photo candidates — all education-themed, cool/calm tones from Unsplash.
const PHOTO_CANDIDATES = {
  "photo-book": {
    src: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=900&q=80",
    alt: "Open book with soft pages",
    caption: "Reading · Learning",
  },
  "photo-desk": {
    src: "https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=900&q=80",
    alt: "Modern study desk with laptop and notebook",
    caption: "Modern study space",
  },
  "photo-stack": {
    src: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=900&q=80",
    alt: "Stack of books",
    caption: "A library of knowledge",
  },
  "photo-library": {
    src: "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=900&q=80",
    alt: "Library shelves with books",
    caption: "Where ideas live",
  },
  "photo-notebook": {
    src: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80",
    alt: "Open notebook and pen",
    caption: "Active learning",
  },
} as const;

type VisualKey = "svg-book" | "svg-kid" | keyof typeof PHOTO_CANDIDATES;
const DEFAULT_VISUAL: VisualKey = "svg-kid";

function HeroVisual({ variant }: { variant: VisualKey }) {
  if (variant === "svg-book") return <EducationalVisual />;
  if (variant === "svg-kid") return <KidLearningVisual />;
  const photo = PHOTO_CANDIDATES[variant];
  return <PhotoVisual src={photo.src} alt={photo.alt} caption={photo.caption} />;
}

const BIG_WORD = "AUTISTUDY";

type Phase = "big" | "logo" | "hero";

/**
 * Combined intro + hero — all three phases live in the SAME full-height section.
 *
 *   0.0s  → "big"  : giant AUTISTUDY gradient letters fade up
 *   2.6s  → "logo" : crossfade to AutiStudy wordmark + tagline
 *   5.5s  → "hero" : crossfade to full hero layout
 */
export function HeroIntro() {
  const { t, locale, isRTL } = useLocale();
  const [phase, setPhase] = useState<Phase>("big");
  const search = useSearchParams();
  const visualParam = (search?.get("visual") as VisualKey | null) ?? DEFAULT_VISUAL;
  const visual: VisualKey =
    visualParam === "svg-book" ||
    visualParam === "svg-kid" ||
    (visualParam && visualParam in PHOTO_CANDIDATES)
      ? visualParam
      : DEFAULT_VISUAL;

  const fast = search?.get("fast") === "1";

  useEffect(() => {
    if (fast) {
      setPhase("hero");
      return;
    }
    const t1 = setTimeout(() => setPhase("logo"), 2600);
    const t2 = setTimeout(() => setPhase("hero"), 5500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fast]);

  return (
    <section
      id="hero"
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden px-6 md:px-10 py-24"
    >
      <AnimatePresence initial={false} mode="crossfade">
        {phase === "big" && (
          <motion.div
            key="big"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.08, filter: "blur(4px)", transition: { duration: 0.7, ease: "easeInOut" } }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 top-0 h-screen flex flex-col items-center justify-center"
          >
            <div
              dir="ltr"
              className="relative flex select-none items-center justify-center gap-1 md:gap-2"
            >
              {BIG_WORD.split("").map((letter, i) => (
                <motion.span
                  key={`${letter}-${i}`}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.6,
                    delay: i * 0.06,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="inline-block font-display font-extrabold tracking-tight bg-gradient-to-br from-glacier-600 via-glacier-500 to-deep bg-clip-text text-transparent"
                  style={{
                    fontSize: "clamp(3.5rem, 12vw, 11rem)",
                    lineHeight: 1,
                  }}
                >
                  {letter}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}

        {phase === "logo" && (
          <motion.div
            key="logo"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, filter: "blur(4px)", transition: { duration: 0.6, ease: "easeInOut" } }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 top-0 h-screen flex flex-col items-center justify-center text-center px-6"
          >
            {locale === "ur" && (
              <motion.div
                dir="ltr"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                className="font-display font-extrabold tracking-tight text-shimmer mb-6"
                style={{ fontSize: "clamp(3rem, 9vw, 8rem)", lineHeight: 1 }}
              >
                {t.brand}
              </motion.div>
            )}
            <motion.p
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-4xl text-balance font-display font-semibold text-deep leading-snug"
              style={{
                fontSize: locale === "ur" ? "clamp(1.5rem, 3.2vw, 2.5rem)" : "clamp(2rem, 5vw, 4rem)",
              }}
            >
              {t.intro.tagline}
            </motion.p>
          </motion.div>
        )}

        {phase === "hero" && (
          <motion.div
            key="hero"
            initial={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full"
          >
            <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center w-full">
              {/* Text */}
              <div className={isRTL ? "lg:order-2" : ""}>
                <span className="inline-flex items-center gap-2 rounded-full bg-glacier-100 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-glacier-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-glacier-500 animate-breathe" />
                  {t.hero.eyebrow}
                </span>

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
                  <DancingButton
                    variant="ghost"
                    onClick={() => {
                      const target = document.querySelector("#how");
                      if (!target) return;
                      const lenis = (
                        window as unknown as {
                          __lenis?: { scrollTo: (t: Element, o?: object) => void };
                        }
                      ).__lenis;
                      if (lenis) {
                        lenis.scrollTo(target, { offset: -40, duration: 1.4 });
                      } else {
                        target.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }}
                  >
                    <Play size={16} />
                    {t.hero.ctaSecondary}
                  </DancingButton>
                </div>
              </div>

              {/* Educational visual */}
              <div className={isRTL ? "lg:order-1" : ""}>
                <HeroVisual variant={visual} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scroll-down hint — appears only AFTER the hero phase has stabilised,
          inviting the user to explore Features below. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "hero" ? 0.6 : 0 }}
        transition={{ duration: 0.8, delay: phase === "hero" ? 1.8 : 0 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-deep-muted pointer-events-none"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
          {t.intro.scrollHint}
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown size={22} />
        </motion.div>
      </motion.div>
    </section>
  );
}
