/** Child-led adaptive multimodal chat (v2) types */

export type Modality = "text" | "voice" | "image" | "steps";
export type ThumbsFeedback = "up" | "down";

export const ALL_MODALITIES: Modality[] = ["text", "voice", "image", "steps"];

export const MODALITY_LABELS: Record<Modality, { en: string; ur: string; emoji: string }> = {
  text: { en: "Text explanation", ur: "تحریری وضاحت", emoji: "📝" },
  voice: { en: "Voice explanation", ur: "آواز میں سمجھائیں", emoji: "🔊" },
  image: { en: "Picture / visual", ur: "تصویر / visual", emoji: "🎨" },
  steps: { en: "Step by step", ur: "قدم بہ قدم", emoji: "🪜" },
};

export interface LearningPreferences {
  setup_complete: boolean;
  modality_order: Modality[];
  modality_scores: Record<string, number>;
  effective_order: Modality[];
}

export interface ChildLedFeedbackPayload {
  question: string;
  subject: string;
  modality: Modality;
  feedback: ThumbsFeedback;
  child_selected?: boolean;
  media_signal?: "positive" | "negative" | null;
  skipped?: boolean;
  break_after_fail?: boolean;
}

export function preferredFormatForModality(mod: Modality): string {
  if (mod === "steps") return "step_by_step_flowchart";
  return "normal";
}
