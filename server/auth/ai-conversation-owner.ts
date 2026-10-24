import { unauthorized } from "../http/errors";

export function requireAiConversationOwnerId(userId: unknown): string {
  if (typeof userId !== "string" || !userId.trim()) {
    throw unauthorized();
  }
  return userId;
}

export function buildAiConversationOwnerKey(userId: string): string {
  // Existing username-owned rows deliberately fail closed. Usernames cannot
  // contain ':'; never guess an immutable owner for legacy conversation history.
  return `account:${requireAiConversationOwnerId(userId)}`;
}
