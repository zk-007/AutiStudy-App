/**
 * TutorPolicyEngine — Local real-time decision engine
 * ====================================================
 *
 * THIS is the missing piece. GPT-4o was deciding actions before — slow, expensive.
 * Now: LOCAL rules decide WHAT action to take. LLM only generates the CONTENT.
 *
 * Escalation ladder (per topic):
 *   0  → DO_NOTHING          (student seems engaged)
 *   1  → SIMPLIFY_EXPLANATION
 *   2  → SHOW_VISUAL_EXPLANATION
 *   3  → SHOW_FLOWCHART_STEPS
 *   4  → USE_VOICE_AID
 *   5  → ASK_CHECK_UNDERSTANDING
 *   6  → GIVE_MINI_PUZZLE
 *   7  → SUGGEST_BREAK
 *   8  → SUGGEST_TRY_TOMORROW
 *
 * Cooldown rules:
 *   • Minimum 12 seconds between any interventions
 *   • Need stable signal for 4 seconds before acting
 *   • Same action not repeated unless escalating
 *   • Confusion threshold: 0.60 (not 1.0 — act before student gives up)
 *   • Reset escalation when student shows understanding or changes topic
 */

import type {
  EngagementProbabilities,
  LearningSignals,
  TutorAction,
  TutorPolicyDecision,
} from "./types";

const CONFUSION_THRESHOLD    = 0.60;
const BOREDOM_THRESHOLD      = 0.65;
const STRESS_THRESHOLD       = 0.55;
const DISTRACTED_THRESHOLD   = 0.60;
const TIRED_THRESHOLD        = 0.60;

const MIN_COOLDOWN_MS        = 12_000;  // 12 seconds between interventions
const STABLE_DURATION_MS     = 4_000;  // 4 seconds of stable signal before acting
const RESET_FOCUSED_DURATION = 5_000;  // 5 seconds of focused → reset escalation

const ESCALATION_LADDER: TutorAction[] = [
  "SIMPLIFY_EXPLANATION",      // 1st attempt
  "SHOW_VISUAL_EXPLANATION",   // 2nd attempt
  "SHOW_FLOWCHART_STEPS",      // 3rd attempt
  "USE_VOICE_AID",             // 4th attempt
  "ASK_CHECK_UNDERSTANDING",   // check in (not escalation — reset point)
  "GIVE_MINI_PUZZLE",          // 5th attempt — engagement reset
  "SUGGEST_BREAK",             // near limit
  "SUGGEST_TRY_TOMORROW",      // hard limit
];

export class TutorPolicyEngine {
  private escalationLevel = 0;
  private lastActionTime  = 0;
  private lastAction: TutorAction = "DO_NOTHING";
  private focusedSince    = 0;  // timestamp when student started looking focused
  private currentTopic    = ""; // reset escalation when topic changes

  // ── Main decision function ────────────────────────────────────────────────
  decide(
    engagement: EngagementProbabilities,
    learning: LearningSignals,
    stableConfusionDurationMs: number,  // from FaceSignalBuffer.stableDurationMs
    currentTopic: string = ""
  ): TutorPolicyDecision {

    const now = Date.now();

    // ── Topic change → reset escalation ──────────────────────────────────────
    if (currentTopic && currentTopic !== this.currentTopic) {
      this.currentTopic = currentTopic;
      this.escalationLevel = 0;
      this.lastAction = "DO_NOTHING";
    }

    // ── Student appears focused → slow de-escalation ──────────────────────
    if (engagement.focused > 0.6) {
      if (this.focusedSince === 0) this.focusedSince = now;
      if (now - this.focusedSince > RESET_FOCUSED_DURATION && this.escalationLevel > 0) {
        this.escalationLevel = Math.max(0, this.escalationLevel - 1);
        this.focusedSince = now; // reset timer for next de-escalation step
      }
    } else {
      this.focusedSince = 0;
    }

    // ── Cooldown: don't spam ──────────────────────────────────────────────
    if (now - this.lastActionTime < MIN_COOLDOWN_MS) {
      return doNothing(this.escalationLevel, "cooldown active");
    }

    // ── No face / low confidence → don't act ─────────────────────────────
    if (engagement.no_face_detected > 0.7 || engagement.low_confidence > 0.5) {
      return doNothing(this.escalationLevel, "face not visible");
    }

    // ── Signal stability gate ─────────────────────────────────────────────
    // Only act if confusion has been stable for STABLE_DURATION_MS
    const needsStability =
      engagement.possible_confusion > CONFUSION_THRESHOLD ||
      engagement.possible_boredom   > BOREDOM_THRESHOLD   ||
      engagement.possible_stress    > STRESS_THRESHOLD;

    if (needsStability && stableConfusionDurationMs < STABLE_DURATION_MS) {
      return doNothing(this.escalationLevel, "signal not yet stable");
    }

    // ── Confusion (highest priority — student needs help) ─────────────────
    const confusionScore = this.weightedConfusion(engagement, learning);
    if (confusionScore > CONFUSION_THRESHOLD) {
      return this.escalate(now, confusionScore, "confusion detected");
    }

    // ── Stress / frustration ─────────────────────────────────────────────
    if (engagement.possible_stress > STRESS_THRESHOLD) {
      // Stressed student: first check in gently, then escalate
      if (this.escalationLevel < 3) {
        return this.triggerAction("ASK_CHECK_UNDERSTANDING", now, engagement.possible_stress, "stress detected");
      }
      return this.escalate(now, engagement.possible_stress, "stress + prior attempts");
    }

    // ── Boredom / distracted ─────────────────────────────────────────────
    if (engagement.possible_boredom > BOREDOM_THRESHOLD || engagement.distracted > DISTRACTED_THRESHOLD) {
      // Bored: check in first; if they're still there, try puzzle
      if (this.lastAction !== "ASK_CHECK_UNDERSTANDING") {
        return this.triggerAction("ASK_CHECK_UNDERSTANDING", now, engagement.possible_boredom, "possible disengagement");
      }
      return this.triggerAction("GIVE_MINI_PUZZLE", now, engagement.possible_boredom, "re-engage with puzzle");
    }

    // ── Tired ─────────────────────────────────────────────────────────────
    if (engagement.tired > TIRED_THRESHOLD && learning.secondsSinceLastMessage > 60) {
      return this.triggerAction("SUGGEST_BREAK", now, engagement.tired, "fatigue detected");
    }

    // ── Long silence (not bored but just quiet) ───────────────────────────
    if (learning.secondsSinceLastMessage > 120 && this.lastAction === "DO_NOTHING") {
      return this.triggerAction("ASK_CHECK_UNDERSTANDING", now, 0.5, "long silence");
    }

    return doNothing(this.escalationLevel, "student appears engaged");
  }

  // ── Compute weighted confusion score combining face + behavior ─────────────
  private weightedConfusion(e: EngagementProbabilities, l: LearningSignals): number {
    let score = e.possible_confusion * 0.6;
    if (l.messageContainsConfusion)         score += 0.20;
    if (l.wrongAnswerStreak >= 2)            score += Math.min(0.15, l.wrongAnswerStreak * 0.05);
    if (l.repeatedQuestionCount >= 2)        score += 0.10;
    if (l.currentTopicDifficulty >= 4)       score += 0.05;
    if (l.consecutiveAgentAttempts === 0)    score *= 0.85; // first time — be a bit more lenient
    return Math.min(1, score);
  }

  // ── Move up the escalation ladder ────────────────────────────────────────
  private escalate(now: number, confidence: number, reason: string): TutorPolicyDecision {
    const action = ESCALATION_LADDER[Math.min(this.escalationLevel, ESCALATION_LADDER.length - 1)];
    return this.triggerAction(action, now, confidence, reason);
  }

  private triggerAction(
    action: TutorAction,
    now: number,
    confidence: number,
    reason: string
  ): TutorPolicyDecision {
    if (action !== "DO_NOTHING" && action !== this.lastAction) {
      this.escalationLevel = Math.min(this.escalationLevel + 1, ESCALATION_LADDER.length - 1);
    }
    this.lastAction = action;
    this.lastActionTime = now;
    return { action, confidence, reason, escalationLevel: this.escalationLevel };
  }

  // ── Called when student clicks "Yes, I got it!" ──────────────────────────
  onStudentUnderstood(): void {
    this.escalationLevel = 0;
    this.lastAction = "DO_NOTHING";
    this.focusedSince = Date.now();
  }

  // ── Called when topic changes ─────────────────────────────────────────────
  onTopicChange(newTopic: string): void {
    this.currentTopic = newTopic;
    this.escalationLevel = 0;
    this.lastAction = "DO_NOTHING";
    this.lastActionTime = 0;
    this.focusedSince = 0;
  }

  get currentEscalationLevel(): number {
    return this.escalationLevel;
  }
}

function doNothing(level: number, reason: string): TutorPolicyDecision {
  return { action: "DO_NOTHING", confidence: 0, reason, escalationLevel: level };
}
