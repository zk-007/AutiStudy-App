/**
 * Types for the backend ReAct Media Agent (/api/agent/decide).
 */

import type { TutorAction } from "./types";

export type MediaAgentTool =
  | "do_nothing"
  | "simplify_text"
  | "generate_visual"
  | "speak_aloud"
  | "explain_steps"
  | "use_analogy"
  | "check_prerequisite"
  | "notify_parent";

export interface MediaAgentActionData {
  simplified_explanation?: string;
  steps?: string[];
  analogy?: string;
  check_question?: string;
  prerequisite?: string;
  visual_description?: string;
  topic?: string;
}

export interface MediaAgentDecision {
  emotion: string;
  confidence: number;
  understood: boolean;
  description: string;
  plan?: string;
  tool_called: MediaAgentTool;
  tool_emoji?: string;
  reasoning?: string;
  modality?: string;
  action_data?: MediaAgentActionData;
  tools_used_this_session?: string[];
  duration_ms?: number;
}

/** Payload passed from useAdaptiveTutorAgent → chat page executor. */
export interface AgentActionPayload {
  source: "media_agent" | "local_fallback";
  tool?: MediaAgentTool;
  content?: string;
  actionData?: MediaAgentActionData;
  reasoning?: string;
  plan?: string;
  localAction?: TutorAction;
}

export const MEDIA_TOOL_EMOJI: Record<MediaAgentTool, string> = {
  do_nothing:          "✅",
  simplify_text:       "📝",
  generate_visual:     "🖼️",
  speak_aloud:           "🔊",
  explain_steps:         "🪜",
  use_analogy:           "🍕",
  check_prerequisite:    "🔍",
  notify_parent:         "👨‍👩‍👧",
};

export const MEDIA_TOOL_LABEL: Record<MediaAgentTool, string> = {
  do_nothing:          "All good",
  simplify_text:       "Simplifying…",
  generate_visual:     "Adding visual…",
  speak_aloud:           "Reading aloud…",
  explain_steps:         "Step by step…",
  use_analogy:           "Using an analogy…",
  check_prerequisite:    "Checking basics…",
  notify_parent:         "Suggesting help…",
};
