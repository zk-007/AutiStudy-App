"use client";

import { motion } from "framer-motion";

/**
 * Custom educational illustration in the icy/glacier palette.
 * - Centerpiece: a stylized open book with a soft glow
 * - Floating subject orbs around it (math, science, language, music) representing
 *   the multimodal nature of the platform
 * - Soft drifting sparkles for warmth
 *
 * No external image dependency. Pure SVG + Framer Motion.
 */
export function EducationalVisual() {
  return (
    <div className="relative aspect-[4/5] w-full max-w-[480px] mx-auto">
      {/* Soft halo behind the card */}
      <div className="absolute -inset-8 rounded-[40%] bg-gradient-to-br from-glacier-300/50 via-mint-300/40 to-glacier-200/30 blur-3xl" />

      {/* The visual card */}
      <div className="relative h-full w-full overflow-hidden rounded-[32px] glass-strong shadow-deep flex items-center justify-center">
        {/* Inner soft gradient wash */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 40%, rgba(190,227,248,0.55) 0%, rgba(232,244,248,0.2) 45%, transparent 75%)",
          }}
        />

        {/* Subtle grid pattern (notebook feel) */}
        <svg
          aria-hidden
          className="absolute inset-0 w-full h-full opacity-[0.07]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#0F2D4A" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Floating sparkle particles */}
        <Sparkle delay={0} top="14%" left="22%" size={6} />
        <Sparkle delay={1.2} top="20%" right="18%" size={4} />
        <Sparkle delay={2.4} bottom="28%" left="14%" size={5} />
        <Sparkle delay={0.8} bottom="18%" right="22%" size={6} />
        <Sparkle delay={1.8} top="48%" left="8%" size={3} />
        <Sparkle delay={3.0} top="58%" right="10%" size={4} />

        {/* Centerpiece — open book illustration */}
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="relative z-10"
        >
          <BookSVG />
        </motion.div>

        {/* Orbiting subject orbs */}
        <FloatingOrb glyph="π" label="Math" position="top-left" delay={0} />
        <FloatingOrb glyph="⚛" label="Science" position="top-right" delay={0.6} />
        <FloatingOrb glyph="A" label="Language" position="bottom-left" delay={1.2} />
        <FloatingOrb glyph="♪" label="Arts" position="bottom-right" delay={1.8} />
      </div>

      {/* Floating mini-cards (kept from v1 — soft, on-brand) */}
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

/* --------- Stylised open-book SVG --------- */
function BookSVG() {
  return (
    <svg
      viewBox="0 0 240 200"
      width="62%"
      className="drop-shadow-[0_20px_30px_rgba(15,45,74,0.18)]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="pageGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E8F4F8" />
        </linearGradient>
        <linearGradient id="spineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#9AD0EC" />
          <stop offset="100%" stopColor="#5B91B8" />
        </linearGradient>
      </defs>

      {/* Left page */}
      <path
        d="M120 40 C 80 28, 40 30, 20 40 L 20 175 C 40 165, 80 163, 120 175 Z"
        fill="url(#pageGrad)"
        stroke="#BEE3F8"
        strokeWidth="1.5"
      />
      {/* Right page */}
      <path
        d="M120 40 C 160 28, 200 30, 220 40 L 220 175 C 200 165, 160 163, 120 175 Z"
        fill="url(#pageGrad)"
        stroke="#BEE3F8"
        strokeWidth="1.5"
      />
      {/* Spine */}
      <rect x="116" y="38" width="8" height="138" rx="3" fill="url(#spineGrad)" />

      {/* Text lines on left page */}
      <line x1="35" y1="65" x2="105" y2="62" stroke="#9AD0EC" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <line x1="35" y1="80" x2="100" y2="78" stroke="#BEE3F8" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
      <line x1="35" y1="95" x2="108" y2="93" stroke="#BEE3F8" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
      <line x1="35" y1="110" x2="95" y2="108" stroke="#BEE3F8" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
      <line x1="35" y1="125" x2="103" y2="123" stroke="#BEE3F8" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
      <line x1="35" y1="140" x2="90" y2="138" stroke="#BEE3F8" strokeWidth="3" strokeLinecap="round" opacity="0.35" />

      {/* Right page: highlighted illustration block (suggesting an interactive lesson) */}
      <rect x="135" y="58" width="78" height="44" rx="8" fill="#BEE3F8" opacity="0.6" />
      {/* "play" triangle inside the block - suggests multimodal/video */}
      <polygon points="168,72 168,88 182,80" fill="#0F2D4A" opacity="0.7" />

      <line x1="135" y1="115" x2="213" y2="113" stroke="#9AD0EC" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <line x1="135" y1="130" x2="205" y2="128" stroke="#BEE3F8" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
      <line x1="135" y1="145" x2="200" y2="143" stroke="#BEE3F8" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

/* --------- Floating subject orb --------- */
function FloatingOrb({
  glyph,
  label,
  position,
  delay,
}: {
  glyph: string;
  label: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  delay: number;
}) {
  const positions: Record<typeof position, string> = {
    "top-left": "top-[12%] left-[8%]",
    "top-right": "top-[14%] right-[8%]",
    "bottom-left": "bottom-[20%] left-[6%]",
    "bottom-right": "bottom-[22%] right-[6%]",
  };
  return (
    <motion.div
      aria-label={label}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -10, 0],
      }}
      transition={{
        opacity: { duration: 0.8, delay: delay },
        scale: { duration: 0.8, delay: delay },
        y: { duration: 4 + delay, repeat: Infinity, ease: "easeInOut" },
      }}
      className={`absolute ${positions[position]} z-10 flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-2xl bg-white/85 backdrop-blur-md shadow-soft border border-glacier-200/60`}
    >
      <span className="font-display font-extrabold text-xl md:text-2xl bg-gradient-to-br from-glacier-600 to-deep bg-clip-text text-transparent">
        {glyph}
      </span>
    </motion.div>
  );
}

/* --------- Drifting sparkle --------- */
function Sparkle({
  top,
  bottom,
  left,
  right,
  size,
  delay,
}: {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  size: number;
  delay: number;
}) {
  return (
    <motion.span
      animate={{
        opacity: [0.2, 0.9, 0.2],
        scale: [0.8, 1.2, 0.8],
      }}
      transition={{
        duration: 3,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      style={{
        top,
        bottom,
        left,
        right,
        width: `${size}px`,
        height: `${size}px`,
      }}
      className="absolute rounded-full bg-glacier-400 shadow-glow"
    />
  );
}
