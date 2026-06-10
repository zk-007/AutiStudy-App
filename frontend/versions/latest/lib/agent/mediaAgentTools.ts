/**
 * Helpers to turn Media Agent tool responses into chat content + side effects.
 */

import type { TutorAction } from "./types";
import type { AgentActionPayload, MediaAgentActionData, MediaAgentTool } from "./mediaAgentTypes";

export interface ToolSideEffects {
  triggerImage: boolean;
  triggerVoice: boolean;
}

export function toolSideEffects(tool: MediaAgentTool | undefined): ToolSideEffects {
  return {
    triggerImage: tool === "generate_visual",
    triggerVoice: tool === "speak_aloud",
  };
}

export function tutorActionSideEffects(action: TutorAction): ToolSideEffects {
  return {
    triggerImage: action === "SHOW_VISUAL_EXPLANATION",
    triggerVoice: action === "USE_VOICE_AID",
  };
}

export function extractContentFromMediaTool(
  tool: MediaAgentTool,
  actionData: MediaAgentActionData = {}
): string | undefined {
  switch (tool) {
    case "do_nothing":
      return undefined;
    case "simplify_text":
      return actionData.simplified_explanation;
    case "use_analogy":
      return actionData.analogy;
    case "explain_steps":
      if (actionData.steps?.length) {
        return actionData.steps
          .map((s, i) => `**Step ${i + 1}:** ${s}`)
          .join("\n\n");
      }
      return undefined;
    case "check_prerequisite": {
      const parts: string[] = [];
      if (actionData.check_question) parts.push(actionData.check_question);
      if (actionData.prerequisite) {
        parts.push(`_(This builds on: ${actionData.prerequisite})_`);
      }
      return parts.length ? parts.join("\n\n") : undefined;
    }
    case "generate_visual":
      return actionData.visual_description
        ? `Here's a picture to help! 🎨\n\n_${actionData.visual_description}_`
        : "Here's a picture to help explain this! 🎨";
    case "speak_aloud":
      return "Let me read the last answer out loud for you 🔊";
    case "notify_parent":
      return actionData.topic
        ? `You're working really hard on **${actionData.topic}**! 🌟 It might help to ask a grown-up for a quick check-in. We'll keep this here when you're ready.`
        : "You're working really hard! 🌟 It might help to ask a grown-up for a quick check-in. We'll keep this here when you're ready.";
    default:
      return undefined;
  }
}

export function resolveAgentContent(payload: AgentActionPayload): string | undefined {
  if (payload.content) return payload.content;
  if (payload.source === "media_agent" && payload.tool) {
    return extractContentFromMediaTool(payload.tool, payload.actionData);
  }
  return undefined;
}

export function resolveSideEffects(payload: AgentActionPayload): ToolSideEffects {
  if (payload.source === "media_agent") {
    return toolSideEffects(payload.tool);
  }
  if (payload.localAction) {
    return tutorActionSideEffects(payload.localAction);
  }
  return { triggerImage: false, triggerVoice: false };
}
