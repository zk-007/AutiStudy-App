import type { AdaptationRound } from "@/lib/agent/TutorComprehensionFlow";
import type { LearnerProfile } from "@/lib/api/client";

/** Default help-ladder order (Option A — first answer stays text). */
export const DEFAULT_ADAPTATION_ORDER: AdaptationRound[] = [1, 2, 3, 4, 5];

/** Help rounds only — breathing (5) is always last after these fail. */
export const HELP_ROUNDS: AdaptationRound[] = [1, 2, 3, 4];

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

/**
 * Gap 7 — which modality to apply with the FIRST answer (before any 👎).
 * Returns null when plain text + 👍/👎 is enough (text-only learners).
 */
export function resolveInitialRound(
  profile: LearnerProfile | null,
  ladderOrder: AdaptationRound[],
): AdaptationRound | null {
  if (!profile?.onboarding_completed) return null;

  const style = profile.learning_style;
  if (style === "visual") return 3;
  if (style === "audio") return 2;
  if (style === "text") {
    if (profile.explanation_style === "step_by_step") return 1;
    return null;
  }

  // mixed — use the top of the personalized ladder (excluding breathing)
  const first = ladderOrder.find((r) => r >= 1 && r <= 4);
  return first ?? null;
}

export function modalitiesFromRounds(rounds: Iterable<AdaptationRound>): string[] {
  return [...rounds]
    .map((r) => roundToModality(r))
    .filter((m): m is AdaptationModality => !!m);
}
