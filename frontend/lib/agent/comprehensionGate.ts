import type { SendMessageResponse } from "@/lib/api/client";

/**
 * Enable 👍/👎 child-led feedback when the tutor answer is a learning question
 * for this subject — textbook RAG hit OR subject-related (e.g. long division in Maths).
 * Skip for off-topic chit-chat ("what's the weather?").
 */
export function shouldEnableChildLedFeedback(reply: SendMessageResponse): boolean {
  if (reply.query_related_to_subject === false) return false;
  if (reply.is_relevant === true) return true;
  if (reply.query_related_to_subject === true) return true;
  if (reply.assistant_message?.skip_tutor) return false;
  return false;
}

/** @deprecated use shouldEnableChildLedFeedback */
export function shouldShowComprehensionPopup(reply: SendMessageResponse): boolean {
  return shouldEnableChildLedFeedback(reply);
}
