/**
 * AUTISTUDY Adaptive Tutor Agent — Shared Types
 * ==============================================
 *
 * Design philosophy (from architecture review):
 *   • Never claim "student IS bored" — output PROBABILITIES
 *   • Combine face signals + learning behavior (multi-signal)
 *   • Personal baseline: compare against student's OWN neutral face
 *   • Local decisions (TutorPolicyEngine) — LLM only generates CONTENT
 */

// ── Raw face signals (one per frame from MediaPipe) ──────────────────────────

export interface FaceSignal {
  timestamp: number;
  // Blend shapes (0.0 → 1.0)
  browDown: number;
  browInnerUp: number;
  smile: number;
  cheekSquint: number;
  jawOpen: number;
  eyeBlink: number;
  eyeWide: number;
  mouthFrown: number;
  noseSneer: number;
  // Derived metrics
  ear: number;          // Eye Aspect Ratio (low = drooping / tired)
  blinkDetected: boolean; // true if this frame is a blink
  // Head pose (approximate from landmark geometry)
  headYaw: number;      // -1 (looking left) → 0 (straight) → 1 (looking right)
  headPitch: number;    // -1 (looking up) → 0 (straight) → 1 (looking down)
  // Face presence
  facePresent: boolean;
  faceConfidence: number; // 0–1
}

// ── Averaged signals over the sliding window ─────────────────────────────────

export interface FaceSignalAverage {
  browDown: number;
  browInnerUp: number;
  smile: number;
  cheekSquint: number;
  jawOpen: number;
  eyeBlink: number;
  eyeWide: number;
  mouthFrown: number;
  ear: number;
  headYaw: number;        // absolute value — any side counts as looking away
  headPitch: number;
  blinkRate: number;      // blinks per minute over window
  facePresenceRatio: number; // fraction of frames with face detected
  sampleCount: number;
  windowDurationMs: number;
}

// ── Student personal baseline (calibrated at first use) ──────────────────────

export interface StudentBaseline {
  browDown: number;
  browInnerUp: number;
  smile: number;
  ear: number;
  headYaw: number;
  headPitch: number;
  normalBlinkRate: number; // blinks per minute at rest
  capturedAt: number;
  studentEmail: string;
}

// ── Engagement probabilities (never binary, always 0–1) ──────────────────────

export interface EngagementProbabilities {
  focused: number;
  possible_confusion: number;
  possible_boredom: number;
  possible_stress: number;
  distracted: number;
  tired: number;
  neutral_uncertain: number;  // open face, no clear expression — NOT assumed focused
  no_face_detected: number;
  low_confidence: number;
  // Real emotion labels from face-api.js (direct emotion classifier)
  sad:       number;
  angry:     number;
  fearful:   number;
  surprised: number;
  happy:     number;
  disgusted: number;
  // Dominant label (for display only — use probs for decisions)
  dominant: EngagementLabel;
  dominantScore: number;
}

export type EngagementLabel =
  | "focused"
  | "possible_confusion"
  | "possible_boredom"
  | "possible_stress"
  | "distracted"
  | "tired"
  | "neutral_uncertain"   // neutral face — not confused, but also not clearly focused
  | "no_face_detected"
  | "low_confidence";

// ── Learning behavior signals (from chat behavior, not camera) ────────────────

export interface LearningSignals {
  secondsSinceLastMessage: number;
  repeatedQuestionCount: number;    // how many times student asked similar thing
  wrongAnswerStreak: number;        // consecutive wrong quiz answers
  currentTopicDifficulty: number;   // 1 (easy) → 5 (hard)
  messageContainsConfusion: boolean;  // "i don't get it", "again", "what?", etc.
  consecutiveAgentAttempts: number; // how many times agent has tried already on this topic
  lastUserMessageText: string;
  lastTutorAnswerText: string;
}

// ── Tutor actions (escalation ladder) ────────────────────────────────────────

export type TutorAction =
  | "DO_NOTHING"
  | "SIMPLIFY_EXPLANATION"
  | "SHOW_VISUAL_EXPLANATION"
  | "SHOW_FLOWCHART_STEPS"
  | "USE_VOICE_AID"
  | "ASK_CHECK_UNDERSTANDING"
  | "GIVE_MINI_PUZZLE"
  | "SUGGEST_BREAK"
  | "SUGGEST_TRY_TOMORROW";

export const TUTOR_ACTION_EMOJI: Record<TutorAction, string> = {
  DO_NOTHING:              "✅",
  SIMPLIFY_EXPLANATION:    "📝",
  SHOW_VISUAL_EXPLANATION: "🖼️",
  SHOW_FLOWCHART_STEPS:    "🪜",
  USE_VOICE_AID:           "🔊",
  ASK_CHECK_UNDERSTANDING: "❓",
  GIVE_MINI_PUZZLE:        "🧩",
  SUGGEST_BREAK:           "☕",
  SUGGEST_TRY_TOMORROW:    "🌙",
};

export const TUTOR_ACTION_LABEL: Record<TutorAction, string> = {
  DO_NOTHING:              "All good",
  SIMPLIFY_EXPLANATION:    "Simplifying…",
  SHOW_VISUAL_EXPLANATION: "Adding visual…",
  SHOW_FLOWCHART_STEPS:    "Step by step…",
  USE_VOICE_AID:           "Reading aloud…",
  ASK_CHECK_UNDERSTANDING: "Checking in…",
  GIVE_MINI_PUZZLE:        "Mini challenge…",
  SUGGEST_BREAK:           "Suggesting break",
  SUGGEST_TRY_TOMORROW:    "Wrap up for now",
};

// Friendly messages shown in UI (never "you look confused")
export const TUTOR_ACTION_MESSAGE: Record<TutorAction, string> = {
  DO_NOTHING:              "",
  SIMPLIFY_EXPLANATION:    "Let me explain this differently 🌟",
  SHOW_VISUAL_EXPLANATION: "Here's a picture to help! 🎨",
  SHOW_FLOWCHART_STEPS:    "Let's break this into small steps 🪜",
  USE_VOICE_AID:           "Let me read this for you 🔊",
  ASK_CHECK_UNDERSTANDING: "How are we doing so far? 😊",
  GIVE_MINI_PUZZLE:        "Want to try a quick challenge? 🧩",
  SUGGEST_BREAK:           "You're working hard! Want a short break? ☕",
  SUGGEST_TRY_TOMORROW:    "Great effort today! Maybe fresh eyes tomorrow? 🌙",
};

// ── Policy engine decision ────────────────────────────────────────────────────

export interface TutorPolicyDecision {
  action: TutorAction;
  confidence: number;      // 0–1 how confident the policy is
  reason: string;          // internal reason (for debugging, not shown to student)
  escalationLevel: number; // 0 = fresh topic, 1–6 = escalation steps
}

// ── Adaptive agent state (complete state exposed by the hook) ─────────────────

export interface AdaptiveTutorState {
  // Camera
  cameraEnabled: boolean;
  cameraError: string | null;
  // MediaPipe
  mediaPipeReady: boolean;
  mediaPipeLoading: boolean;
  mediaPipeFps: number;
  // Engagement (probabilities, not binary labels)
  engagement: EngagementProbabilities | null;
  // Current policy decision
  lastDecision: TutorPolicyDecision | null;
  lastDecisionTime: number;
  // Content being generated
  generatingContent: boolean;
  // Escalation
  escalationLevel: number;
  // History of actions taken on current topic
  actionsHistory: Array<{ action: TutorAction; timestamp: number }>;
}
