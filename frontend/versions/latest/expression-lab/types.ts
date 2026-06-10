/**
 * Expression Lab — shared types
 */

export type LabEmotion =
  | "happy"
  | "sad"
  | "frustrated"
  | "bored"
  | "tired"
  | "inattentive"
  | "confused"
  | "neutral";

export const LAB_EMOTIONS: LabEmotion[] = [
  "happy",
  "sad",
  "frustrated",
  "bored",
  "tired",
  "inattentive",
  "confused",
  "neutral",
];

export type StrategyId = "mediapipe" | "faceapi" | "hybrid";

export interface LabEmotionScores {
  scores: Record<LabEmotion, number>;
  dominant: LabEmotion;
  confidence: number;
  facePresent: boolean;
  /** Extra debug signals (FPS, raw blendshape, etc.) */
  meta?: Record<string, number | string>;
}

export interface StrategyInfo {
  id: StrategyId;
  name: string;
  shortName: string;
  description: string;
  pros: string[];
  cons: string[];
}

export interface LabFrameFeatures {
  timestamp: number;
  facePresent: boolean;
  faceConfidence: number;
  // Blendshapes / geometry
  browDown: number;
  browInnerUp: number;
  smile: number;
  cheekSquint: number;
  jawOpen: number;
  eyeBlink: number;
  eyeWide: number;
  mouthFrown: number;
  noseSneer: number;
  ear: number;
  headYaw: number;
  headPitch: number;
  blinkRate: number;
  // face-api (optional per frame)
  faHappy?: number;
  faSad?: number;
  faAngry?: number;
  faFearful?: number;
  faDisgusted?: number;
  faSurprised?: number;
  faNeutral?: number;
}

export function emptyScores(): Record<LabEmotion, number> {
  return {
    happy: 0,
    sad: 0,
    frustrated: 0,
    bored: 0,
    tired: 0,
    inattentive: 0,
    confused: 0,
    neutral: 1,
  };
}

export function finalizeScores(
  raw: Record<LabEmotion, number>,
  facePresent: boolean
): LabEmotionScores {
  if (!facePresent) {
    const scores = emptyScores();
    scores.neutral = 1;
    return {
      scores,
      dominant: "neutral",
      confidence: 0,
      facePresent: false,
    };
  }

  const total = LAB_EMOTIONS.reduce((s, k) => s + Math.max(0, raw[k] ?? 0), 0) || 1;
  const scores = Object.fromEntries(
    LAB_EMOTIONS.map((k) => [k, Math.min(1, Math.max(0, (raw[k] ?? 0) / total))])
  ) as Record<LabEmotion, number>;

  let dominant: LabEmotion = "neutral";
  let confidence = 0;
  for (const k of LAB_EMOTIONS) {
    if (scores[k] > confidence) {
      confidence = scores[k];
      dominant = k;
    }
  }

  return { scores, dominant, confidence, facePresent: true };
}
