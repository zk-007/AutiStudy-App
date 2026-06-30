"use client";

/**
 * Full-screen breathing exercise — slow inhale, hold, exhale cycle.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

interface BreathingModalProps {
  open: boolean;
  onComplete: () => void;
}

type BreathPhase = "inhale" | "hold" | "exhale" | "done";

const INHALE_MS = 5500;
const HOLD_MS = 3000;
const EXHALE_MS = 5500;
const TICK_MS = 1100;

export function BreathingModal({ open, onComplete }: BreathingModalProps) {
  useBodyScrollLock(open);

  const [phase, setPhase] = useState<BreathPhase>("inhale");
  const [count, setCount] = useState(5);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!open) {
      setPhase("inhale");
      setCount(5);
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms));
    };

    const runCountdown = (start: number, onFinish: () => void) => {
      let current = start;
      setCount(current);

      const tick = () => {
        if (cancelled) return;
        current -= 1;
        if (current <= 0) {
          onFinish();
          return;
        }
        setCount(current);
        schedule(tick, TICK_MS);
      };

      schedule(tick, TICK_MS);
    };

    setPhase("inhale");
    setCount(5);

    runCountdown(5, () => {
      if (cancelled) return;
      setPhase("hold");
      setCount(0);
      schedule(() => {
        if (cancelled) return;
        setPhase("exhale");
        setCount(5);
        runCountdown(5, () => {
          if (cancelled) return;
          setPhase("done");
          schedule(() => onCompleteRef.current(), 1200);
        });
      }, HOLD_MS);
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [open]);

  const circleScale =
    phase === "inhale" ? [0.85, 1.35] : phase === "exhale" ? [1.35, 0.85] : [1.1, 1.1];

  const circleDuration =
    phase === "inhale" ? INHALE_MS / 1000 : phase === "exhale" ? EXHALE_MS / 1000 : 0.6;

  const phaseLabel =
    phase === "inhale"
      ? "Breathe in slowly…"
      : phase === "hold"
        ? "Hold gently…"
        : phase === "exhale"
          ? "Breathe out slowly…"
          : "Nice job! You're ready to keep learning 🌿";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-deep/40 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Breathing exercise"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="mx-4 max-w-sm w-full rounded-3xl bg-white/95 shadow-2xl border border-white/80 px-8 py-10 flex flex-col items-center gap-6"
          >
            <p className="text-xl font-display font-extrabold text-deep text-center">
              Take a deep breath…
            </p>

            <div className="relative flex items-center justify-center w-44 h-44">
              <motion.div
                key={phase}
                initial={{ scale: circleScale[0] as number, opacity: 0.45 }}
                animate={{
                  scale: phase === "done" ? 1 : (circleScale[1] as number),
                  opacity: phase === "hold" ? 0.75 : [0.45, 0.9, 0.45],
                }}
                transition={{
                  duration: circleDuration,
                  ease: [0.4, 0, 0.2, 1],
                  repeat: phase === "hold" ? 0 : 0,
                }}
                className="absolute inset-0 rounded-full bg-gradient-to-br from-glacier-300 to-glacier-500"
              />
              <svg viewBox="0 0 100 100" className="relative w-28 h-28 text-white drop-shadow">
                <circle cx="50" cy="50" r="38" fill="currentColor" opacity="0.2" />
                <circle
                  cx="50"
                  cy="50"
                  r="30"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  opacity="0.6"
                />
                <text
                  x="50"
                  y="55"
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize={phase === "hold" ? "11" : "16"}
                  fontWeight="bold"
                >
                  {phase === "done" ? "✓" : phase === "hold" ? "•••" : count}
                </text>
              </svg>
            </div>

            <p className="text-sm text-deep-muted text-center leading-relaxed min-h-[2.5rem]">
              {phaseLabel}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
