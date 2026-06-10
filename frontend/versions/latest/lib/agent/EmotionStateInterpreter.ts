/**
 * EmotionStateInterpreter
 * =======================
 * Maps blended browser signals (EngagementAnalyzer + face-api.js) into
 * teaching-relevant emotion states with probabilities.
 *
 * Output is always probabilistic — never "the student IS angry".
 */

import type { EngagementProbabilities, LearningSignals } from "./types";

export type TeachingEmotion =
  | "happy"
  | "satisfied"
  | "sad"
  | "angry"
  | "frustrated"
  | "confused"
  | "focused"
  | "neutral";

export interface TeachingEmotionProbabilities {
  happy: number;
  satisfied: number;
  sad: number;
  angry: number;
  frustrated: number;
  confused: number;
  focused: number;
  neutral: number;
}

export interface TeachingEmotionState {
  probabilities: TeachingEmotionProbabilities;
  dominant: TeachingEmotion;
  confidence: number;
  /** Plain-language summary for the Media Agent (no definitive claims). */
  description: string;
  /** True when positive engagement signals outweigh distress. */
  understood: boolean;
  /** Full hybrid lab scores (Strategy C) when available */
  hybridScores?: Record<string, number>;
  /** Primary label from hybrid engine — sent to Media Agent */
  hybridDominant?: string;
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

function pickDominant(probs: TeachingEmotionProbabilities): {
  dominant: TeachingEmotion;
  confidence: number;
} {
  const entries = Object.entries(probs) as [TeachingEmotion, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [dominant, confidence] = entries[0];
  return { dominant, confidence: clamp(confidence) };
}

const DESCRIPTIONS: Record<TeachingEmotion, string> = {
  happy:       "warm, positive expression — may be enjoying the lesson",
  satisfied:   "calm and engaged — seems to be following along well",
  sad:         "quiet or down — may need gentle encouragement",
  angry:       "tense expression — may be upset or overwhelmed",
  frustrated:  "signs of frustration — may need a different explanation",
  confused:    "puzzled signals — may need simpler or visual help",
  focused:     "attentive and calm — likely concentrating",
  neutral:     "relaxed, neutral expression — no strong signal either way",
};

export function interpretTeachingEmotion(
  engagement: EngagementProbabilities | null,
  learning?: Partial<LearningSignals>
): TeachingEmotionState {
  if (!engagement || engagement.no_face_detected > 0.5) {
    const probs: TeachingEmotionProbabilities = {
      happy: 0, satisfied: 0, sad: 0, angry: 0,
      frustrated: 0, confused: 0.15, focused: 0, neutral: 0.85,
    };
    const { dominant, confidence } = pickDominant(probs);
    return {
      probabilities: probs,
      dominant,
      confidence,
      description: "face not clearly visible — using chat behavior only",
      understood: false,
    };
  }

  const happyRaw = clamp(
    engagement.happy * 0.55 +
    engagement.focused * 0.25 +
    (1 - engagement.possible_confusion) * 0.20
  );

  const satisfiedRaw = clamp(
    engagement.focused * 0.35 +
    engagement.happy * 0.30 +
    (1 - engagement.possible_confusion) * 0.20 +
    (1 - engagement.possible_stress) * 0.15
  );

  const sadRaw = clamp(
    engagement.sad * 0.50 +
    engagement.fearful * 0.25 +
    engagement.possible_stress * 0.15 +
    engagement.tired * 0.10
  );

  const angryRaw = clamp(
    engagement.angry * 0.55 +
    engagement.disgusted * 0.15 +
    engagement.possible_stress * 0.30
  );

  const frustratedRaw = clamp(
    engagement.possible_stress * 0.35 +
    engagement.angry * 0.30 +
    engagement.possible_confusion * 0.20 +
    clamp((learning?.consecutiveAgentAttempts ?? 0) * 0.08) * 0.15
  );

  let confusedRaw = clamp(
    engagement.possible_confusion * 0.55 +
    engagement.sad * 0.10 +
    engagement.fearful * 0.10 +
    engagement.neutral_uncertain * 0.05
  );
  if (learning?.messageContainsConfusion) confusedRaw = clamp(confusedRaw + 0.25);
  if ((learning?.repeatedQuestionCount ?? 0) >= 2) confusedRaw = clamp(confusedRaw + 0.15);

  const focusedRaw = clamp(
    engagement.focused * 0.60 +
    engagement.happy * 0.15 +
    (1 - engagement.possible_confusion) * 0.15 +
    (1 - engagement.possible_boredom) * 0.10
  );

  const neutralRaw = clamp(
    engagement.neutral_uncertain * 0.50 +
    engagement.low_confidence * 0.30 +
    (1 - Math.max(happyRaw, confusedRaw, frustratedRaw, sadRaw)) * 0.20
  );

  const raw: TeachingEmotionProbabilities = {
    happy: happyRaw,
    satisfied: satisfiedRaw,
    sad: sadRaw,
    angry: angryRaw,
    frustrated: frustratedRaw,
    confused: confusedRaw,
    focused: focusedRaw,
    neutral: neutralRaw,
  };

  const total = Object.values(raw).reduce((s, v) => s + v, 0) || 1;
  const probabilities = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, clamp(v / total)])
  ) as TeachingEmotionProbabilities;

  const { dominant, confidence } = pickDominant(probabilities);

  const understood =
    (probabilities.satisfied + probabilities.happy + probabilities.focused) > 0.55 &&
    probabilities.confused < 0.35 &&
    probabilities.frustrated < 0.35 &&
    !learning?.messageContainsConfusion;

  const pct = Math.round(confidence * 100);
  const description = `Signals suggest ${dominant} (~${pct}% confidence) — ${DESCRIPTIONS[dominant]}`;

  return { probabilities, dominant, confidence, description, understood };
}
