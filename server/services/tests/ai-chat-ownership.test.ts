import assert from "node:assert/strict";
import test from "node:test";
import { HttpError, notFound } from "../../http/errors";
import { AiChatService } from "../ai-chat.service";

type Options = ConstructorParameters<typeof AiChatService>[0];

function harness(branch: "count-summary" | "model") {
  const owners = new Map([["alice-conversation", "alice-id"], ["bob-conversation", "bob-id"]]);
  const calls: Array<{ action: string; conversationId?: string; owner?: string }> = [];
  const saved: Array<{ conversationId: string; owner: string; role: string; content: string }> = [];
  const check = (conversationId: string, owner: string) => {
    if (owners.get(conversationId) !== owner) throw notFound("Conversation not found.");
  };
  const service = new AiChatService({
    storage: {
      createConversation: async (owner: string) => {
        owners.set("new-conversation", owner);
        calls.push({ action: "create", owner });
        return "new-conversation";
      },
      assertConversationOwner: async (conversationId: string, owner: string) => {
        calls.push({ action: "authorize", conversationId, owner });
        check(conversationId, owner);
      },
      getConversationMessages: async (conversationId: string, owner: string) => {
        calls.push({ action: "history", conversationId, owner });
        check(conversationId, owner);
        return [{ role: "assistant", content: "Alice's private context" }];
      },
      searchGlobalDataRows: async () => {
        calls.push({ action: "search" });
        return { rows: [], total: 0 };
      },
      saveConversationMessage: async (conversationId: string, owner: string, role: string, content: string) => {
        check(conversationId, owner);
        saved.push({ conversationId, owner, role, content });
      },
      createAuditLog: async () => { calls.push({ action: "audit" }); },
    } as unknown as Options["storage"],
    categoryStatsService: {
      resolveCountSummary: async () => {
        calls.push({ action: "summary" });
        return branch === "count-summary"
          ? { summary: "Jumlah: 2", processing: false, stats: [] } : null;
      },
    } as unknown as Options["categoryStatsService"],
    withAiCircuit: async <T>(operation: () => Promise<T>) => operation(),
    ollamaChat: async (messages) => {
      calls.push({ action: "model" });
      assert.ok(messages.some((message) => message.content === "Alice's private context"));
      return "Model reply";
    },
  });
  return { service, owners, calls, saved };
}

for (const branch of ["count-summary", "model"] as const) {
  for (const existingConversationId of [undefined, "alice-conversation"]) {
    test(`AI ${branch} permits the owner of ${existingConversationId ? "an existing" : "a new"} conversation`, async () => {
      const { service, owners, calls, saved } = harness(branch);
      const result = await service.handleChat({
        message: "owner question", userId: "alice-id", username: "alice", aiTimeoutMs: 100,
        ...(existingConversationId ? { existingConversationId } : {}),
      });
      const conversationId = existingConversationId || "new-conversation";
      assert.equal(result.statusCode, 200);
      assert.equal(result.body.conversationId, conversationId);
      assert.equal(owners.get(conversationId), "alice-id");
      assert.deepEqual(calls.filter((call) => ["authorize", "history"].includes(call.action)), [
        { action: "authorize", conversationId, owner: "alice-id" },
        { action: "history", conversationId, owner: "alice-id" },
      ]);
      assert.ok(calls.findIndex((call) => call.action === "authorize") < calls.findIndex((call) => call.action === "summary"));
      assert.equal(calls.filter((call) => call.action === "model").length, branch === "model" ? 1 : 0);
      assert.deepEqual(saved, [
        { conversationId, owner: "alice-id", role: "user", content: "owner question" },
        { conversationId, owner: "alice-id", role: "assistant", content: result.body.reply },
      ]);
    });
  }

  for (const conversationId of ["bob-conversation", "missing-conversation"]) {
    test(`AI ${branch} denies ${conversationId} before history, summary, retrieval, model or writes`, async () => {
      const { service, calls, saved } = harness(branch);
      await assert.rejects(service.handleChat({
        message: "owner question", userId: "alice-id", username: "alice", existingConversationId: conversationId,
        aiTimeoutMs: 100,
      }), (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.statusCode, 404);
        assert.equal(error.message, "Conversation not found.");
        return true;
      });
      assert.deepEqual(calls, [{ action: "authorize", conversationId, owner: "alice-id" }]);
      assert.deepEqual(saved, []);
    });
  }

  test(`AI ${branch} preserves renamed account ownership and denies reuse of its old username`, async () => {
    const { service, calls, saved } = harness(branch);
    const allowed = await service.handleChat({
      userId: "alice-id", username: "alice.renamed", existingConversationId: "alice-conversation",
      message: "after rename", aiTimeoutMs: 100,
    });
    assert.equal(allowed.statusCode, 200);
    assert.ok(saved.every((entry) => entry.owner === "alice-id"));
    calls.length = 0;
    const before = saved.length;
    await assert.rejects(service.handleChat({
      userId: "replacement-id", username: "alice", existingConversationId: "alice-conversation",
      message: "reused username", aiTimeoutMs: 100,
    }), (error: unknown) => error instanceof HttpError && error.statusCode === 404);
    assert.deepEqual(calls, [{ action: "authorize", conversationId: "alice-conversation", owner: "replacement-id" }]);
    assert.equal(saved.length, before);
  });

  test(`AI ${branch} rejects missing account identity before any storage or AI work`, async () => {
    const { service, calls, saved } = harness(branch);
    for (const userId of [undefined, "", "   "]) {
      await assert.rejects(service.handleChat({
        userId: userId as unknown as string, username: "alice", message: "question", aiTimeoutMs: 100,
      }), (error: unknown) => error instanceof HttpError && error.statusCode === 401);
    }
    assert.deepEqual(calls, []);
    assert.deepEqual(saved, []);
  });
}
