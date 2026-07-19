"use client";

/**
 * Part B #9 — Learner Journey tree.
 * Framer Motion SVG (no Rive dependency): grows with consecutive learning days,
 * wilts when the student skips days. Driven by backend `journey` metrics.
 */

import { motion } from "framer-motion";
import type { LearnerJourney } from "@/lib/api/client";

interface Props {
  journey: LearnerJourney | null;
  title: string;
  sub: string;
  streakLabel: string;
  wiltedHint: string;
  emptyHint: string;
}

function stageScale(stage: LearnerJourney["stage"], wilted: boolean): number {
  const base =
    stage === "mighty" ? 1.15 :
    stage === "flourishing" ? 1.05 :
    stage === "growing" ? 0.92 :
    stage === "sprout" ? 0.72 :
    0.55;
  return wilted ? Math.max(0.5, base * 0.85) : base;
}

export function LearnerJourneyTree({
  journey,
  title,
  sub,
  streakLabel,
  wiltedHint,
  emptyHint,
}: Props) {
  const stage = journey?.stage ?? "seed";
  const wilted = journey?.wilted ?? true;
  const health = journey?.health ?? 0.15;
  const scale = stageScale(stage, wilted);
  const leafOpacity = wilted ? 0.35 : 0.55 + health * 0.45;
  const green = wilted ? "#94a3b8" : "#22a06b";
  const greenDark = wilted ? "#64748b" : "#0f766e";
  const canopy = wilted ? "#cbd5e1" : "#4ade80";

  return (
    <section className="rounded-3xl glass-strong p-6 md:p-7 shadow-soft h-full flex flex-col">
      <div className="mb-3">
        <h2 className="font-display text-xl md:text-2xl font-extrabold text-deep">{title}</h2>
        <p className="mt-1 text-sm text-deep-soft">{sub}</p>
      </div>

      <div className="relative flex-1 flex items-end justify-center min-h-[220px] rounded-2xl bg-gradient-to-b from-sky-100/70 via-emerald-50/40 to-amber-50/50 overflow-hidden">
        {/* Soft sun */}
        <motion.div
          aria-hidden
          className="absolute top-4 right-6 h-10 w-10 rounded-full bg-amber-200/80 blur-[1px]"
          animate={{ opacity: [0.55, 0.9, 0.55], scale: [1, 1.06, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        <svg
          viewBox="0 0 200 220"
          className="w-[200px] h-[220px] relative z-[1]"
          role="img"
          aria-label={title}
        >
          {/* Ground */}
          <ellipse cx="100" cy="200" rx="70" ry="12" fill="#d6c4a8" opacity="0.7" />
          <ellipse cx="100" cy="198" rx="50" ry="7" fill="#b8956c" opacity="0.45" />

          <motion.g
            style={{ transformOrigin: "100px 190px" }}
            animate={{ scale, rotate: wilted ? [-2, 2, -2] : [0, 1.5, 0, -1.5, 0] }}
            transition={{
              scale: { type: "spring", stiffness: 120, damping: 14 },
              rotate: { duration: wilted ? 3.5 : 5, repeat: Infinity, ease: "easeInOut" },
            }}
          >
            {/* Trunk */}
            <path
              d="M96 190 C94 150, 92 120, 98 90 C100 78, 102 78, 104 90 C110 120, 108 150, 104 190 Z"
              fill={wilted ? "#8b7355" : "#8B5A2B"}
            />

            {/* Canopy layers — denser as stage grows */}
            {(stage === "seed" || stage === "sprout" || stage === "growing" || stage === "flourishing" || stage === "mighty") && (
              <motion.ellipse
                cx="100"
                cy="78"
                rx={stage === "seed" ? 18 : stage === "sprout" ? 28 : 42}
                ry={stage === "seed" ? 14 : stage === "sprout" ? 22 : 34}
                fill={canopy}
                opacity={leafOpacity}
                animate={{ opacity: [leafOpacity * 0.85, leafOpacity, leafOpacity * 0.85] }}
                transition={{ duration: 3.2, repeat: Infinity }}
              />
            )}
            {(stage === "growing" || stage === "flourishing" || stage === "mighty") && (
              <>
                <ellipse cx="72" cy="95" rx="26" ry="20" fill={green} opacity={leafOpacity * 0.9} />
                <ellipse cx="128" cy="95" rx="26" ry="20" fill={greenDark} opacity={leafOpacity * 0.85} />
              </>
            )}
            {(stage === "flourishing" || stage === "mighty") && (
              <>
                <ellipse cx="100" cy="55" rx="36" ry="28" fill={green} opacity={leafOpacity} />
                <ellipse cx="60" cy="78" rx="22" ry="16" fill={canopy} opacity={leafOpacity * 0.8} />
                <ellipse cx="140" cy="78" rx="22" ry="16" fill={greenDark} opacity={leafOpacity * 0.8} />
              </>
            )}
            {stage === "mighty" && !wilted && (
              <>
                <motion.circle
                  cx="78"
                  cy="70"
                  r="4"
                  fill="#f87171"
                  animate={{ y: [0, -2, 0], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                />
                <motion.circle
                  cx="118"
                  cy="62"
                  r="3.5"
                  fill="#fb7185"
                  animate={{ y: [0, -3, 0], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2.8, repeat: Infinity, delay: 0.4 }}
                />
              </>
            )}

            {/* Wilted droop leaves */}
            {wilted && (
              <>
                <path d="M88 100 Q70 120 78 140" stroke="#94a3b8" strokeWidth="3" fill="none" opacity="0.7" />
                <path d="M112 100 Q130 122 124 142" stroke="#94a3b8" strokeWidth="3" fill="none" opacity="0.7" />
              </>
            )}
          </motion.g>
        </svg>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-display text-2xl font-extrabold text-deep tabular-nums">
            {journey ? journey.streak_days : "—"}
            <span className="ml-1.5 text-sm font-bold text-deep-soft">{streakLabel}</span>
          </div>
          <p className="text-xs text-deep-muted mt-0.5">
            {!journey
              ? "…"
              : journey.total_active_days === 0
                ? emptyHint
                : wilted
                  ? wiltedHint
                  : `${journey.total_active_days} active days · ${stage}`}
          </p>
        </div>
        <div
          className="h-2 w-24 rounded-full bg-glacier-100 overflow-hidden"
          aria-hidden
        >
          <motion.div
            className={`h-full rounded-full ${wilted ? "bg-slate-400" : "bg-emerald-500"}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.round((journey?.health ?? 0) * 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>
    </section>
  );
}
