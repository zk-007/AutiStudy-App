/**
 * TutorComprehensionFlow — popup-gated adaptation ladder state.
 */

export type FlowPhase = "idle" | "popup" | "breathing" | "mcq";

export type AdaptationRound = 0 | 1 | 2 | 3 | 4 | 5;

export type PopupGate = "none" | "scroll" | "tts" | "image";

export const POPUP_WAIT_MS = 60_000;
export const TEXT_READ_MS = 30_000; // 30 seconds to read text answers
export const IMAGE_VIEW_MS = 60_000; // 1 minute to study an image

export const POPUP_PROMPTS = [
  "Did you get it? 😊",
  "Quick check — does that make sense? 🌟",
  "Are you good with that? Tap yes or not yet! ✨",
  "Just checking in — got it? 👍",
];

export interface StepMcq {
  step_label: string;
  question: string;
  options: string[];
  correct_index: number;
  wrong_hint?: string;
}

export interface FlowSnapshot {
  phase: FlowPhase;
  showPopup: boolean;
  pendingPopup: boolean;
  popupGate: PopupGate;
  popupDancing: boolean;
  typingBlocked: boolean;
  popupPromptIndex: number;
  adaptationRound: AdaptationRound;
  blockInput: boolean;
  showBreathing: boolean;
  imageViewActive: boolean;
  mcqActive: boolean;
  mcqPhase: "recall" | "teaching" | "appreciation";
  mcqQuestions: StepMcq[];
  mcqIndex: number;
  cvPaused: boolean;
  popupElapsedMs: number;
  contentDeliveredAt: number;
  lastAdaptationContent: string;
}

export class TutorComprehensionFlow {
  phase: FlowPhase = "idle";
  showPopup = false;
  pendingPopup = false;
  popupGate: PopupGate = "none";
  popupDancing = false;
  typingBlocked = false;
  popupPromptIndex = 0;
  adaptationRound: AdaptationRound = 0;
  blockInput = false;
  showBreathing = false;
  imageViewActive = false;
  mcqActive = false;
  mcqPhase: "recall" | "teaching" | "appreciation" = "recall";
  mcqQuestions: StepMcq[] = [];
  mcqIndex = 0;
  cvPaused = false;
  popupStartedAt = 0;
  contentDeliveredAt = 0;
  lastAdaptationContent = "";

  snapshot(): FlowSnapshot {
    return {
      phase: this.phase,
      showPopup: this.showPopup,
      pendingPopup: this.pendingPopup,
      popupGate: this.popupGate,
      popupDancing: this.popupDancing,
      typingBlocked: this.typingBlocked,
      popupPromptIndex: this.popupPromptIndex,
      adaptationRound: this.adaptationRound,
      blockInput: this.blockInput,
      showBreathing: this.showBreathing,
      imageViewActive: this.imageViewActive,
      mcqActive: this.mcqActive,
      mcqPhase: this.mcqPhase,
      mcqQuestions: this.mcqQuestions,
      mcqIndex: this.mcqIndex,
      cvPaused: this.cvPaused,
      popupElapsedMs: this.popupStartedAt ? Date.now() - this.popupStartedAt : 0,
      contentDeliveredAt: this.contentDeliveredAt,
      lastAdaptationContent: this.lastAdaptationContent,
    };
  }

  /** Content delivered — wait for gate before showing popup / starting 1-min CV. */
  onContentDelivered(gate: PopupGate) {
    if (this.mcqActive) return;
    this.pendingPopup = true;
    this.popupGate = gate;
    this.showPopup = false;
    this.popupDancing = false;
    this.typingBlocked = false;
    this.blockInput = false;
    this.popupStartedAt = 0;
    this.contentDeliveredAt = Date.now();
    this.phase = "idle";
  }

  /** Show popup and start the 1-minute CV window. */
  activatePopup() {
    if (this.mcqActive) return;
    this.pendingPopup = false;
    this.popupGate = "none";
    this.phase = "popup";
    this.showPopup = true;
    this.popupDancing = false;
    this.typingBlocked = false;
    this.blockInput = true;
    this.popupStartedAt = Date.now();
  }

  /** @deprecated use onContentDelivered('scroll') */
  onAssistantAnswer() {
    this.onContentDelivered("scroll");
  }

  /** Student sent a new question — full reset. */
  onStudentQuestion() {
    this.phase = "idle";
    this.showPopup = false;
    this.pendingPopup = false;
    this.popupGate = "none";
    this.popupDancing = false;
    this.typingBlocked = false;
    this.adaptationRound = 0;
    this.blockInput = false;
    this.showBreathing = false;
    this.imageViewActive = false;
    this.mcqActive = false;
    this.mcqPhase = "recall";
    this.mcqQuestions = [];
    this.mcqIndex = 0;
    this.cvPaused = false;
    this.popupStartedAt = 0;
    this.lastAdaptationContent = "";
  }

  onAttemptSendWhileBlocked() {
    if (this.showPopup) {
      this.typingBlocked = true;
      return true;
    }
    if (this.mcqActive || this.showBreathing) return true;
    return this.blockInput;
  }

  /** Gentle prompt rephrase when clearly happy — no visual dance. */
  onCvHappyDuringWait() {
    if (this.phase !== "popup" || !this.showPopup) return;
    this.popupPromptIndex = (this.popupPromptIndex + 1) % POPUP_PROMPTS.length;
  }

  clearPopupEffects() {
    this.popupDancing = false;
    this.typingBlocked = false;
  }

  /** Popup Yes clicked — normal close (use closePopupForCelebrationQuiz when quiz follows). */
  onPopupYes(pauseCv: boolean) {
    this.showPopup = false;
    this.pendingPopup = false;
    this.popupGate = "none";
    this.popupDancing = false;
    this.typingBlocked = false;
    this.blockInput = false;
    this.phase = "idle";
    this.popupStartedAt = 0;
    this.adaptationRound = 0;
    if (pauseCv) this.cvPaused = true;
  }

  /** Yes at step 4+ — close popup but keep input blocked for celebration quiz. */
  closePopupForCelebrationQuiz() {
    this.showPopup = false;
    this.pendingPopup = false;
    this.popupGate = "none";
    this.popupDancing = false;
    this.typingBlocked = false;
    this.popupStartedAt = 0;
    this.cvPaused = true;
  }

  onAppreciationMcqsComplete() {
    this.mcqActive = false;
    this.mcqQuestions = [];
    this.mcqIndex = 0;
    this.mcqPhase = "recall";
    this.adaptationRound = 0;
    this.blockInput = false;
    this.phase = "idle";
    this.cvPaused = true;
  }

  /** Popup No or auto-adapt — returns next round to run. */
  onNeedAdaptation(): AdaptationRound | null {
    if (this.adaptationRound >= 5) return null;
    const next = (this.adaptationRound + 1) as AdaptationRound;
    this.adaptationRound = next;
    this.showPopup = false;
    this.pendingPopup = false;
    this.popupGate = "none";
    this.popupDancing = false;
    this.typingBlocked = false;
    this.popupStartedAt = 0;
    return next;
  }

  onAdaptationContent(content: string) {
    this.lastAdaptationContent = content;
  }

  /** All 5 help steps used — unlock chat and reset popup state. */
  onLadderExhausted() {
    this.showPopup = false;
    this.pendingPopup = false;
    this.popupGate = "none";
    this.popupDancing = false;
    this.typingBlocked = false;
    this.blockInput = false;
    this.showBreathing = false;
    this.imageViewActive = false;
    this.mcqActive = false;
    this.mcqPhase = "recall";
    this.phase = "idle";
    this.popupStartedAt = 0;
    this.cvPaused = false;
  }

  /** After text/voice/image adaptation — wait for gate, then popup. */
  onAdaptationComplete(gate: PopupGate = "scroll") {
    if (this.mcqActive || this.showBreathing) return;
    this.onContentDelivered(gate);
  }

  onBreathingStart() {
    this.showBreathing = true;
    this.showPopup = false;
    this.blockInput = true;
    this.phase = "breathing";
  }

  onBreathingComplete() {
    this.showBreathing = false;
    this.activatePopup();
  }

  onImageViewStart() {
    this.imageViewActive = true;
    this.pendingPopup = false;
    this.popupGate = "none";
    this.showPopup = false;
    this.blockInput = true;
    this.contentDeliveredAt = Date.now();
  }

  onImageViewEnd() {
    this.imageViewActive = false;
  }

  onMcqsLoaded(questions: StepMcq[], phase: "recall" | "teaching" | "appreciation" = "recall") {
    this.mcqQuestions = questions;
    this.mcqIndex = 0;
    this.mcqPhase = phase;
    this.mcqActive = questions.length > 0;
    this.showPopup = false;
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
      this.activatePopup();
      return "done";
    }
    return "next";
  }

  popupTimedOut(): boolean {
    if (!this.popupStartedAt || !this.showPopup) return false;
    return Date.now() - this.popupStartedAt >= POPUP_WAIT_MS;
  }
}
