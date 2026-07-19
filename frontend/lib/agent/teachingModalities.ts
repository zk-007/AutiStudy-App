import type { AdaptationRound } from "@/lib/agent/TutorComprehensionFlow";
import type { LearnerProfile } from "@/lib/api/client";

/** The four teaching formats (+ breathing as last resort). */
export type TeachingModality =
  | "simple_text"
  | "step_by_step"
  | "image"
  | "read_aloud";

export type ModalityChoice = TeachingModality | "breathing" | "next_question";

/** Help formats offered after 👎 (simple text is separate). */
export const HELP_MODALITIES: TeachingModality[] = [
  "step_by_step",
  "image",
  "read_aloud",
];

export const MODALITY_LABELS: Record<ModalityChoice, string> = {
  simple_text: "Simple text",
  step_by_step: "Step-by-step explanation",
  image: "Picture / visual",
  read_aloud: "Read aloud (voice)",
  breathing: "Short breathing break",
  next_question: "Move to next question",
};

export function ladderRoundToModality(round: AdaptationRound): TeachingModality | null {
  if (round === 1) return "step_by_step";
  if (round === 2) return "read_aloud";
  if (round === 3) return "image";
  return null;
}

/** Onboarding profile when nothing learned yet for this subject. */
export function profilePreferredModality(
  profile: LearnerProfile | null,
): TeachingModality {
  if (!profile?.onboarding_completed) return "simple_text";
  if (profile.learning_style === "visual") return "image";
  if (profile.learning_style === "audio") return "read_aloud";
  if (profile.explanation_style === "step_by_step") return "step_by_step";
  return "simple_text";
}

/**
 * ONE format for the first delivery — learned preference wins over onboarding.
 */
export function resolvePreferredModality(
  profile: LearnerProfile | null,
  learned: TeachingModality | null | undefined,
): TeachingModality {
  if (learned) return learned;
  return profilePreferredModality(profile);
}

export function modalityToBackendKey(m: TeachingModality): string {
  return m;
}

export function parsePreferredModality(raw: unknown): TeachingModality | null {
  if (raw === "simple_text" || raw === "step_by_step" || raw === "image" || raw === "read_aloud") {
    return raw;
  }
  return null;
}

/** What the student can pick after 👎 (only formats not yet tried). */
export function buildModalityChoices(
  tried: Set<TeachingModality>,
): ModalityChoice[] {
  const choices: ModalityChoice[] = [];
  if (!tried.has("simple_text")) choices.push("simple_text");
  if (!tried.has("read_aloud")) choices.push("read_aloud");
  if (!tried.has("step_by_step")) choices.push("step_by_step");
  if (!tried.has("image")) choices.push("image");
  const allHelpTried = HELP_MODALITIES.every((m) => tried.has(m));
  if (allHelpTried && tried.has("step_by_step")) {
    choices.push("breathing");
  }
  choices.push("next_question");
  return choices;
}
