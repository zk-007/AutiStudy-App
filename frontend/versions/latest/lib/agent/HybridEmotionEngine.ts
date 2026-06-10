/**
 * HybridEmotionEngine — Expression Lab Strategy C in production
 * ============================================================
 * MediaPipe blendshapes + face-api.js CNN + 3s temporal smoothing.
 * Powers ComprehensionStateMachine + Media Agent /api/agent/decide.
 */

import { classifyHybrid } from "@/expression-lab/shared/classifiers";
import { LabSignalBuffer } from "@/expression-lab/shared/SignalBuffer";
import type { LabEmotion } from "@/expression-lab/types";
import { LAB_EMOTIONS } from "@/expression-lab/types";
import type { FaceApiEmotions } from "@/lib/hooks/useFaceApiEmotion";
import type {
  EngagementLabel,
  EngagementProbabilities,
  FaceSignalAverage,
  LearningSignals,
} from "./types";
import type { TeachingEmotionState } from "./EmotionStateInterpreter";

const DESCRIPTIONS: Record<LabEmotion, string> = {
  happy:       "warm, positive expression — may be enjoying the lesson",
  sad:         "quiet or down — may need gentle encouragement",
  frustrated:  "signs of frustration — may need a different explanation",
  bored:       "low energy — may need a change of pace",
  tired:       "droopy or yawning — may need a short break",
  inattentive: "looking away — may have lost focus",
  confused:    "puzzled signals — may need simpler or visual help",
  neutral:     "relaxed, neutral expression — no strong signal either way",
};

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

function normalizeScores(raw: Record<LabEmotion, number>): Record<LabEmotion, number> {
  const total = LAB_EMOTIONS.reduce((s, k) => s + Math.max(0, raw[k] ?? 0), 0) || 1;
  return Object.fromEntries(
    LAB_EMOTIONS.map((k) => [k, clamp((raw[k] ?? 0) / total)])
  ) as Record<LabEmotion, number>;
}

function averageToFrame(
  avg: FaceSignalAverage | null,
  faceApi: FaceApiEmotions
): import("@/expression-lab/types").LabFrameFeatures {
  const now = Date.now();
  if (!avg || avg.facePresenceRatio < 0.3) {
    return {
      timestamp: now,
      facePresent: false,
      faceConfidence: faceApi.confidence,
      browDown: 0,
      browInnerUp: 0,
      smile: 0,
      cheekSquint: 0,
      jawOpen: 0,
      eyeBlink: 0,
      eyeWide: 0,
      mouthFrown: 0,
      noseSneer: 0,
      ear: 0.28,
      headYaw: 0,
      headPitch: 0,
      blinkRate: 0,
    };
  }

  return {
    timestamp: now,
    facePresent: true,
    faceConfidence: Math.max(0.5, faceApi.confidence || 0.85),
    browDown: avg.browDown,
    browInnerUp: avg.browInnerUp,
    smile: avg.smile,
    cheekSquint: avg.cheekSquint,
    jawOpen: avg.jawOpen,
    eyeBlink: avg.eyeBlink,
    eyeWide: avg.eyeWide,
    mouthFrown: avg.mouthFrown,
    noseSneer: 0,
    ear: avg.ear,
    headYaw: avg.headYaw,
    headPitch: avg.headPitch,
    blinkRate: avg.blinkRate,
    faHappy: faceApi.happy,
    faSad: faceApi.sad,
    faAngry: faceApi.angry,
    faFearful: faceApi.fearful,
    faDisgusted: faceApi.disgusted,
    faSurprised: faceApi.surprised,
    faNeutral: faceApi.neutral,
  };
}

/** Map hybrid lab scores → EngagementProbabilities for ComprehensionStateMachine */
export function hybridToEngagement(
  scores: Record<LabEmotion, number>,
  facePresent: boolean,
  learning: LearningSignals
): EngagementProbabilities {
  if (!facePresent) {
    return {
      focused: 0,
      possible_confusion: learning.messageContainsConfusion ? 0.5 : 0.2,
      possible_boredom: 0,
      possible_stress: 0,
      distracted: 0,
      tired: 0,
      neutral_uncertain: 0,
      no_face_detected: 0.9,
      low_confidence: 0.1,
      sad: 0,
      angry: 0,
      fearful: 0,
      surprised: 0,
      happy: 0,
      disgusted: 0,
      dominant: "no_face_detected",
      dominantScore: 0.9,
    };
  }

  let confusion = scores.confused;
  if (learning.messageContainsConfusion) confusion = clamp(confusion + 0.2);
  if (learning.repeatedQuestionCount >= 2) confusion = clamp(confusion + 0.1);

  const engagement: EngagementProbabilities = {
    focused: clamp(scores.happy * 0.85 + scores.neutral * 0.1),
    possible_confusion: confusion,
    possible_boredom: scores.bored,
    possible_stress: clamp(scores.frustrated + scores.sad * 0.35),
    distracted: scores.inattentive,
    tired: scores.tired,
    neutral_uncertain: scores.neutral,
    no_face_detected: 0,
    low_confidence: 0,
    sad: scores.sad,
    angry: scores.frustrated,
    fearful: clamp(scores.sad * 0.4 + scores.confused * 0.2),
    surprised: clamp(scores.confused * 0.3),
    happy: scores.happy,
    disgusted: clamp(scores.frustrated * 0.2),
    dominant: "neutral_uncertain",
    dominantScore: 0,
  };

  const rank: [EngagementLabel, number][] = [
    ["focused", engagement.focused],
    ["possible_confusion", engagement.possible_confusion],
    ["possible_boredom", engagement.possible_boredom],
    ["possible_stress", engagement.possible_stress],
    ["distracted", engagement.distracted],
    ["tired", engagement.tired],
    ["neutral_uncertain", engagement.neutral_uncertain],
  ];
  rank.sort((a, b) => b[1] - a[1]);
  engagement.dominant = rank[0][0];
  engagement.dominantScore = rank[0][1];

  return engagement;
}

/** Map hybrid scores → Media Agent teaching state */
export function teachingFromHybrid(
  scores: Record<LabEmotion, number>,
  learning?: Partial<LearningSignals>
): TeachingEmotionState {
  let dominant: LabEmotion = "neutral";
  let confidence = 0;
  for (const k of LAB_EMOTIONS) {
    if (scores[k] > confidence) {
      confidence = scores[k];
      dominant = k;
    }
  }

  const understood =
    (scores.happy + scores.neutral) > 0.55 &&
    scores.confused < 0.35 &&
    scores.frustrated < 0.35 &&
    !learning?.messageContainsConfusion;

  const pct = Math.round(confidence * 100);
  const description = `Hybrid signals suggest ${dominant} (~${pct}% confidence) — ${DESCRIPTIONS[dominant]}`;

  const teachingDominant: TeachingEmotionState["dominant"] =
    dominant === "bored" || dominant === "tired" || dominant === "inattentive"
      ? dominant === "inattentive"
        ? "confused"
        : "sad"
      : dominant === "happy"
        ? "happy"
        : dominant === "sad"
          ? "sad"
          : dominant === "frustrated"
            ? "frustrated"
            : dominant === "confused"
              ? "confused"
              : "neutral";

  return {
    probabilities: {
      happy: scores.happy,
      satisfied: clamp(scores.happy * 0.6 + scores.neutral * 0.4),
      sad: scores.sad,
      angry: scores.frustrated,
      frustrated: scores.frustrated,
      confused: scores.confused,
      focused: clamp(scores.happy * 0.7 + (1 - scores.inattentive) * 0.2),
      neutral: scores.neutral,
    },
    dominant: teachingDominant,
    confidence,
    description,
    understood,
    hybridScores: scores,
    hybridDominant: dominant,
  };
}

export interface HybridProcessResult {
  hybridScores: Record<LabEmotion, number>;
  engagement: EngagementProbabilities;
  teaching: TeachingEmotionState;
}

export class HybridEmotionEngine {
  private buffer = new LabSignalBuffer(3000);

  clear() {
    this.buffer.clear();
  }

  /** Ms that sad/tired/confused/etc. have stayed elevated (for policy gates). */
  distressStableMs(threshold = 0.15): number {
    return this.buffer.stableDistressMs(threshold);
  }

  process(
    avg: FaceSignalAverage | null,
    faceApi: FaceApiEmotions,
    learning: LearningSignals
  ): HybridProcessResult {
    const frame = averageToFrame(avg, faceApi);
    const geoSmooth = this.buffer.getSmoothed();
    const raw = classifyHybrid(frame, geoSmooth);

    if (learning.messageContainsConfusion) {
      raw.confused = clamp(raw.confused + 0.2);
    }
    if (learning.repeatedQuestionCount >= 2) {
      raw.confused = clamp(raw.confused + 0.1);
    }

    this.buffer.push(raw, frame.timestamp, frame.eyeBlink > 0.55);
    let hybridScores = normalizeScores(this.buffer.getSmoothed());

    // Smile boost — only when clearly happy; do not dampen genuine sad signals
    const smileSignal = Math.max(frame.smile, faceApi.happy ?? 0);
    if (smileSignal > 0.38) {
      const boost = clamp(smileSignal * 0.35);
      hybridScores = normalizeScores({
        ...hybridScores,
        happy: clamp(hybridScores.happy + boost),
        sad: clamp(hybridScores.sad - boost * 0.35),
        confused: clamp(hybridScores.confused - boost * 0.25),
      });
    }

    const engagement = hybridToEngagement(hybridScores, frame.facePresent, learning);
    const teaching = teachingFromHybrid(hybridScores, learning);

    return { hybridScores, engagement, teaching };
  }
}
