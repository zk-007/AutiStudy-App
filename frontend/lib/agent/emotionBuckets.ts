/**
 * CV emotion buckets for the popup-gated comprehension flow.
 */

import type { LabEmotion } from "@/expression-lab/types";

export type EmotionBucket = "happy" | "neutral_serious" | "distressed";

const NEGATIVE_CV_EMOTIONS: LabEmotion[] = [
  "confused",
  "frustrated",
  "sad",
  "inattentive",
  "bored",
  "tired",
];

function maxNonHappyScore(scores: Partial<Record<LabEmotion, number>>): number {
  let max = 0;
  for (const key of NEGATIVE_CV_EMOTIONS) {
    max = Math.max(max, scores[key] ?? 0);
  }
  max = Math.max(max, scores.neutral ?? 0);
  return max;
}

export function classifyEmotionBucket(
  scores: Partial<Record<LabEmotion, number>>,
): EmotionBucket {
  const happy = scores.happy ?? 0;
  const neutral = scores.neutral ?? 0;
  const sad = scores.sad ?? 0;
  const frustrated = scores.frustrated ?? 0;
  const confused = scores.confused ?? 0;
  const tired = scores.tired ?? 0;
  const bored = scores.bored ?? 0;
  const inattentive = scores.inattentive ?? 0;

  const distressMax = Math.max(sad, frustrated, confused, tired, bored, inattentive);

  if (
    sad >= 0.28 ||
    frustrated >= 0.30 ||
    confused >= 0.28 ||
    tired >= 0.35 ||
    bored >= 0.35 ||
    inattentive >= 0.40
  ) {
    return "distressed";
  }

  if (distressMax >= 0.20 && happy < distressMax) {
    return "neutral_serious";
  }

  // Happy only when smile clearly leads — not noise while confused/tired show in UI
  if (happy >= 0.10 && happy >= distressMax * 1.05) {
    return "happy";
  }

  if (happy >= 0.02 && distressMax < 0.15) {
    return "happy";
  }

  if (neutral >= 0.08 || inattentive >= 0.12 || confused >= 0.15) {
    return "neutral_serious";
  }

  return "neutral_serious";
}

export function shouldAutoAdapt(bucket: EmotionBucket): boolean {
  return bucket === "neutral_serious" || bucket === "distressed";
}

export function shouldPauseCvAfterYes(bucket: EmotionBucket): boolean {
  return bucket === "happy";
}

/**
 * After feedback timeout — trust the Media Agent's own "Primary" label
 * (the same dominant emotion shown in the side panel) as the single source
 * of truth, instead of re-scanning every individual score against its own
 * small threshold. Secondary emotions always carry a bit of natural noise
 * (e.g. "confused" reading 12-15% even on a genuinely happy face) — acting
 * on those independently caused happy students to get the confused prompt.
 */
export function looksFrustratedOrConfused(
  scores: Partial<Record<LabEmotion, number>>,
  hybridDominant?: LabEmotion | null,
): boolean {
  if (hybridDominant) {
    return NEGATIVE_CV_EMOTIONS.includes(hybridDominant);
  }
  // No dominant label available — fall back to the general bucket heuristic.
  return classifyEmotionBucket(scores) === "distressed";
}

/** After feedback timeout — only when CV primary emotion is clearly happy. */
export function looksHappyAfterTimeout(
  scores: Partial<Record<LabEmotion, number>>,
  hybridDominant?: LabEmotion | null,
): boolean {
  if (hybridDominant) {
    return hybridDominant === "happy";
  }
  const happy = scores.happy ?? 0;
  const runnerUp = maxNonHappyScore(scores);
  return happy >= 0.15 && happy >= runnerUp * 1.1;
}

/** Decide CV follow-up once 👍/👎 has timed out — Primary label decides everything. */
export function resolveCvTimeoutSignal(
  scores: Partial<Record<LabEmotion, number>>,
  hybridDominant?: LabEmotion | null,
): "happy" | "distressed" | null {
  if (hybridDominant === "happy") return "happy";
  if (hybridDominant && NEGATIVE_CV_EMOTIONS.includes(hybridDominant)) return "distressed";
  if (!hybridDominant) {
    // No reading yet — use the softer bucket heuristic as a last resort.
    const bucket = classifyEmotionBucket(scores);
    if (bucket === "distressed") return "distressed";
    if (bucket === "happy") return "happy";
  }
  return null;
}
