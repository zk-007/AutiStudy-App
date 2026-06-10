"use client";

import { motion } from "framer-motion";

/**
 * Happy kid learning from a tablet, with science, math, computer and language
 * icons floating around them. Friendly, autism-calm illustration in the icy
 * palette. Pure SVG — no external image.
 */
export function KidLearningVisual() {
  return (
    <div className="relative aspect-[4/5] w-full max-w-[480px] mx-auto">
      {/* Soft halo behind the card */}
      <div className="absolute -inset-8 rounded-[40%] bg-gradient-to-br from-glacier-300/50 via-mint-300/40 to-glacier-200/30 blur-3xl" />

      {/* Main card */}
      <div className="relative h-full w-full overflow-hidden rounded-[32px] glass-strong shadow-deep">
        {/* Inner soft gradient wash */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 55%, rgba(190,227,248,0.55) 0%, rgba(232,244,248,0.2) 50%, transparent 80%)",
          }}
        />

        {/* Subtle dot grid */}
        <svg aria-hidden className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="#0F2D4A" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>

        {/* Floating sparkles */}
        <Sparkle delay={0.2} top="12%" left="30%" size={5} />
        <Sparkle delay={1.4} top="22%" right="22%" size={4} />
        <Sparkle delay={0.8} bottom="32%" left="18%" size={6} />
        <Sparkle delay={2.0} bottom="22%" right="26%" size={4} />
        <Sparkle delay={1.6} top="48%" left="10%" size={3} />
        <Sparkle delay={2.6} top="40%" right="8%" size={4} />

        {/* Centerpiece — happy kid with tablet */}
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="relative z-10 h-full w-full flex items-center justify-center"
        >
          <KidSVG />
        </motion.div>

        {/*
          Exactly four subject orbs, equidistant from the kid in a clean circle
          (12 / 3 / 6 / 9 o'clock). No clutter, no random scatter.
        */}
        <FloatingOrb glyph="π" label="Math" position="top" delay={0} hue="glacier" />
        <FloatingOrb glyph="⚛" label="Science" position="right" delay={0.35} hue="mint" />
        <FloatingOrb glyph="</>" label="Computer" position="bottom" delay={0.7} hue="glacier" mono />
        <FloatingOrb glyph="Aa" label="Language" position="left" delay={1.05} hue="mint" />
      </div>

      {/* Floating mini-card — bilingual indicator */}
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

/* --------- The friendly kid + tablet illustration --------- */
function KidSVG() {
  return (
    <svg
      viewBox="0 0 240 280"
      width="55%"
      className="drop-shadow-[0_18px_28px_rgba(15,45,74,0.18)]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="shirtGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9AD0EC" />
          <stop offset="100%" stopColor="#5B91B8" />
        </linearGradient>
        <linearGradient id="tabletGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E8F4F8" />
        </linearGradient>
        <radialGradient id="cheekGrad">
          <stop offset="0%" stopColor="#F8B5B5" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#F8B5B5" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft seat / floor circle */}
      <ellipse cx="120" cy="262" rx="70" ry="6" fill="#0F2D4A" opacity="0.08" />

      {/* ----- Body / shirt ----- */}
      <path
        d="M70 195 Q70 160 100 152 L140 152 Q170 160 170 195 L170 240 Q170 250 160 250 L80 250 Q70 250 70 240 Z"
        fill="url(#shirtGrad)"
        stroke="#0F2D4A"
        strokeWidth="1.5"
        strokeOpacity="0.15"
      />
      {/* Shirt highlight */}
      <path
        d="M88 165 Q88 158 95 158 L100 158 L100 220 Q92 220 88 215 Z"
        fill="#FFFFFF"
        opacity="0.18"
      />

      {/* ----- Arms holding tablet ----- */}
      {/* Left arm */}
      <path
        d="M75 200 Q60 215 70 240 Q72 248 84 246 Q86 232 96 224"
        fill="#F4D9B8"
        stroke="#0F2D4A"
        strokeWidth="1.5"
        strokeOpacity="0.2"
      />
      {/* Right arm */}
      <path
        d="M165 200 Q180 215 170 240 Q168 248 156 246 Q154 232 144 224"
        fill="#F4D9B8"
        stroke="#0F2D4A"
        strokeWidth="1.5"
        strokeOpacity="0.2"
      />

      {/* ----- Tablet ----- */}
      <rect
        x="70"
        y="200"
        width="100"
        height="68"
        rx="8"
        fill="url(#tabletGrad)"
        stroke="#0F2D4A"
        strokeWidth="1.8"
        strokeOpacity="0.35"
      />
      {/* Tablet bezel highlight */}
      <rect
        x="70"
        y="200"
        width="100"
        height="68"
        rx="8"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1"
        opacity="0.6"
      />
      {/* Tablet screen content */}
      <rect x="78" y="208" width="84" height="10" rx="3" fill="#9AD0EC" opacity="0.85" />
      <rect x="78" y="223" width="60" height="4" rx="2" fill="#BEE3F8" opacity="0.8" />
      <rect x="78" y="231" width="68" height="4" rx="2" fill="#BEE3F8" opacity="0.7" />
      <rect x="78" y="239" width="54" height="4" rx="2" fill="#BEE3F8" opacity="0.7" />

      {/* "Play" / lesson icon on tablet */}
      <circle cx="150" cy="252" r="9" fill="#0F2D4A" opacity="0.85" />
      <polygon points="147,248 147,256 154,252" fill="#FFFFFF" />

      {/* Progress bar on tablet */}
      <rect x="78" y="252" width="60" height="4" rx="2" fill="#E8F4F8" />
      <rect x="78" y="252" width="38" height="4" rx="2" fill="#5B91B8" />

      {/* ----- Neck ----- */}
      <rect x="108" y="142" width="24" height="18" rx="6" fill="#F4D9B8" stroke="#0F2D4A" strokeWidth="1.5" strokeOpacity="0.18" />

      {/* ----- Head ----- */}
      <ellipse cx="120" cy="100" rx="42" ry="46" fill="#FAEDCD" stroke="#0F2D4A" strokeWidth="1.8" strokeOpacity="0.25" />

      {/* ----- Hair ----- */}
      <path
        d="M78 95 Q78 50 120 48 Q162 50 162 95 Q162 78 152 72 Q140 80 130 70 Q120 80 110 70 Q100 80 88 72 Q78 78 78 95 Z"
        fill="#3B2A1A"
      />
      {/* Hair shine */}
      <path d="M92 70 Q102 62 116 62" stroke="#5C4530" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5" />

      {/* ----- Cheeks ----- */}
      <circle cx="92" cy="115" r="9" fill="url(#cheekGrad)" />
      <circle cx="148" cy="115" r="9" fill="url(#cheekGrad)" />

      {/* ----- Eyes (closed-happy crescents) ----- */}
      <path
        d="M98 100 Q104 94 110 100"
        stroke="#0F2D4A"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M130 100 Q136 94 142 100"
        stroke="#0F2D4A"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* ----- Smile ----- */}
      <path
        d="M108 122 Q120 132 132 122"
        stroke="#0F2D4A"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* ----- Sparkle on screen (excitement / engagement) ----- */}
      <g transform="translate(95, 213)">
        <path
          d="M0 -3 L1 -1 L3 0 L1 1 L0 3 L-1 1 L-3 0 L-1 -1 Z"
          fill="#FFD700"
          opacity="0.9"
        />
      </g>
    </svg>
  );
}

/* --------- Big floating subject orb --------- */
function FloatingOrb({
  glyph,
  label,
  position,
  delay,
  hue,
  mono,
}: {
  glyph: string;
  label: string;
  position: "top" | "right" | "bottom" | "left";
  delay: number;
  hue: "glacier" | "mint";
  mono?: boolean;
}) {
  // The four orbs sit on a circle around the kid, equidistant from each
  // other. We use percentage offsets that keep them at the same visual
  // distance from the centre while staying inside the card.
  //
  // For TOP and BOTTOM the orb is centred horizontally (left-1/2) and
  // pulled back by half its width (-translate-x-1/2).
  // For LEFT and RIGHT the orb is centred vertically (top-1/2) and
  // pulled back by half its height (-translate-y-1/2).
  const positions: Record<typeof position, string> = {
    top: "top-[6%] left-1/2 -translate-x-1/2",
    right: "top-1/2 right-[5%] -translate-y-1/2",
    bottom: "bottom-[6%] left-1/2 -translate-x-1/2",
    left: "top-1/2 left-[5%] -translate-y-1/2",
  };
  const ring =
    hue === "glacier" ? "border-glacier-300" : "border-mint-300";
  const bgTint =
    hue === "glacier"
      ? "from-white via-glacier-50 to-glacier-100"
      : "from-white via-mint-100 to-mint-200";
  return (
    // Plain div for positioning (so the static -translate transforms don't
    // collide with framer-motion's transforms on the children).
    <div
      aria-label={label}
      className={`absolute ${positions[position]} z-10`}
    >
      {/* Entrance fade-in */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay, ease: "easeOut" }}
      >
        {/* Perpetual gentle float */}
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{
            duration: 4 + delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className={`flex h-14 w-14 md:h-16 md:w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${bgTint} backdrop-blur-md shadow-deep border-2 ${ring}`}
        >
          <span
            className={`font-display font-extrabold text-deep ${
              mono
                ? "text-sm md:text-base tracking-tight"
                : "text-2xl md:text-3xl"
            }`}
          >
            {glyph}
          </span>
        </motion.div>
      </motion.div>
    </div>
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
