import type { AIChatMessage } from "@/context/AIContext";

/** Keep only identities from the currently retained conversation, never history. */
export function getAIChatAssistantMessageIds(
  messages: readonly Pick<AIChatMessage, "id" | "role">[],
): ReadonlySet<string> {
  return new Set(messages.filter((message) => message.role === "assistant").map((message) => message.id));
}

export function countNewAIChatAssistantMessages(
  currentIds: ReadonlySet<string>,
  previousIds: ReadonlySet<string>,
): number {
  let count = 0;
  for (const id of currentIds) {
    if (!previousIds.has(id)) count++;
  }
  return count;
}
