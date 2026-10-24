import assert from "node:assert/strict";
import test from "node:test";
import { AiChatService } from "../../../server/services/ai-chat.service";
import { notFound } from "../../../server/http/errors";

// Pending service-boundary assertion, not a PostgreSQL/HTTP proof or a model test.
// Failed in the 2026-10-24 isolated WSL audit run; excluded from the normal suite.
test("Alice cannot use Bob's conversation selector to read or append history", async () => {
  let historyReads = 0;
  let messageWrites = 0;
  type Options = ConstructorParameters<typeof AiChatService>[0];
  const service = new AiChatService({
    storage: {
      createConversation: async () => "audit-alice-conversation",
      assertConversationOwner: async (conversationId: string, ownerUserId: string) => {
        const owners = new Map([
          ["audit-alice-conversation", "audit-alice-id"],
          ["audit-bob-conversation", "audit-bob-id"],
        ]);
        if (owners.get(conversationId) !== ownerUserId) throw notFound("Conversation not found.");
      },
      getConversationMessages: async () => {
        historyReads += 1;
        return [{ role: "user", content: "BOB-DUMMY-SENTINEL" }];
      },
      saveConversationMessage: async () => { messageWrites += 1; },
      createAuditLog: async () => undefined,
    } as unknown as Options["storage"],
    categoryStatsService: {
      resolveCountSummary: async () => ({ summary: "Inert audit reply", processing: false, stats: [] }),
    } as unknown as Options["categoryStatsService"],
    withAiCircuit: async <T>(operation: () => Promise<T>) => operation(),
    ollamaChat: async () => { assert.fail("No model call is allowed in this fixture."); },
  });
  let denied = false;
  try {
    const result = await service.handleChat({
      userId: "audit-alice-id", username: "audit.alice", existingConversationId: "audit-bob-conversation",
      message: "audit count", aiTimeoutMs: 100,
    });
    denied = result.statusCode === 403 || result.statusCode === 404;
  } catch (error) {
    const status = (error as { statusCode?: number; status?: number }).statusCode
      ?? (error as { status?: number }).status;
    assert.ok(status === 403 || status === 404, "Only an explicit authorization denial satisfies this invariant.");
    denied = true;
  }
  assert.equal(denied, true);
  assert.equal(historyReads, 0);
  assert.equal(messageWrites, 0);
});
