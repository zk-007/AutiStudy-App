import type { AdaptationRound } from "@/lib/agent/TutorComprehensionFlow";

/** Default help-ladder order (Option A — first answer stays text). */
export const DEFAULT_ADAPTATION_ORDER: AdaptationRound[] = [1, 2, 3, 4, 5];

export type AdaptationModality =
  | "step_by_step"
  | "read_aloud"
  | "image"
  | "mcq_recall"
  | "breathing";

const ROUND_TO_MODALITY: Record<AdaptationRound, AdaptationModality | null> = {
  0: null,
  1: "step_by_step",
  2: "read_aloud",
  3: "image",
  4: "mcq_recall",
  5: "breathing",
};

export function roundToModality(round: AdaptationRound): AdaptationModality | null {
  return ROUND_TO_MODALITY[round] ?? null;
}

export function normalizeLadderOrder(raw: unknown): AdaptationRound[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_ADAPTATION_ORDER];
  const valid = raw.filter(
    (n): n is AdaptationRound =>
      typeof n === "number" && n >= 1 && n <= 5,
  );
  if (valid.length === 0) return [...DEFAULT_ADAPTATION_ORDER];
  const seen = new Set<AdaptationRound>();
  const ordered: AdaptationRound[] = [];
  for (const n of valid) {
    if (!seen.has(n)) {
      seen.add(n);
      ordered.push(n);
    }
  }
  for (const n of DEFAULT_ADAPTATION_ORDER) {
    if (!seen.has(n)) ordered.push(n);
  }
  return ordered;
}
