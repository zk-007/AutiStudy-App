/**
 * TutorComprehensionFlow — thumbs 👍/👎 + choice-based teaching modalities (Gap 7).
 */

import type { TeachingModality } from "@/lib/agent/teachingModalities";

export type FlowPhase = "idle" | "feedback" | "breathing" | "mcq";

export type AdaptationRound = 0 | 1 | 2 | 3 | 4 | 5;

/** Gate before thumbs appear (TTS / image must finish first). */
export type ContentGate = "none" | "tts" | "image";

export const IMAGE_VIEW_MS = 60_000;

/** Shown when all help steps are used (including after the breathing exercise). */
export const LADDER_EXHAUSTED_MESSAGE =
  "We've tried lots of ways together! 🌿 Take a short break if you need one, or ask your question in a new way — I'm still here to help.";

export interface StepMcq {
  step_label: string;
  question: string;
  options: string[];
  correct_index: number;
  wrong_hint?: string;
}

export interface FlowSnapshot {
  phase: FlowPhase;
  showFeedbackBar: boolean;
  /** @deprecated use showFeedbackBar — kept so older UI checks still compile during migration */
  showPopup: boolean;
  awaitingContentGate: ContentGate;
  cvHappyMode: boolean;
  adaptationRound: AdaptationRound;
  adaptationStepsTaken: number;
  blockInput: boolean;
  showBreathing: boolean;
  imageViewActive: boolean;
  mcqActive: boolean;
  mcqPhase: "recall" | "teaching" | "appreciation";
  mcqQuestions: StepMcq[];
  mcqIndex: number;
  cvPaused: boolean;
  feedbackElapsedMs: number;
  contentDeliveredAt: number;
  lastAdaptationContent: string;
  showModalityChoice: boolean;
  /** Shown after 👍/👎 timeout when CV reads happy — invite next question. */
  showCvHappyFollowUp: boolean;
  /** Modality picker opened from CV timeout (custom prompt). */
  cvModalityChoiceFromTimeout: boolean;
  triedModalities: TeachingModality[];
  currentModality: TeachingModality | null;
}

export class TutorComprehensionFlow {
  phase: FlowPhase = "idle";
  showFeedbackBar = false;
  awaitingContentGate: ContentGate = "none";
  cvHappyMode = false;
  adaptationRound: AdaptationRound = 0;
  adaptationStepsTaken = 0;
  adaptationOrder: AdaptationRound[] = [1, 2, 3, 4, 5];
  /** Gap 7 — modalities already shown this question (skip on 👎). */
  triedRounds = new Set<AdaptationRound>();
  blockInput = false;
  showBreathing = false;
  imageViewActive = false;
  mcqActive = false;
  mcqPhase: "recall" | "teaching" | "appreciation" = "recall";
  mcqQuestions: StepMcq[] = [];
  mcqIndex = 0;
  cvPaused = false;
  feedbackStartedAt = 0;
  contentDeliveredAt = 0;
  lastAdaptationContent = "";
  showModalityChoice = false;
  showCvHappyFollowUp = false;
  cvModalityChoiceFromTimeout = false;
  triedModalitiesSet = new Set<TeachingModality>();
  currentModality: TeachingModality | null = null;

  get triedModalities(): TeachingModality[] {
    return [...this.triedModalitiesSet];
  }

  snapshot(): FlowSnapshot {
    return {
      phase: this.phase,
      showFeedbackBar: this.showFeedbackBar,
      showPopup: this.showFeedbackBar,
      awaitingContentGate: this.awaitingContentGate,
      cvHappyMode: this.cvHappyMode,
      adaptationRound: this.adaptationRound,
      adaptationStepsTaken: this.adaptationStepsTaken,
      blockInput: this.blockInput,
      showBreathing: this.showBreathing,
      imageViewActive: this.imageViewActive,
      mcqActive: this.mcqActive,
      mcqPhase: this.mcqPhase,
      mcqQuestions: this.mcqQuestions,
      mcqIndex: this.mcqIndex,
      cvPaused: this.cvPaused,
      feedbackElapsedMs: this.feedbackStartedAt ? Date.now() - this.feedbackStartedAt : 0,
      contentDeliveredAt: this.contentDeliveredAt,
      lastAdaptationContent: this.lastAdaptationContent,
      showModalityChoice: this.showModalityChoice,
      showCvHappyFollowUp: this.showCvHappyFollowUp,
      cvModalityChoiceFromTimeout: this.cvModalityChoiceFromTimeout,
      triedModalities: this.triedModalities,
      currentModality: this.currentModality,
    };
  }

  clearCvFollowUp() {
    this.showCvHappyFollowUp = false;
    this.cvModalityChoiceFromTimeout = false;
  }

  setAdaptationOrder(order: AdaptationRound[]) {
    const valid = order.filter((n) => n >= 1 && n <= 5);
    const seen = new Set<AdaptationRound>();
    const merged: AdaptationRound[] = [];
    for (const n of valid) {
      if (!seen.has(n)) {
        seen.add(n);
        merged.push(n);
      }
    }
    for (const n of [1, 2, 3, 4, 5] as AdaptationRound[]) {
      if (!seen.has(n)) merged.push(n);
    }
    this.adaptationOrder = merged.length ? merged : [1, 2, 3, 4, 5];
  }

  markModalityTried(m: TeachingModality) {
    this.triedModalitiesSet.add(m);
    this.currentModality = m;
  }

  openModalityChoice(fromTimeout = false) {
    this.showFeedbackBar = false;
    this.showCvHappyFollowUp = false;
    this.showModalityChoice = true;
    this.cvModalityChoiceFromTimeout = fromTimeout;
    this.feedbackStartedAt = 0;
  }

  closeModalityChoice() {
    this.showModalityChoice = false;
    this.cvModalityChoiceFromTimeout = false;
  }

  openCvHappyFollowUp() {
    this.showFeedbackBar = false;
    this.showModalityChoice = false;
    this.cvModalityChoiceFromTimeout = false;
    this.showCvHappyFollowUp = true;
    this.phase = "idle";
    this.feedbackStartedAt = 0;
  }

  openCvDistressedFollowUp() {
    this.openModalityChoice(true);
  }

  dismissForNextQuestion() {
    this.showModalityChoice = false;
    this.clearCvFollowUp();
    this.showFeedbackBar = false;
    this.phase = "idle";
    this.adaptationRound = 0;
    this.adaptationStepsTaken = 0;
    this.triedModalitiesSet.clear();
    this.currentModality = null;
    this.showBreathing = false;
    this.cvPaused = false;
  }

  /** Text answer delivered — show 👍/👎 immediately (doc: no scroll/popup gate). */
  onContentDelivered(gate: "scroll" | ContentGate = "scroll") {
    if (this.mcqActive) return;
    this.contentDeliveredAt = Date.now();
    this.awaitingContentGate = gate === "scroll" ? "none" : gate;
    if (gate === "scroll") {
      this.activateFeedbackBar();
    } else {
      this.showFeedbackBar = false;
      this.phase = "idle";
      this.feedbackStartedAt = 0;
    }
  }

  /** Show non-blocking 👍/👎 bar (never blocks typing). */
  activateFeedbackBar() {
    if (this.mcqActive) return;
    this.awaitingContentGate = "none";
    this.phase = "feedback";
    this.showFeedbackBar = true;
    this.cvHappyMode = false;
    this.blockInput = false;
    this.feedbackStartedAt = Date.now();
  }

  dismissFeedbackBar() {
    this.showFeedbackBar = false;
    this.phase = "idle";
    this.cvHappyMode = false;
    this.feedbackStartedAt = 0;
  }

  onAssistantAnswer() {
    this.onContentDelivered("scroll");
  }

  onStudentQuestion() {
    this.phase = "idle";
    this.showFeedbackBar = false;
    this.awaitingContentGate = "none";
    this.cvHappyMode = false;
    this.adaptationRound = 0;
    this.adaptationStepsTaken = 0;
    this.triedRounds.clear();
    this.triedModalitiesSet.clear();
    this.currentModality = null;
    this.showModalityChoice = false;
    this.clearCvFollowUp();
    this.blockInput = false;
    this.showBreathing = false;
    this.imageViewActive = false;
    this.mcqActive = false;
    this.mcqPhase = "recall";
    this.mcqQuestions = [];
    this.mcqIndex = 0;
    this.cvPaused = false;
    this.feedbackStartedAt = 0;
    this.lastAdaptationContent = "";
  }

  onAttemptSendWhileBlocked() {
    if (this.mcqActive || this.showBreathing || this.imageViewActive) return true;
    return this.blockInput;
  }

  onCvHappyDuringFeedback() {
    if (this.phase !== "feedback" || !this.showFeedbackBar) return;
    this.cvHappyMode = true;
  }

  /** 👍 — student understood; unlock chat for next question. */
  onThumbsUp(pauseCv: boolean) {
    this.showFeedbackBar = false;
    this.showModalityChoice = false;
    this.clearCvFollowUp();
    this.awaitingContentGate = "none";
    this.cvHappyMode = false;
    this.blockInput = false;
    this.phase = "idle";
    this.feedbackStartedAt = 0;
    this.adaptationRound = 0;
    this.adaptationStepsTaken = 0;
    if (pauseCv) this.cvPaused = true;
  }

  closeFeedbackForCelebrationQuiz() {
    this.showFeedbackBar = false;
    this.awaitingContentGate = "none";
    this.cvHappyMode = false;
    this.feedbackStartedAt = 0;
    this.cvPaused = true;
  }

  onAppreciationMcqsComplete() {
    this.mcqActive = false;
    this.mcqQuestions = [];
    this.mcqIndex = 0;
    this.mcqPhase = "recall";
    this.adaptationRound = 0;
    this.adaptationStepsTaken = 0;
    this.blockInput = false;
    this.phase = "idle";
    this.cvPaused = true;
  }

  /** 👎 or camera-driven adapt — returns next untried ladder round. */
  onNeedAdaptation(): AdaptationRound | null {
    for (const round of this.adaptationOrder) {
      if (this.triedRounds.has(round)) continue;
      this.triedRounds.add(round);
      this.adaptationStepsTaken = this.triedRounds.size;
      this.adaptationRound = round;
      this.showFeedbackBar = false;
      this.awaitingContentGate = "none";
      this.cvHappyMode = false;
      this.feedbackStartedAt = 0;
      return round;
    }
    return null;
  }

  onAdaptationContent(content: string) {
    this.lastAdaptationContent = content;
  }

  onLadderExhausted() {
    this.showFeedbackBar = false;
    this.awaitingContentGate = "none";
    this.cvHappyMode = false;
    this.blockInput = false;
    this.showBreathing = false;
    this.imageViewActive = false;
    this.mcqActive = false;
    this.mcqPhase = "recall";
    this.phase = "idle";
    this.feedbackStartedAt = 0;
    this.adaptationRound = 0;
    this.adaptationStepsTaken = 0;
    this.triedRounds.clear();
    this.cvPaused = false;
  }

  onAdaptationComplete(gate: "scroll" | ContentGate = "scroll") {
    if (this.mcqActive || this.showBreathing) return;
    this.onContentDelivered(gate);
  }

  onBreathingStart() {
    this.showBreathing = true;
    this.showFeedbackBar = false;
    this.blockInput = true;
    this.phase = "breathing";
  }

  onBreathingComplete() {
    this.showBreathing = false;
    this.onLadderExhausted();
  }

  onImageViewStart() {
    this.imageViewActive = true;
    this.awaitingContentGate = "image";
    this.showFeedbackBar = false;
    this.blockInput = true;
    this.contentDeliveredAt = Date.now();
  }

  onImageViewEnd() {
    this.imageViewActive = false;
    this.blockInput = false;
  }

  onMcqsLoaded(questions: StepMcq[], phase: "recall" | "teaching" | "appreciation" = "recall") {
    this.mcqQuestions = questions;
    this.mcqIndex = 0;
    this.mcqPhase = phase;
    this.mcqActive = questions.length > 0;
    this.showFeedbackBar = false;
    this.blockInput = true;
    this.phase = "mcq";
  }

  onTeachingMcqsLoaded(questions: StepMcq[]) {
    this.onMcqsLoaded(questions, "teaching");
  }

  onMcqAnswered(correct: boolean): "next" | "done" | "celebrate" {
    if (correct && this.mcqIndex < this.mcqQuestions.length - 1) {
      this.mcqIndex += 1;
      return "next";
    }
    if (this.mcqIndex >= this.mcqQuestions.length - 1) {
      if (this.mcqPhase === "appreciation") {
        this.onAppreciationMcqsComplete();
        return "celebrate";
      }
      this.mcqActive = false;
      this.mcqQuestions = [];
      this.mcqIndex = 0;
      this.blockInput = false;
      this.activateFeedbackBar();
      return "done";
    }
    return "next";
  }
}
