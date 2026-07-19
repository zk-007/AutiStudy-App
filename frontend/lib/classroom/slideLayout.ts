/**
 * Layout engine — converts draw-ops into positioned SVG primitives.
 * Inka-style: the brain picks WHAT to draw; this engine picks WHERE.
 */

import type { BarsOp, FlowOp, TitleOp } from "@/lib/classroom/slideTypes";

const BOARD_W = 800;
const BOARD_H = 480;
const CHALK = "rgba(255,255,255,0.92)";
const CHALK_DIM = "rgba(255,255,255,0.4)";
const HIGHLIGHT = "rgba(255, 210, 80, 0.55)";

export interface LaidStroke {
  d: string;
  stroke: string;
  fill: string;
  strokeWidth: number;
  delay: number;
}

export interface LaidLabel {
  text: string;
  x: number;
  y: number;
  size: number;
  delay: number;
}

export interface LaidSlide {
  title: LaidLabel;
  strokes: LaidStroke[];
  labels: LaidLabel[];
}

export function layoutTitle(op: TitleOp): LaidLabel {
  return {
    text: op.text,
    x: 60,
    y: 58,
    size: 32,
    delay: 0,
  };
}

/** Horizontal bar chart — good for 2+5, comparisons */
export function layoutBars(op: BarsOp, startDelay = 0.3): Pick<LaidSlide, "strokes" | "labels"> {
  const strokes: LaidStroke[] = [];
  const labels: LaidLabel[] = [];
  const n = op.values.length;
  const maxVal = Math.max(...op.values, 1);
  const chartLeft = 120;
  const chartRight = BOARD_W - 80;
  const chartBottom = 360;
  const chartTop = 120;
  const chartH = chartBottom - chartTop;
  const gap = 24;
  const barW = Math.min(80, (chartRight - chartLeft - gap * (n - 1)) / n);

  // Baseline
  strokes.push({
    d: `M ${chartLeft} ${chartBottom} L ${chartRight} ${chartBottom}`,
    stroke: CHALK,
    fill: "none",
    strokeWidth: 2.5,
    delay: startDelay,
  });

  op.values.forEach((val, i) => {
    const h = (val / maxVal) * (chartH - 20);
    const x = chartLeft + i * (barW + gap);
    const y = chartBottom - h;
    const isHi = op.highlight === i;

    strokes.push({
      d: `M ${x} ${chartBottom} L ${x} ${y} L ${x + barW} ${y} L ${x + barW} ${chartBottom} Z`,
      stroke: CHALK,
      fill: isHi ? HIGHLIGHT : "rgba(255,255,255,0.08)",
      strokeWidth: isHi ? 3 : 2,
      delay: startDelay + 0.4 + i * 0.45,
    });

    labels.push({
      text: op.labels[i] || String(val),
      x: x + barW / 2 - 10,
      y: chartBottom + 28,
      size: 18,
      delay: startDelay + 0.6 + i * 0.45,
    });

    labels.push({
      text: String(val),
      x: x + barW / 2 - 6,
      y: y - 10,
      size: 20,
      delay: startDelay + 0.55 + i * 0.45,
    });
  });

  if (op.caption) {
    labels.push({
      text: op.caption,
      x: chartLeft,
      y: chartBottom + 58,
      size: 22,
      delay: startDelay + 0.5 + n * 0.45,
    });
  }

  return { strokes, labels };
}

/** Left-to-right flow — Inka "career ladder" style */
export function layoutFlow(op: FlowOp, startDelay = 0.3): Pick<LaidSlide, "strokes" | "labels"> {
  const strokes: LaidStroke[] = [];
  const labels: LaidLabel[] = [];
  const nodes = op.nodes;
  const n = nodes.length;
  const y = 220;
  const left = 100;
  const right = BOARD_W - 100;
  const step = (right - left) / Math.max(n - 1, 1);

  nodes.forEach((node, i) => {
    const x = n === 1 ? BOARD_W / 2 : left + i * step;
    const boxW = 110;
    const boxH = 56;

    strokes.push({
      d: `M ${x - boxW / 2} ${y - boxH / 2} L ${x + boxW / 2} ${y - boxH / 2} L ${x + boxW / 2} ${y + boxH / 2} L ${x - boxW / 2} ${y + boxH / 2} Z`,
      stroke: CHALK,
      fill: "rgba(255,255,255,0.06)",
      strokeWidth: 2.5,
      delay: startDelay + i * 0.5,
    });

    labels.push({
      text: node,
      x: x - Math.min(node.length * 4, 40),
      y: y + 6,
      size: 17,
      delay: startDelay + 0.35 + i * 0.5,
    });

    if (i < n - 1) {
      const x2 = left + (i + 1) * step;
      const ax = x + boxW / 2 + 8;
      const bx = x2 - boxW / 2 - 8;
      strokes.push({
        d: `M ${ax} ${y} L ${bx} ${y}`,
        stroke: "rgba(255, 180, 60, 0.9)",
        fill: "none",
        strokeWidth: 3,
        delay: startDelay + 0.25 + i * 0.5 + 0.4,
      });
      // arrow head
      strokes.push({
        d: `M ${bx} ${y} L ${bx - 10} ${y - 6} M ${bx} ${y} L ${bx - 10} ${y + 6}`,
        stroke: "rgba(255, 180, 60, 0.9)",
        fill: "none",
        strokeWidth: 3,
        delay: startDelay + 0.3 + i * 0.5 + 0.45,
      });
    }
  });

  if (op.caption) {
    labels.push({
      text: op.caption,
      x: 60,
      y: 400,
      size: 22,
      delay: startDelay + n * 0.5 + 0.3,
    });
  }

  return { strokes, labels };
}

export function layoutSlide(
  title: string,
  ops: Array<BarsOp | FlowOp | TitleOp>,
): LaidSlide {
  const laid: LaidSlide = {
    title: layoutTitle({ op: "title", text: title }),
    strokes: [],
    labels: [],
  };

  let delayAcc = 0.2;
  for (const op of ops) {
    if (op.op === "bars") {
      const part = layoutBars(op, delayAcc);
      laid.strokes.push(...part.strokes);
      laid.labels.push(...part.labels);
      delayAcc += 1.2;
    } else if (op.op === "flow") {
      const part = layoutFlow(op, delayAcc);
      laid.strokes.push(...part.strokes);
      laid.labels.push(...part.labels);
      delayAcc += 1.5;
    }
  }

  return laid;
}

export const BOARD_SIZE = { w: BOARD_W, h: BOARD_H };
