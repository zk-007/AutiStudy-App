import type { SendMessageResponse } from "@/lib/api/client";

/** Show "Did you get it?" only when the tutor answer is textbook-grounded (RAG). */
export function shouldShowComprehensionPopup(reply: SendMessageResponse): boolean {
  if (reply.assistant_message?.skip_tutor) return false;
  return reply.is_relevant === true;
}
