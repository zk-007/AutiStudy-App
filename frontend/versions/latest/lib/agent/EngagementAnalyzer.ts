/**
 * EngagementAnalyzer — Probability model for student engagement
 * =============================================================
 *
 * CRITICAL DESIGN:
 *   Output is PROBABILITIES (0.0 → 1.0), never binary "student is confused".
 *   If baseline is available, signals are compared against student's OWN neutral.
 *   Combine face signals WITH learning behavior for multi-signal decisions.
 *
 * Emotion labels here describe EXPRESSION PATTERNS, not guaranteed inner states.
 * (Hume AI docs correctly note: "emotion labels do not always directly correspond
 * to the actual internal experience.")
 */

import type {
  FaceSignalAverage,
  StudentBaseline,
  LearningSignals,
  EngagementProbabilities,
  EngagementLabel,
} from "./types";

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

export function analyzeEngagement(
  avg: FaceSignalAverage,
  baseline: StudentBaseline | null,
  learning: LearningSignals
): EngagementProbabilities {

  // ── If no face, return immediately ────────────────────────────────────────
  if (avg.facePresenceRatio < 0.3) {
    return makeResult({ no_face_detected: 0.9, low_confidence: 0.1 });
  }

  // ── Normalize against personal baseline (if calibrated) ───────────────────
  // Deltas = how much the student has changed from THEIR own neutral face.
  // Without baseline, we use raw values (less personalized but still useful).
  const browDownDelta  = baseline ? avg.browDown    - baseline.browDown    : avg.browDown    - 0.1;
  const browInnerDelta = baseline ? avg.browInnerUp - baseline.browInnerUp : avg.browInnerUp - 0.05;
  const smileDelta     = baseline ? avg.smile       - baseline.smile       : avg.smile       - 0.15;
  const earDelta       = baseline ? avg.ear         - baseline.ear         : avg.ear         - 0.28;
  const yawDelta       = baseline ? avg.headYaw     - baseline.headYaw     : avg.headYaw;
  const pitchDelta     = baseline ? avg.headPitch   - baseline.headPitch   : avg.headPitch;
  const normalBlink    = baseline?.normalBlinkRate ?? 15; // avg human = 15-20 blinks/min

  // ── Signal weights ────────────────────────────────────────────────────────

  // CONFUSION signals:
  //   brow furrowed down + brow inner up + no smile + low/negative ear change
  let confusion = 0;
  confusion += clamp(browDownDelta * 2.5)    * 0.30;  // main signal
  confusion += clamp(browInnerDelta * 3)     * 0.20;  // "worried brow"
  confusion += clamp(-smileDelta * 2)        * 0.15;  // absence of smile
  confusion += clamp(avg.mouthFrown * 3)     * 0.10;
  confusion += clamp(avg.noseSneer * 2)      * 0.05;
  // Learning behavior boosts
  if (learning.messageContainsConfusion) confusion += 0.20;
  if (learning.wrongAnswerStreak >= 2)   confusion += clamp(learning.wrongAnswerStreak * 0.08);
  if (learning.repeatedQuestionCount >= 2) confusion += 0.10;
  if (learning.currentTopicDifficulty >= 4) confusion += 0.05;

  // BOREDOM signals:
  //   yawning (jawOpen) + drooping eyes (low EAR) + looking away + very high blink rate
  let boredom = 0;
  boredom += clamp(avg.jawOpen * 2.5)        * 0.35;  // yawning = biggest boredom signal
  boredom += clamp(-earDelta * 4)            * 0.25;  // drooping eyes
  boredom += clamp(yawDelta * 2)             * 0.20;  // looking sideways
  // Elevated blink rate — guard against division by zero
  const blinkDeviation = normalBlink > 0 ? (avg.blinkRate - normalBlink) / normalBlink : 0;
  boredom += clamp(isFinite(blinkDeviation) ? blinkDeviation * 0.5 : 0) * 0.10;
  if (learning.secondsSinceLastMessage > 90)  boredom += 0.20;
  if (learning.secondsSinceLastMessage > 180) boredom += 0.15;

  // STRESS / FRUSTRATION signals:
  //   heavy brow down + mouth frown + eye wide (alarm response) + many failed attempts
  let stress = 0;
  stress += clamp(browDownDelta * 3)         * 0.30;
  stress += clamp(avg.mouthFrown * 3)        * 0.25;
  stress += clamp(avg.eyeWide * 2)           * 0.15;  // wide eyes = alarm/stress
  stress += clamp(avg.noseSneer * 2)         * 0.10;
  if (learning.consecutiveAgentAttempts >= 3) stress += 0.20;

  // DISTRACTED signals:
  //   looking away (yaw high) + not engaging with content
  let distracted = 0;
  distracted += clamp(yawDelta * 3)          * 0.40;  // looking away = main signal
  distracted += clamp(pitchDelta * 2)        * 0.20;  // looking up/down (phone?)
  if (learning.secondsSinceLastMessage > 120) distracted += 0.15;

  // TIRED signals:
  //   very low EAR + high blink rate + slow responses
  let tired = 0;
  tired += clamp(-earDelta * 5)                           * 0.40;
  tired += clamp(avg.jawOpen * 1.5)                       * 0.20; // yawning
  tired += clamp(isFinite(blinkDeviation) ? blinkDeviation * 0.3 : 0) * 0.20;
  if (learning.secondsSinceLastMessage > 150) tired += 0.20;

  // FOCUSED signals:
  //   REQUIRES positive evidence — not just absence of confusion.
  //   Neutral open face ≠ focused. Must show engagement cues.
  let focused = 0;
  focused += clamp(avg.smile * 2.0)          * 0.30;  // smiling = biggest focused cue
  focused += clamp(avg.cheekSquint * 2.0)    * 0.20;  // genuine smile (Duchenne)
  focused += clamp((0.2 - yawDelta) * 3)     * 0.20;  // looking straight (penalised less)
  focused += clamp((avg.ear - 0.25) * 4)     * 0.15;  // eyes clearly open
  if (!learning.messageContainsConfusion)     focused += 0.10;
  if (learning.secondsSinceLastMessage < 10)  focused += 0.05; // recently active
  // Important: neutral (no expression) does NOT add to focused

  // ── Low confidence: face barely visible or calibration not done ──────────
  let lowConf = 0;
  if (avg.facePresenceRatio < 0.6) lowConf = 0.4;
  if (!baseline) lowConf = Math.max(lowConf, 0.15); // uncalibrated = less certain
  if (avg.sampleCount < 15) lowConf = Math.max(lowConf, 0.3);

  // ── Clamp all ─────────────────────────────────────────────────────────────
  confusion   = clamp(confusion);
  boredom     = clamp(boredom);
  stress      = clamp(stress);
  distracted  = clamp(distracted);
  tired       = clamp(tired);
  focused     = clamp(focused);
  lowConf     = clamp(lowConf);

  // NEUTRAL_UNCERTAIN: when no signal is strong enough to classify
  // This prevents "open face + looking at screen" from being called "focused"
  const anySignalStrong = confusion > 0.25 || boredom > 0.25 || stress > 0.20
    || distracted > 0.25 || tired > 0.20 || focused > 0.35;
  const neutralUncertain = anySignalStrong ? 0 : 0.6; // default state when signals are weak

  // ── Dominant label (for display, NOT for decisions) ───────────────────────
  const scores: Record<EngagementLabel, number> = {
    focused,
    possible_confusion:  confusion,
    possible_boredom:    boredom,
    possible_stress:     stress,
    distracted,
    tired,
    neutral_uncertain:   neutralUncertain,
    no_face_detected:    0,
    low_confidence:      lowConf,
  };
  let dominant: EngagementLabel = "neutral_uncertain";
  let dominantScore = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > dominantScore) {
      dominantScore = v;
      dominant = k as EngagementLabel;
    }
  }

  return {
    focused,
    possible_confusion:  confusion,
    possible_boredom:    boredom,
    possible_stress:     stress,
    distracted,
    tired,
    neutral_uncertain:   neutralUncertain,
    no_face_detected:    0,
    low_confidence:      lowConf,
    // face-api.js emotions filled in later by useAdaptiveTutorAgent
    sad: 0, angry: 0, fearful: 0, surprised: 0, happy: 0, disgusted: 0,
    dominant,
    dominantScore,
  };
}

function makeResult(overrides: Partial<EngagementProbabilities>): EngagementProbabilities {
  const base: EngagementProbabilities = {
    focused: 0, possible_confusion: 0, possible_boredom: 0, possible_stress: 0,
    distracted: 0, tired: 0, no_face_detected: 0, low_confidence: 0,
    sad: 0, angry: 0, fearful: 0, surprised: 0, happy: 0, disgusted: 0,
    dominant: "no_face_detected", dominantScore: 0,
    neutral_uncertain: 0,
  };
  return { ...base, ...overrides };
}
