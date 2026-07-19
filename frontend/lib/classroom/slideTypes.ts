/**
 * Inka-inspired slide draw-op schema (Step 1).
 * The LLM / backend will eventually emit these ops.
 * The layout ENGINE computes x/y — not the model.
 */

export type DrawOp =
  | TitleOp
  | BarsOp
  | FlowOp
  | StrokeOp
  | LabelOp
  | PauseOp;

export interface TitleOp {
  op: "title";
  text: string;
}

export interface BarsOp {
  op: "bars";
  /** Bar labels shown under each bar */
  labels: string[];
  /** Bar heights (relative units, engine scales) */
  values: number[];
  /** Optional highlight index (e.g. answer bar) */
  highlight?: number;
  caption?: string;
}

export interface FlowOp {
  op: "flow";
  /** Left-to-right nodes, e.g. ["Junior dev", "Mid-level", "Senior"] */
  nodes: string[];
  caption?: string;
}

export interface StrokeOp {
  op: "stroke";
  /** Pre-built SVG path from layout engine */
  d: string;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
}

export interface LabelOp {
  op: "label";
  text: string;
  x: number;
  y: number;
  size?: number;
}

export interface PauseOp {
  op: "pause";
  ms: number;
}

export interface Slide {
  id: string;
  title: string;
  ops: DrawOp[];
  /** Optional narration line for this slide */
  say?: string;
}

export interface SlideDeckPlan {
  question: string;
  slides: Slide[];
}
