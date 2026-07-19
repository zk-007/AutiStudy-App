"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BoardStep, DrawnElement, LessonPhase } from "@/lib/classroom/types";
import { DiagramRenderer } from "@/components/classroom/DiagramRenderer";

const BOARD_W = 800;
const BOARD_H = 480;

function uid() {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

function ChalkText({
  text,
  x,
  y,
  size = 28,
}: {
  text: string;
  x: number;
  y: number;
  size?: number;
}) {
  return (
    <motion.text
      x={x}
      y={y}
      fill="rgba(255,255,255,0.92)"
      fontFamily="'Caveat', 'Segoe Print', cursive"
      fontSize={size}
      fontWeight={600}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      style={{ filter: "drop-shadow(0 0 2px rgba(255,255,255,0.3))" }}
    >
      {text.split("").map((ch, i) => (
        <motion.tspan
          key={`${i}-${ch}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.04, duration: 0.05 }}
        >
          {ch}
        </motion.tspan>
      ))}
    </motion.text>
  );
}

function renderElement(el: DrawnElement) {
  const p = el.props;
  switch (el.kind) {
    case "write":
      return (
        <ChalkText
          key={el.id}
          text={String(p.text)}
          x={Number(p.x)}
          y={Number(p.y)}
          size={Number(p.size) || 28}
        />
      );
    case "drawLine":
      return (
        <motion.line
          key={el.id}
          x1={Number(p.x1)}
          y1={Number(p.y1)}
          x2={Number(p.x2)}
          y2={Number(p.y2)}
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={3}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0.6 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.6 }}
        />
      );
    case "drawCircle": {
      const cx = Number(p.cx);
      const cy = Number(p.cy);
      const r = Number(p.r);
      return (
        <g key={el.id}>
          <motion.circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={3}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7 }}
          />
          {p.label ? (
            <ChalkText text={String(p.label)} x={cx - 20} y={cy + r + 28} size={20} />
          ) : null}
        </g>
      );
    }
    case "drawArrow": {
      const x1 = Number(p.x1);
      const y1 = Number(p.y1);
      const x2 = Number(p.x2);
      const y2 = Number(p.y2);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = 12;
      const hx1 = x2 - head * Math.cos(angle - 0.4);
      const hy1 = y2 - head * Math.sin(angle - 0.4);
      const hx2 = x2 - head * Math.cos(angle + 0.4);
      const hy2 = y2 - head * Math.sin(angle + 0.4);
      return (
        <g key={el.id}>
          <motion.line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(255,255,240,0.9)"
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5 }}
          />
          <motion.polyline
            points={`${x2},${y2} ${hx1},${hy1} ${hx2},${hy2}`}
            fill="none"
            stroke="rgba(255,255,240,0.9)"
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          />
        </g>
      );
    }
    case "highlight":
      return (
        <motion.rect
          key={el.id}
          x={Number(p.x)}
          y={Number(p.y)}
          width={Number(p.w)}
          height={Number(p.h)}
          fill="none"
          stroke="rgba(255, 230, 100, 0.75)"
          strokeWidth={3}
          rx={6}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35 }}
        />
      );
    case "drawGroups": {
      const groups = (p.groups as { count: number }[]) || [];
      const emoji = String(p.emoji || "⭐");
      const op = String(p.operator || "");
      const baseY = Number(p.yOffset) || 180;
      let xCursor = 70;
      const nodes: React.ReactNode[] = [];
      groups.forEach((g, gi) => {
        const count = Math.min(g.count, 12);
        for (let i = 0; i < count; i++) {
          nodes.push(
            <motion.text
              key={`${el.id}-g${gi}-${i}`}
              x={xCursor + i * 34}
              y={baseY}
              fontSize={28}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.08 + gi * 0.2 }}
            >
              {emoji}
            </motion.text>,
          );
        }
        xCursor += count * 34 + 24;
        if (op && gi < groups.length - 1) {
          nodes.push(
            <ChalkText
              key={`${el.id}-op-${gi}`}
              text={op}
              x={xCursor - 12}
              y={baseY}
              size={30}
            />,
          );
          xCursor += 36;
        }
      });
      return <g key={el.id}>{nodes}</g>;
    }
    case "drawDiagram":
      return (
        <DiagramRenderer
          key={el.id}
          diagram={String(p.diagram || "")}
          props={p}
        />
      );
    case "drawDivision": {
      const dividend = Number(p.dividend);
      const divisor = Number(p.divisor);
      const quotient = p.quotient != null ? Number(p.quotient) : null;
      const bx = 120;
      const by = 160;
      return (
        <g key={el.id}>
          <motion.path
            d={`M ${bx} ${by} L ${bx + 180} ${by} L ${bx + 180} ${by + 120}`}
            fill="none"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth={3}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8 }}
          />
          <ChalkText text={String(divisor)} x={bx + 8} y={by - 12} size={32} />
          <ChalkText text={String(dividend)} x={bx + 24} y={by + 36} size={32} />
          {quotient != null ? (
            <ChalkText text={`= ${quotient}`} x={bx + 200} y={by + 36} size={32} />
          ) : null}
        </g>
      );
    }
    default:
      return null;
  }
}

export interface BlackboardProps {
  steps: BoardStep[];
  playing: boolean;
  onPhaseChange?: (phase: LessonPhase) => void;
  onComplete?: () => void;
  eraseSignal?: number;
}

export function Blackboard({
  steps,
  playing,
  onPhaseChange,
  onComplete,
  eraseSignal = 0,
}: BlackboardProps) {
  const [elements, setElements] = useState<DrawnElement[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const erase = useCallback(async () => {
    abortRef.current?.abort();
    onPhaseChange?.("erasing");
    setElements([]);
    await new Promise((r) => setTimeout(r, 400));
    onPhaseChange?.("idle");
  }, [onPhaseChange]);

  useEffect(() => {
    if (eraseSignal > 0) void erase();
  }, [eraseSignal, erase]);

  useEffect(() => {
    if (!playing || steps.length === 0) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setElements([]);
    onPhaseChange?.("playing");

    (async () => {
      try {
        for (const step of steps) {
          if (ac.signal.aborted) return;

          if (step.action === "pause") {
            await sleep(step.ms ?? 500, ac.signal);
            continue;
          }

          const el: DrawnElement = {
            id: uid(),
            kind: step.action,
            props: { ...step },
          };
          setElements((prev) => [...prev, el]);

          const delay =
            step.action === "write"
              ? 400 + ((step as { text?: string }).text?.length ?? 0) * 30
              : step.action === "drawDiagram"
                ? Number((step as { durationMs?: number }).durationMs) || 3200
                : 700;
          await sleep(Math.min(delay, 4500), ac.signal);
        }
        onPhaseChange?.("finished");
        onComplete?.();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("[Blackboard]", err);
        }
      }
    })();

    return () => ac.abort();
  }, [playing, steps, onPhaseChange, onComplete]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl shadow-deep border-4 border-[#3d2817]">
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.15) 0%, transparent 40%)",
        }}
      />
      <svg
        viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
        className="w-full aspect-[5/3] bg-gradient-to-br from-[#1a3d2e] via-[#163528] to-[#0f261c]"
        role="img"
        aria-label="Classroom blackboard"
      >
        {/* chalk dust texture lines */}
        {[...Array(6)].map((_, i) => (
          <line
            key={i}
            x1={0}
            y1={80 * i}
            x2={BOARD_W}
            y2={80 * i + 20}
            stroke="rgba(255,255,255,0.02)"
            strokeWidth={1}
          />
        ))}
        <AnimatePresence>{elements.map(renderElement)}</AnimatePresence>
      </svg>
      <div className="absolute bottom-2 right-3 text-[10px] text-white/30 font-mono">
        chalk board
      </div>
    </div>
  );
}
