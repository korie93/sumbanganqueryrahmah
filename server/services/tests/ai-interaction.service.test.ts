import assert from "node:assert/strict";
import test from "node:test";
import type { AiChatService } from "../ai-chat.service";
import { AiInteractionService } from "../ai-interaction.service";
import type { AiSearchService } from "../ai-search.service";
import type { CategoryStatsService } from "../category-stats.service";

type RuntimeSettings = {
  aiEnabled: boolean;
  semanticSearchEnabled: boolean;
  aiTimeoutMs: number;
};

function createAiInteractionHarness(options?: {
  runtimeSettings?: RuntimeSettings;
  countSummary?: {
    processing: boolean;
    summary: string;
    stats: Array<Record<string, unknown>>;
  } | null;
  searchResult?: {
    statusCode: number;
    body: Record<string, unknown>;
    audit?: Record<string, unknown>;
  };
  chatResult?: {
    statusCode: number;
    body: Record<string, unknown>;
  };
}) {
  const searchCalls: Array<Record<string, unknown>> = [];
  const countSummaryCalls: Array<Record<string, unknown>> = [];
  const chatCalls: Array<Record<string, unknown>> = [];
  const auditEntries: Array<Record<string, unknown>> = [];

  const aiSearchService = {
    resolveSearchRequest: async (params: Record<string, unknown>) => {
      searchCalls.push(params);
      return options?.searchResult ?? {
        statusCode: 200,
        body: {
          person: { name: "Alice" },
          nearest_branch: null,
          decision: null,
          ai_explanation: "ok",
        },
      };
    },
  } as unknown as AiSearchService;

  const categoryStatsService = {
    resolveCountSummary: async (query: string, timeoutMs: number) => {
      countSummaryCalls.push({ query, timeoutMs });
      return options?.countSummary ?? null;
    },
  } as unknown as CategoryStatsService;

  const aiChatService = {
    handleChat: async (params: Record<string, unknown>) => {
      chatCalls.push(params);
      return options?.chatResult ?? {
        statusCode: 200,
        body: {
          conversationId: "conv-1",
          reply: "Hai",
        },
      };
    },
  } as unknown as AiChatService;

  return {
    service: new AiInteractionService({
      createAuditLog: async (data) => {
        auditEntries.push(data);
        return data;
      },
      getRuntimeSettingsCached: async () => options?.runtimeSettings ?? {
        aiEnabled: true,
        semanticSearchEnabled: true,
        aiTimeoutMs: 6000,
      },
      aiSearchService,
      categoryStatsService,
      aiChatService,
      getOllamaConfig: () => ({
        host: "http://127.0.0.1:11434",
        model: "gemma:2b",
      }),
      defaultAiTimeoutMs: 5500,
    }),
    searchCalls,
    countSummaryCalls,
    chatCalls,
    auditEntries,
  };
}

test("AiInteractionService returns merged runtime config", async () => {
  const { service } = createAiInteractionHarness({
    runtimeSettings: {
      aiEnabled: true,
      semanticSearchEnabled: false,
      aiTimeoutMs: 4321,
    },
  });

  assert.deepEqual(await service.getConfig(), {
    host: "http://127.0.0.1:11434",
    model: "gemma:2b",
    aiEnabled: true,
    semanticSearchEnabled: false,
    aiTimeoutMs: 4321,
  });
});

test("AiInteractionService search rejects blank queries before service execution", async () => {
  const { service, searchCalls, countSummaryCalls } = createAiInteractionHarness();

  const result = await service.search({
    query: "   ",
    userKey: "activity-1",
    username: "user.one",
  });

  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.body, { message: "Query required" });
  assert.equal(searchCalls.length, 0);
  assert.equal(countSummaryCalls.length, 0);
});

test("AiInteractionService search returns count summary without hitting AI search", async () => {
  const { service, searchCalls, countSummaryCalls } = createAiInteractionHarness({
    runtimeSettings: {
      aiEnabled: true,
      semanticSearchEnabled: true,
      aiTimeoutMs: 7000,
    },
    countSummary: {
      processing: false,
      summary: "Jumlah kerajaan: 12",
      stats: [{ key: "kerajaan", total: 12 }],
    },
  });

  const result = await service.search({
    query: "berapa kerajaan",
    userKey: "activity-1",
    username: "user.one",
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, {
    person: null,
    nearest_branch: null,
    decision: null,
    ai_explanation: "Jumlah kerajaan: 12",
    processing: false,
    stats: [{ key: "kerajaan", total: 12 }],
  });
  assert.deepEqual(countSummaryCalls, [{
    query: "berapa kerajaan",
    timeoutMs: 7000,
  }]);
  assert.equal(searchCalls.length, 0);
});

test("AiInteractionService search forwards results and writes audit logs asynchronously", async () => {
  const { service, searchCalls, auditEntries } = createAiInteractionHarness({
    searchResult: {
      statusCode: 202,
      body: {
        person: { name: "Alice" },
        nearest_branch: { name: "Branch A" },
        decision: "Pergi cawangan",
      },
      audit: {
        query: "alice",
        decision: "Pergi cawangan",
      },
    },
  });

  const result = await service.search({
    query: "alice",
    userKey: "activity-1",
    username: "user.one",
  });

  assert.equal(result.statusCode, 202);
  assert.deepEqual(result.body, {
    person: { name: "Alice" },
    nearest_branch: { name: "Branch A" },
    decision: "Pergi cawangan",
  });
  assert.deepEqual(searchCalls, [{
    query: "alice",
    userKey: "activity-1",
    runtimeSettings: {
      semanticSearchEnabled: true,
      aiTimeoutMs: 6000,
    },
  }]);

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(auditEntries, [{
    action: "AI_SEARCH",
    performedBy: "user.one",
    targetResource: "ai_search",
    details: JSON.stringify({
      query: "alice",
      decision: "Pergi cawangan",
    }),
  }]);
});

test("AiInteractionService chat respects disabled AI runtime settings", async () => {
  const { service, chatCalls } = createAiInteractionHarness({
    runtimeSettings: {
      aiEnabled: false,
      semanticSearchEnabled: true,
      aiTimeoutMs: 6000,
    },
  });

  const result = await service.chat({
    message: "hello",
    username: "user.one",
  });

  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, {
    message: "AI assistant is disabled by system settings.",
  });
  assert.equal(chatCalls.length, 0);
});

test("AiInteractionService chat normalizes conversation ids before delegating", async () => {
  const { service, chatCalls } = createAiInteractionHarness();

  const result = await service.chat({
    message: "hello",
    conversationId: 123,
    username: "user.one",
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, {
    conversationId: "conv-1",
    reply: "Hai",
  });
  assert.deepEqual(chatCalls, [{
    message: "hello",
    username: "user.one",
    existingConversationId: "123",
    aiTimeoutMs: 6000,
  }]);
});
