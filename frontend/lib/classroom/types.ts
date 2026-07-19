/** Types for the Blackboard Animated Tutor — Scene Planner Phase 1. */

export type BoardAction =
  | "write"
  | "drawLine"
  | "drawCircle"
  | "drawArrow"
  | "highlight"
  | "drawGroups"
  | "drawDivision"
  | "drawDiagram"
  | "pause";

export type DiagramType =
  | "earth_layers"
  | "earth_cross_section"
  | "pie_fraction"
  | "bar_fraction"
  | "fraction_groups"
  | "water_cycle"
  | "number_line"
  | "ten_frame";

export interface TeachingAttempt {
  teaching_style: string;
  diagram: string;
  understood: boolean;
}

export interface DrawDiagramStep {
  action: "drawDiagram";
  diagram: DiagramType | string;
  cx?: number;
  cy?: number;
  numerator?: number;
  denominator?: number;
  labels?: string[];
  start?: number;
  jumps?: number[];
  result?: number;
  filled?: number;
  durationMs?: number;
}

export interface WriteStep {
  action: "write";
  text: string;
  x: number;
  y: number;
  size?: number;
}

export interface DrawLineStep {
  action: "drawLine";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DrawCircleStep {
  action: "drawCircle";
  cx: number;
  cy: number;
  r: number;
  label?: string;
}

export interface DrawArrowStep {
  action: "drawArrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface HighlightStep {
  action: "highlight";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawGroupsStep {
  action: "drawGroups";
  groups: { count: number }[];
  operator?: string;
  emoji?: string;
  yOffset?: number;
}

export interface DrawDivisionStep {
  action: "drawDivision";
  dividend: number;
  divisor: number;
  quotient?: number;
}

export interface PauseStep {
  action: "pause";
  ms: number;
}

export type BoardStep =
  | WriteStep
  | DrawLineStep
  | DrawCircleStep
  | DrawArrowStep
  | HighlightStep
  | DrawGroupsStep
  | DrawDivisionStep
  | DrawDiagramStep
  | PauseStep;

export interface ClassroomLesson {
  title: string;
  voice_script: string;
  analogy: string;
  steps: BoardStep[];
  question: string;
  retry_count: number;
  grade: number;
  subject: string;
  source?: string;
  concept?: string;
  locked_concept?: string;
  teaching_style?: string;
  diagram_used?: string;
}

export type InputMode = "type" | "speak";

export type LessonPhase =
  | "idle"
  | "loading"
  | "playing"
  | "asking"
  | "finished"
  | "erasing";

export interface DrawnElement {
  id: string;
  kind: BoardAction;
  props: Record<string, unknown>;
}

export interface DiagramPath {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  label?: string;
  labelX?: number;
  labelY?: number;
}
