"use client";

import { motion } from "framer-motion";

/**
 * Renders an Unsplash photo inside the same hero card chrome (glow, glass card,
 * floating mini-cards) used by the other visual variants — for fair side-by-side
 * comparison.
 */
export function PhotoVisual({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <div className="relative aspect-[4/5] w-full max-w-[480px] mx-auto">
      {/* Soft halo */}
      <div className="absolute -inset-8 rounded-[40%] bg-gradient-to-br from-glacier-300/50 via-mint-300/40 to-glacier-200/30 blur-3xl" />

      {/* Glass card with the photo */}
      <div className="relative h-full w-full overflow-hidden rounded-[32px] glass-strong shadow-deep">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Cool tone wash to keep palette consistent */}
        <div
          aria-hidden
          className="absolute inset-0 mix-blend-soft-light pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, rgba(154,208,236,0.35), rgba(190,227,248,0.10) 40%, rgba(94,202,179,0.25))",
          }}
        />
        {/* Bottom caption */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="absolute left-4 bottom-4 right-4 glass-strong rounded-xl px-3 py-2 text-xs font-bold text-deep flex items-center gap-2"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-mint-500 animate-breathe" />
          {caption}
        </motion.div>
      </div>

      {/* Floating mini-cards (consistent with other variants) */}
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -left-4 top-10 glass-strong rounded-2xl px-4 py-3 shadow-soft hidden md:flex items-center gap-2 z-20"
      >
        <span className="h-2 w-2 rounded-full bg-mint-400 animate-breathe" />
        <span className="text-xs font-bold text-deep">Adaptive · Calm</span>
      </motion.div>
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -right-4 bottom-12 glass-strong rounded-2xl px-4 py-3 shadow-soft hidden md:flex items-center gap-2 z-20"
      >
        <span className="h-2 w-2 rounded-full bg-glacier-500 animate-breathe" />
        <span className="text-xs font-bold text-deep">EN · اردو</span>
      </motion.div>
    </div>
  );
}
