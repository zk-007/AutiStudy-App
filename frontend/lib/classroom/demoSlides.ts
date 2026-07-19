/**
 * Hardcoded demo decks for Step 1 verification.
 * No LLM — proves the slide engine draws correctly before we wire the brain.
 */

import type { SlideDeckPlan } from "@/lib/classroom/slideTypes";

/** Demo 1: Maths bars — 2+5=7 (NOT stars) */
export const DEMO_MATH_BARS: SlideDeckPlan = {
  question: "What is 2 + 5?",
  slides: [
    {
      id: "math-1",
      title: "2 + 5 = ?",
      say: "Let's count with bars on the board.",
      ops: [
        { op: "title", text: "2 + 5 = ?" },
        {
          op: "bars",
          labels: ["2", "5", "7"],
          values: [2, 5, 7],
          highlight: 2,
          caption: "2 + 5 = 7",
        },
      ],
    },
  ],
};

/** Demo 2: Earth layers — flow style labels (NOT stars) */
export const DEMO_EARTH_FLOW: SlideDeckPlan = {
  question: "What is inside the Earth?",
  slides: [
    {
      id: "earth-1",
      title: "Inside the Earth",
      say: "The Earth has layers from outside to inside.",
      ops: [
        { op: "title", text: "Inside the Earth" },
        {
          op: "flow",
          nodes: ["Crust", "Mantle", "Core"],
          caption: "We live on the Crust — the Core is very hot!",
        },
      ],
    },
  ],
};

/** Demo 3: Two-slide deck — Inka-style flip */
export const DEMO_TWO_SLIDES: SlideDeckPlan = {
  question: "CS Career + 3+4",
  slides: [
    {
      id: "career-1",
      title: "The CS Career Ladder",
      say: "A career climbs in steps, not one leap.",
      ops: [
        { op: "title", text: "The CS Career Ladder" },
        {
          op: "flow",
          nodes: ["Junior", "Mid-level", "Senior"],
          caption: "Each step needs practice and time",
        },
      ],
    },
    {
      id: "math-2",
      title: "Quick maths: 3 + 4",
      say: "Now a quick addition with bars.",
      ops: [
        { op: "title", text: "3 + 4 = 7" },
        {
          op: "bars",
          labels: ["3", "4", "7"],
          values: [3, 4, 7],
          highlight: 2,
          caption: "3 + 4 = 7",
        },
      ],
    },
  ],
};

export const DEMO_OPTIONS = [
  { id: "math-bars", label: "2 + 5 (bar chart)", plan: DEMO_MATH_BARS },
  { id: "earth-flow", label: "Earth layers (flow)", plan: DEMO_EARTH_FLOW },
  { id: "two-slides", label: "2 slides (career + maths)", plan: DEMO_TWO_SLIDES },
] as const;
