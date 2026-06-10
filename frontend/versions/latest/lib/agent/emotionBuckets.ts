/**
 * CV emotion buckets for the popup-gated comprehension flow.
 */

import type { LabEmotion } from "@/expression-lab/types";

export type EmotionBucket = "happy" | "neutral_serious" | "distressed";

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

  const distressMax = Math.max(sad, frustrated, confused, tired, bored);

  if (
    sad >= 0.28 ||
    frustrated >= 0.30 ||
    confused >= 0.28 ||
    tired >= 0.35 ||
    bored >= 0.35
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
