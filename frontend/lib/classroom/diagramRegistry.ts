/**
 * Topic-specific diagram path builders for Scene Planner Phase 1.
 * Paths are rendered with Rough.js sketch style + GSAP stroke animation.
 */

import type { DiagramPath } from "@/lib/classroom/types";

const CHALK = "rgba(255,255,255,0.9)";
const CHALK_DIM = "rgba(255,255,255,0.35)";
const FILL_SHADE = "rgba(255, 220, 100, 0.35)";

export function buildDiagramPaths(
  diagram: string,
  props: Record<string, unknown>,
): DiagramPath[] {
  const cx = Number(props.cx) || 400;
  const cy = Number(props.cy) || 240;

  switch (diagram) {
    case "earth_layers":
    case "earth_cross_section":
      return buildEarthLayers(cx, cy, (props.labels as string[]) || ["Crust", "Mantle", "Core"]);
    case "pie_fraction":
      return buildPieFraction(cx, cy, Number(props.numerator) || 3, Number(props.denominator) || 4);
    case "bar_fraction":
      return buildBarFraction(cx, cy, Number(props.numerator) || 3, Number(props.denominator) || 4);
    case "fraction_groups":
      return buildFractionGroups(cx, cy, Number(props.numerator) || 3, Number(props.denominator) || 4);
    case "water_cycle":
      return buildWaterCycle(cx, cy);
    case "number_line":
      return buildNumberLine(cx, cy, Number(props.start) || 0, (props.jumps as number[]) || [3, 4], Number(props.result) || 7);
    case "ten_frame":
      return buildTenFrame(cx, cy, Number(props.filled) || 7);
    default:
      return [];
  }
}

function buildEarthLayers(cx: number, cy: number, labels: string[]): DiagramPath[] {
  const paths: DiagramPath[] = [
    { d: circlePath(cx, cy, 130), stroke: CHALK, strokeWidth: 3, label: labels[0] || "Crust", labelX: cx + 145, labelY: cy - 20 },
    { d: circlePath(cx, cy, 95), stroke: CHALK, strokeWidth: 2.5, label: labels[1] || "Mantle", labelX: cx + 110, labelY: cy + 10 },
    { d: circlePath(cx, cy, 55), stroke: CHALK, strokeWidth: 2, fill: "rgba(255,120,80,0.25)", label: labels[2] || "Core", labelX: cx, labelY: cy + 5 },
  ];
  if (labels.length) {
    paths.push({
      d: `M ${cx - 160} ${cy} L ${cx - 135} ${cy}`,
      stroke: CHALK,
      strokeWidth: 2,
      label: "← inside",
      labelX: cx - 200,
      labelY: cy + 5,
    });
  }
  return paths;
}

function buildPieFraction(cx: number, cy: number, num: number, den: number): DiagramPath[] {
  const r = 100;
  const paths: DiagramPath[] = [{ d: circlePath(cx, cy, r), stroke: CHALK, strokeWidth: 3 }];
  for (let i = 0; i < den; i++) {
    const a1 = (i / den) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((i + 1) / den) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    paths.push({ d: `M ${cx} ${cy} L ${x1} ${y1}`, stroke: CHALK_DIM, strokeWidth: 1.5 });
    if (i < num) {
      const mid = (a1 + a2) / 2;
      const sx = cx + r * 0.55 * Math.cos(mid);
      const sy = cy + r * 0.55 * Math.sin(mid);
      paths.push({
        d: wedgePath(cx, cy, r, a1, a2),
        stroke: CHALK,
        strokeWidth: 2,
        fill: FILL_SHADE,
        label: i === 0 ? `${num}/${den}` : undefined,
        labelX: sx,
        labelY: sy,
      });
    }
  }
  return paths;
}

function buildBarFraction(cx: number, cy: number, num: number, den: number): DiagramPath[] {
  const paths: DiagramPath[] = [];
  const barW = 280;
  const barH = 50;
  const x0 = cx - barW / 2;
  const y0 = cy - barH / 2;
  const segW = barW / den;
  paths.push({
    d: `M ${x0} ${y0} L ${x0 + barW} ${y0} L ${x0 + barW} ${y0 + barH} L ${x0} ${y0 + barH} Z`,
    stroke: CHALK,
    strokeWidth: 3,
    label: "Chocolate bar",
    labelX: x0,
    labelY: y0 - 18,
  });
  for (let i = 0; i < den; i++) {
    const x = x0 + i * segW;
    if (i > 0) {
      paths.push({ d: `M ${x} ${y0} L ${x} ${y0 + barH}`, stroke: CHALK_DIM, strokeWidth: 1.5 });
    }
    if (i < num) {
      paths.push({
        d: `M ${x + 2} ${y0 + 2} L ${x + segW - 2} ${y0 + 2} L ${x + segW - 2} ${y0 + barH - 2} L ${x + 2} ${y0 + barH - 2} Z`,
        stroke: CHALK,
        strokeWidth: 2,
        fill: FILL_SHADE,
      });
    }
  }
  paths.push({
    d: `M ${x0} ${y0 + barH + 30} L ${x0 + 80} ${y0 + barH + 30}`,
    stroke: CHALK,
    strokeWidth: 2,
    label: `${num} out of ${den} pieces`,
    labelX: x0,
    labelY: y0 + barH + 45,
  });
  return paths;
}

function buildFractionGroups(cx: number, cy: number, num: number, den: number): DiagramPath[] {
  const paths: DiagramPath[] = [];
  const startX = cx - (den * 36) / 2;
  for (let i = 0; i < den; i++) {
    const x = startX + i * 36;
    const circled = i < num;
    paths.push({
      d: circlePath(x, cy, 14),
      stroke: circled ? "rgba(255,230,100,0.9)" : CHALK_DIM,
      strokeWidth: circled ? 3 : 1.5,
      fill: circled ? FILL_SHADE : undefined,
      label: i === 0 ? "🍎" : undefined,
      labelX: x - 6,
      labelY: cy + 5,
    });
  }
  paths.push({
    d: `M ${startX} ${cy + 40} L ${startX + 120} ${cy + 40}`,
    stroke: CHALK,
    strokeWidth: 2,
    label: `${num} of ${den} apples`,
    labelX: startX,
    labelY: cy + 58,
  });
  return paths;
}

function buildWaterCycle(cx: number, cy: number): DiagramPath[] {
  return [
    { d: circlePath(cx - 120, cy - 60, 35), stroke: "rgba(255,220,100,0.9)", strokeWidth: 2, label: "☀️ Sun", labelX: cx - 140, labelY: cy - 110 },
    { d: `M ${cx - 60} ${cy + 40} Q ${cx} ${cy - 20} ${cx + 60} ${cy + 40}`, stroke: CHALK, strokeWidth: 2, label: "Evaporation ↑", labelX: cx - 30, labelY: cy - 30 },
    { d: ellipsePath(cx + 80, cy - 70, 55, 28), stroke: CHALK, strokeWidth: 2.5, label: "Cloud", labelX: cx + 55, labelY: cy - 100 },
    { d: `M ${cx + 60} ${cy - 40} L ${cx + 55} ${cy + 20} L ${cx + 65} ${cy + 20} Z`, stroke: CHALK, strokeWidth: 2, label: "Rain ↓", labelX: cx + 75, labelY: cy + 35 },
    { d: `M ${cx - 150} ${cy + 60} Q ${cx} ${cy + 90} ${cx + 150} ${cy + 60}`, stroke: CHALK, strokeWidth: 3, label: "River", labelX: cx - 30, labelY: cy + 100 },
  ];
}

function buildNumberLine(cx: number, cy: number, start: number, jumps: number[], result: number): DiagramPath[] {
  const x0 = cx - 150;
  const x1 = cx + 150;
  const paths: DiagramPath[] = [
    { d: `M ${x0} ${cy} L ${x1} ${cy}`, stroke: CHALK, strokeWidth: 3, label: "Number line", labelX: x0, labelY: cy - 30 },
  ];
  let pos = 0;
  for (let i = 0; i <= result; i++) {
    const x = x0 + (i / Math.max(result, 1)) * 280;
    paths.push({ d: `M ${x} ${cy - 8} L ${x} ${cy + 8}`, stroke: CHALK_DIM, strokeWidth: 1.5, label: String(start + i), labelX: x - 4, labelY: cy + 22 });
  }
  let cursor = x0;
  jumps.forEach((jump, ji) => {
    const next = cursor + (jump / Math.max(result, 1)) * 280;
    paths.push({
      d: `M ${cursor} ${cy - 20} Q ${(cursor + next) / 2} ${cy - 55} ${next} ${cy - 20}`,
      stroke: "rgba(255,230,100,0.9)",
      strokeWidth: 2.5,
      label: `+${jump}`,
      labelX: (cursor + next) / 2,
      labelY: cy - 62,
    });
    cursor = next;
  });
  paths.push({
    d: circlePath(cursor, cy, 10),
    stroke: CHALK,
    strokeWidth: 2,
    fill: FILL_SHADE,
    label: `= ${result}`,
    labelX: cursor - 10,
    labelY: cy + 38,
  });
  return paths;
}

function buildTenFrame(cx: number, cy: number, filled: number): DiagramPath[] {
  const paths: DiagramPath[] = [];
  const cols = 5;
  const rows = 2;
  const cell = 36;
  const x0 = cx - (cols * cell) / 2;
  const y0 = cy - (rows * cell) / 2;
  paths.push({
    d: `M ${x0} ${y0} L ${x0 + cols * cell} ${y0} L ${x0 + cols * cell} ${y0 + rows * cell} L ${x0} ${y0 + rows * cell} Z`,
    stroke: CHALK,
    strokeWidth: 2.5,
    label: "Ten frame",
    labelX: x0,
    labelY: y0 - 22,
  });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const x = x0 + c * cell + cell / 2;
      const y = y0 + r * cell + cell / 2;
      if (idx < filled) {
        paths.push({ d: circlePath(x, y, 12), stroke: CHALK, strokeWidth: 2, fill: FILL_SHADE });
      } else {
        paths.push({ d: circlePath(x, y, 12), stroke: CHALK_DIM, strokeWidth: 1 });
      }
    }
  }
  return paths;
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy}`;
}

function wedgePath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy + r * Math.sin(a2);
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}
