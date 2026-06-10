/**
 * ComprehensionStateMachine
 * =========================
 *
 * The agent should NOT ask "what emotion is on the face?"
 * The agent should ask "does this student understand, and what do I do next?"
 *
 * States:
 *   IDLE              → no answer given yet, nothing to monitor
 *   MONITORING        → answer just given, 20s observation window
 *   POSSIBLE_CONFUSION→ signals suggest confusion, waiting for confirmation
 *   INTERVENING       → actively giving adapted explanation
 *   ESCALATING        → multiple attempts failed, escalating ladder
 *   UNDERSTOOD        → student confirmed / strong positive signals
 *   SUGGEST_BREAK     → near exhaustion limit
 *   TRY_TOMORROW      → hard limit reached
 *
 * Signal priority (highest → lowest):
 *   1. Direct feedback ("Not yet" / "Yes, got it") — weight 0.50
 *   2. Chat behavior (silence, repeat, confusion words) — weight 0.30
 *   3. Camera (face signals) — weight 0.20
 *
 *   Camera NEVER overrides direct feedback.
 *   "Not yet" click → immediate escalation, no gates.
 */

import type {
  TutorAction,
  EngagementProbabilities,
  LearningSignals,
} from "./types";

export type ComprehensionState =
  | "IDLE"
  | "MONITORING"
  | "POSSIBLE_CONFUSION"
  | "INTERVENING"
  | "ESCALATING"
  | "UNDERSTOOD"
  | "SUGGEST_BREAK"
  | "TRY_TOMORROW";

export interface PolicyResult {
  action: TutorAction;
  reason: string;
  blocked: boolean;  // true if gate stopped action
  blockReason?: string;
  confusionScore: number;
  escalationLevel: number;
  state: ComprehensionState;
}

const CONFUSION_MILD        = 0.24;   // gentle response threshold
const CONFUSION_STRONG      = 0.38;   // adaptive re-explanation threshold
const STABLE_DURATION_MS    = 1_500;  // 1.5s stable signal required
const COOLDOWN_MS           = 5_000;  // 5s between text steps
const COOLDOWN_MEDIA_MS     = 4_000;  // 4s before image/voice step
const MAX_ESCALATION        = 7;

const ESCALATION_LADDER: TutorAction[] = [
  "SIMPLIFY_EXPLANATION",
  "SHOW_VISUAL_EXPLANATION",
  "SHOW_FLOWCHART_STEPS",
  "USE_VOICE_AID",
  "ASK_CHECK_UNDERSTANDING",
  "GIVE_MINI_PUZZLE",
  "SUGGEST_BREAK",
  "SUGGEST_TRY_TOMORROW",
];

export class ComprehensionStateMachine {
  private _state: ComprehensionState = "IDLE";
  private monitoringStart   = 0;
  private escalationLevel   = 0;
  private lastActionTime    = 0;
  private lastAction: TutorAction = "DO_NOTHING";
  private stableConfusionSince = 0;
  private currentTopic      = "";
  private _debugReason      = "";
  /** CV help ladder: 0=simplify, 1=image, 2=voice */
  private cvHelpAttempts    = 0;

  private static CV_HELP_ACTIONS: TutorAction[] = [
    "SIMPLIFY_EXPLANATION",
    "SHOW_VISUAL_EXPLANATION",
    "USE_VOICE_AID",
  ];

  // ── Topic change ─────────────────────────────────────────────────────────
  onTopicChange(topic: string) {
    if (topic !== this.currentTopic) {
      this.currentTopic     = topic;
      this.escalationLevel  = 0;
      this.lastAction       = "DO_NOTHING";
      this.stableConfusionSince = 0;
      this.cvHelpAttempts   = 0;
    }
  }

  // ── Called immediately when tutor sends an answer ─────────────────────────
  onAnswerGiven() {
    this._state = "MONITORING";
    this.monitoringStart = Date.now();
    this.stableConfusionSince = 0;
    this._debugReason = "New answer given — monitoring for 25s";
    // Keep cvHelpAttempts — student may still need help on same answer
  }

  // ── HIGHEST PRIORITY: direct student feedback ─────────────────────────────
  onFeedback(feedback: "understood" | "not_yet"): PolicyResult {
    if (feedback === "understood") {
      this._state = "UNDERSTOOD";
      this.escalationLevel = 0;
      this.lastAction = "DO_NOTHING";
      this._debugReason = "Student confirmed understanding ✓";
      return this.makeResult("DO_NOTHING", "Student understood", false);
    }

    // "Not yet" — IMMEDIATE escalation, no gates whatsoever
    this._state = "ESCALATING";
    this._debugReason = "Student clicked 'Not yet' → immediate escalation";
    return this.escalateNow("Student clicked Not yet — override all gates");
  }

  // ── Called every 2s by the evaluation loop ────────────────────────────────
  // KEY FIX: IDLE is no longer a dead-end. When camera is on, IDLE → MONITORING
  // automatically. The agent ALWAYS watches the student while camera is active.
  evaluate(
    engagement: EngagementProbabilities | null,
    learning: LearningSignals,
    stableConfusionMs: number,
    hybridScores?: Partial<Record<string, number>>,
    hybridStableMs = 0,
  ): PolicyResult {
    const now = Date.now();

    // Terminal rest state — only pauses until a new student message
    if (this._state === "UNDERSTOOD" || this._state === "TRY_TOMORROW") {
      return this.makeResult("DO_NOTHING", `State: ${this._state}`, false);
    }

    // KEY FIX: IDLE → auto-enter MONITORING when camera is giving signals.
    // Previously IDLE required onAnswerGiven() to be called first.
    // Now: if camera sees a face OR any learning signal exists, start watching.
    if (this._state === "IDLE") {
      const hasFace = (engagement?.no_face_detected ?? 1) < 0.8;
      const hasActivity = learning.secondsSinceLastMessage < 300 ||
                          (learning.lastTutorAnswerText ?? "").length > 10;
      if (hasFace || hasActivity) {
        this._state = "MONITORING";
        this.monitoringStart = now;
        this._debugReason = "Camera active — watching student";
      } else {
        return this.makeResult("DO_NOTHING", "No face detected, waiting…", false);
      }
    }

    // Build a combined distress score from ALL engagement signals.
    // Previously only "possible_confusion" was used. Now ALL negative states contribute.
    const noFace = (engagement?.no_face_detected ?? 0) > 0.7;
    const rawConfusion  = engagement && isFinite(engagement.possible_confusion)  ? engagement.possible_confusion  : 0;
    const rawBoredom    = engagement && isFinite(engagement.possible_boredom)    ? engagement.possible_boredom    : 0;
    const rawStress     = engagement && isFinite(engagement.possible_stress)     ? engagement.possible_stress     : 0;
    const rawDistracted = engagement && isFinite(engagement.distracted)          ? engagement.distracted          : 0;
    const rawSad        = engagement && isFinite(engagement.sad)                 ? engagement.sad                 : 0;
    const rawTired      = engagement && isFinite(engagement.tired)               ? engagement.tired               : 0;
    const rawAngry      = engagement && isFinite(engagement.angry)               ? engagement.angry               : 0;
    const rawFearful    = engagement && isFinite(engagement.fearful)             ? engagement.fearful             : 0;

    const hybridDistress = hybridScores
      ? Math.max(
          hybridScores.confused ?? 0,
          hybridScores.sad ?? 0,
          hybridScores.tired ?? 0,
          hybridScores.frustrated ?? 0,
          (hybridScores.bored ?? 0) * 0.85,
          (hybridScores.inattentive ?? 0) * 0.7,
        )
      : 0;

    const cameraScore = noFace ? 0 : Math.min(1, Math.max(
      rawConfusion,
      rawSad * 0.9,
      rawTired * 0.9,
      rawStress * 0.8,
      rawBoredom * 0.65,
      rawDistracted * 0.55,
      rawAngry * 0.75,
      rawFearful * 0.85,
    ));

    const behaviorScore  = this.learningBehaviorScore(learning);
    const finalScore = Math.max(
      (cameraScore * 0.45) + (behaviorScore * 0.25),
      hybridDistress,
    );
    const safeScore  = isFinite(finalScore) ? finalScore : 0;
    const stableMs = Math.max(stableConfusionMs, hybridStableMs);
    const needsReExplanation =
      rawSad > 0.14 ||
      rawTired > 0.10 ||
      rawConfusion > 0.20 ||
      (hybridScores?.sad ?? 0) > 0.14 ||
      (hybridScores?.tired ?? 0) > 0.10 ||
      (hybridScores?.confused ?? 0) > 0.20;

    // Extend monitoring window — after a check-in, stay in MONITORING (don't return to IDLE)
    // Only go back to IDLE if student confirmed understanding
    if (this._state === "MONITORING" && now - this.monitoringStart > 30_000) {
      // Refresh the monitoring window — keep watching
      this.monitoringStart = now;
    }

    // COOLDOWN — shorter wait before image/voice steps
    const cooldownLimit =
      this.lastAction === "SHOW_VISUAL_EXPLANATION" ||
      this.lastAction === "USE_VOICE_AID" ||
      this.cvHelpAttempts >= 2
        ? COOLDOWN_MEDIA_MS
        : COOLDOWN_MS;
    if (now - this.lastActionTime < cooldownLimit) {
      const cd = Math.max(0, Math.round((cooldownLimit - (now - this.lastActionTime)) / 1000));
      this._debugReason = `Score ${(safeScore*100).toFixed(0)}% — cooldown ${cd}s`;
      return this.makeResult("DO_NOTHING", this._debugReason, true, "cooldown");
    }

    // CV help ladder when sad/tired/confused: short examples → picture → read aloud
    const nextCv = needsReExplanation ? this.nextCvHelpAction() : null;
    if (nextCv && stableMs >= STABLE_DURATION_MS && safeScore >= CONFUSION_MILD) {
      this._state = nextCv === "SIMPLIFY_EXPLANATION" ? "INTERVENING" : "ESCALATING";
      const reason = this.buildScoreReason(
        rawConfusion, rawStress, rawSad, rawAngry, rawFearful, rawBoredom, rawDistracted,
        behaviorScore, safeScore, rawTired,
      );
      const labels = ["short examples", "picture", "read aloud"];
      this._debugReason = `CV help step ${this.cvHelpAttempts + 1} (${labels[this.cvHelpAttempts] ?? "?"}): ${reason}`;
      return this.triggerAction(nextCv, safeScore);
    }

    // MILD distress without sad/tired/confused → gentle check-in only
    if (safeScore >= CONFUSION_MILD && safeScore < CONFUSION_STRONG) {
      if (stableMs >= STABLE_DURATION_MS) {
        if (this.lastAction !== "ASK_CHECK_UNDERSTANDING") {
          const reason = this.buildScoreReason(
            rawConfusion, rawStress, rawSad, rawAngry, rawFearful, rawBoredom, rawDistracted,
            behaviorScore, safeScore, rawTired,
          );
          this._debugReason = `Gentle check-in: ${reason}`;
          return this.triggerAction("ASK_CHECK_UNDERSTANDING", safeScore);
        }
      }
    }

    // STRONG distress → full escalation ladder (after CV steps exhausted)
    if (safeScore >= CONFUSION_STRONG) {
      if (stableMs >= STABLE_DURATION_MS) {
        this._state = "ESCALATING";
        const reason = this.buildScoreReason(
          rawConfusion, rawStress, rawSad, rawAngry, rawFearful, rawBoredom, rawDistracted,
          behaviorScore, safeScore, rawTired,
        );
        this._debugReason = `Escalating: ${reason}`;
        return this.escalateNow(reason);
      } else {
        this._state = "POSSIBLE_CONFUSION";
        return this.makeResult(
          "DO_NOTHING",
          `Distress ${(safeScore * 100).toFixed(0)}% — waiting ${((STABLE_DURATION_MS - stableMs) / 1000).toFixed(1)}s`,
          true,
          "stability",
        );
      }
    }

    // Long silence (student is stuck / thinking too long)
    if (learning.secondsSinceLastMessage > 45 && safeScore > 0.20) {
      if (this.lastAction !== "ASK_CHECK_UNDERSTANDING") {
        this._debugReason = `${learning.secondsSinceLastMessage}s silence`;
        return this.triggerAction("ASK_CHECK_UNDERSTANDING", 0.35);
      }
    }

    this._debugReason = `Watching — score: ${(safeScore*100).toFixed(0)}% (cam:${(cameraScore*100).toFixed(0)}% beh:${(behaviorScore*100).toFixed(0)}%)`;
    return this.makeResult("DO_NOTHING", this._debugReason, false);
  }

  // Build a human-readable reason string for debug panel
  private buildScoreReason(
    confusion: number, stress: number, sad: number, angry: number,
    fearful: number, boredom: number, distracted: number,
    behavior: number, total: number, tired = 0,
  ): string {
    const parts: string[] = [];
    if (confusion  > 0.15) parts.push(`confused ${(confusion*100).toFixed(0)}%`);
    if (sad        > 0.14) parts.push(`sad ${(sad*100).toFixed(0)}%`);
    if (tired      > 0.10) parts.push(`tired ${(tired*100).toFixed(0)}%`);
    if (stress     > 0.15) parts.push(`stressed ${(stress*100).toFixed(0)}%`);
    if (angry      > 0.15) parts.push(`angry ${(angry*100).toFixed(0)}%`);
    if (fearful    > 0.15) parts.push(`fearful ${(fearful*100).toFixed(0)}%`);
    if (boredom    > 0.15) parts.push(`bored ${(boredom*100).toFixed(0)}%`);
    if (distracted > 0.20) parts.push(`distracted ${(distracted*100).toFixed(0)}%`);
    if (behavior   > 0.20) parts.push(`behavior ${(behavior*100).toFixed(0)}%`);
    return parts.length ? parts.join(", ") + ` → total ${(total*100).toFixed(0)}%`
                        : `score ${(total*100).toFixed(0)}%`;
  }

  // ── Reset when student says they understood ───────────────────────────────
  onStudentUnderstood() {
    this._state = "UNDERSTOOD";
    this.escalationLevel = 0;
    this.lastAction = "DO_NOTHING";
    this.stableConfusionSince = 0;
    this.cvHelpAttempts = 0;
  }

  /** Student typed a new question — reset escalation and stop rest nagging. */
  onStudentNewMessage() {
    this._state = "MONITORING";
    this.escalationLevel = 0;
    this.lastAction = "DO_NOTHING";
    this.lastActionTime = 0;
    this.stableConfusionSince = 0;
    this.monitoringStart = Date.now();
    this.cvHelpAttempts = 0;
    this._debugReason = "New student question — fresh start";
  }

  /** Student chose "Keep studying" on the optional rest prompt. */
  onStudentContinuesStudying() {
    this._state = "MONITORING";
    this.escalationLevel = 0;
    this.lastAction = "DO_NOTHING";
    this.lastActionTime = Date.now();
    this.cvHelpAttempts = 0;
    this._debugReason = "Student chose to keep studying";
  }

  /** Student chose to rest — pause adaptive interventions. */
  onStudentRest() {
    this._state = "UNDERSTOOD";
    this.escalationLevel = 0;
    this.lastAction = "DO_NOTHING";
    this._debugReason = "Student chose to rest";
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private learningBehaviorScore(l: LearningSignals): number {
    let score = 0;
    if (l.messageContainsConfusion)          score += 0.35;
    if (l.repeatedQuestionCount >= 2)         score += 0.20;
    if (l.wrongAnswerStreak >= 1)             score += 0.15 * l.wrongAnswerStreak;
    if (l.secondsSinceLastMessage > 30)       score += 0.10;
    if (l.secondsSinceLastMessage > 90)       score += 0.15;
    if (l.consecutiveAgentAttempts >= 2)      score += 0.10;
    return Math.min(1, score);
  }

  private escalateNow(reason: string): PolicyResult {
    if (this.escalationLevel >= MAX_ESCALATION) {
      this._state = "TRY_TOMORROW";
      return this.triggerAction("SUGGEST_TRY_TOMORROW", 1.0);
    }
    if (this.escalationLevel >= MAX_ESCALATION - 1) {
      this._state = "SUGGEST_BREAK";
      return this.triggerAction("SUGGEST_BREAK", 0.9);
    }
    const action = ESCALATION_LADDER[Math.min(this.escalationLevel, ESCALATION_LADDER.length - 1)];
    this._debugReason = reason;
    return this.triggerAction(action, 0.8);
  }

  private nextCvHelpAction(): TutorAction | null {
    const ladder: TutorAction[] = [
      "SIMPLIFY_EXPLANATION",
      "SHOW_VISUAL_EXPLANATION",
      "USE_VOICE_AID",
    ];
    if (this.cvHelpAttempts >= ladder.length) return null;
    return ladder[this.cvHelpAttempts];
  }

  private triggerAction(action: TutorAction, score: number): PolicyResult {
    if (
      action !== "DO_NOTHING" &&
      ComprehensionStateMachine.CV_HELP_ACTIONS.includes(action)
    ) {
      this.cvHelpAttempts = Math.min(this.cvHelpAttempts + 1, 3);
    }
    if (action !== "DO_NOTHING" && action !== this.lastAction) {
      this.escalationLevel = Math.min(this.escalationLevel + 1, MAX_ESCALATION);
    }
    this.lastAction     = action;
    this.lastActionTime = Date.now();
    return this.makeResult(action, this._debugReason, false, undefined, score);
  }

  private makeResult(
    action: TutorAction,
    reason: string,
    blocked: boolean,
    blockReason?: string,
    score = 0,
  ): PolicyResult {
    return {
      action, reason, blocked, blockReason,
      confusionScore: score,
      escalationLevel: this.escalationLevel,
      state: this._state,
    };
  }

  // ── Public getters (for debug panel) ─────────────────────────────────────
  get currentState(): ComprehensionState { return this._state; }
  get debugReason(): string { return this._debugReason; }
  get currentEscalationLevel(): number { return this.escalationLevel; }
  get lastTriggeredAction(): TutorAction { return this.lastAction; }
}
