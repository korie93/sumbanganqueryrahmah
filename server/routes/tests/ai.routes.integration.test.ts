import assert from "node:assert/strict";
import test from "node:test";
import { createAiController } from "../../controllers/ai.controller";
import type { AiChatService } from "../../services/ai-chat.service";
import type { AiIndexService } from "../../services/ai-index.service";
import { AiIndexOperationsService } from "../../services/ai-index-operations.service";
import { AiInteractionService } from "../../services/ai-interaction.service";
import type { AiSearchService } from "../../services/ai-search.service";
import type { CategoryStatsService } from "../../services/category-stats.service";
import { registerAiRoutes } from "../ai.routes";
import {
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

type RuntimeSettings = {
  aiEnabled: boolean;
  semanticSearchEnabled: boolean;
  aiTimeoutMs: number;
};

function createAiRouteHarness(options?: {
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
  indexResult?: {
    statusCode: number;
    body: Record<string, unknown>;
  };
  branchImportResult?: {
    statusCode: number;
    body: Record<string, unknown>;
  };
}) {
  const searchCalls: Array<Record<string, unknown>> = [];
  const countSummaryCalls: Array<Record<string, unknown>> = [];
  const chatCalls: Array<Record<string, unknown>> = [];
  const indexCalls: Array<Record<string, unknown>> = [];
  const branchImportCalls: Array<Record<string, unknown>> = [];
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

  const aiIndexService = {
    indexImport: async (params: Record<string, unknown>) => {
      indexCalls.push(params);
      return options?.indexResult ?? {
        statusCode: 200,
        body: {
          success: true,
          processed: 3,
          total: 3,
        },
      };
    },
    importBranches: async (params: Record<string, unknown>) => {
      branchImportCalls.push(params);
      return options?.branchImportResult ?? {
        statusCode: 200,
        body: {
          success: true,
          inserted: 4,
          skipped: 1,
        },
      };
    },
  } as unknown as AiIndexService;

  const aiController = createAiController({
    aiInteractionService: new AiInteractionService({
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
    aiIndexOperationsService: new AiIndexOperationsService({
      getRuntimeSettingsCached: async () => options?.runtimeSettings ?? {
        aiEnabled: true,
        semanticSearchEnabled: true,
        aiTimeoutMs: 6000,
      },
      aiIndexService,
    }),
  });

  const app = createJsonTestApp();
  registerAiRoutes(app, {
    aiController,
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "user.one",
      role: "user",
      activityId: "activity-1",
    }),
    requireRole: createTestRequireRole(),
    withAiConcurrencyGate: (_route, handler) => (req, res, next) => {
      void Promise.resolve(handler(req as any, res)).catch(next);
    },
  });

  return {
    app,
    searchCalls,
    countSummaryCalls,
    chatCalls,
    indexCalls,
    branchImportCalls,
    auditEntries,
  };
}

test("GET /api/ai/config returns runtime AI config", async () => {
  const { app } = createAiRouteHarness({
    runtimeSettings: {
      aiEnabled: true,
      semanticSearchEnabled: false,
      aiTimeoutMs: 4321,
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/ai/config`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      host: "http://127.0.0.1:11434",
      model: "gemma:2b",
      aiEnabled: true,
      semanticSearchEnabled: false,
      aiTimeoutMs: 4321,
    });
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/ai/search rejects blank queries before service execution", async () => {
  const { app, searchCalls, countSummaryCalls } = createAiRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/ai/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "   " }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: "Query required" });
    assert.equal(searchCalls.length, 0);
    assert.equal(countSummaryCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/ai/search returns count summary without hitting AI search", async () => {
  const { app, searchCalls, countSummaryCalls } = createAiRouteHarness({
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
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/ai/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "berapa kerajaan" }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
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
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/ai/search forwards AI search results and writes audit logs asynchronously", async () => {
  const { app, searchCalls, auditEntries } = createAiRouteHarness({
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
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/ai/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "alice" }),
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
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
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/ai/index/import/:id clamps batch size and normalizes maxRows", async () => {
  const { app, indexCalls } = createAiRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/ai/index/import/import-1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        batchSize: 99,
        maxRows: -3,
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(indexCalls, [{
      importId: "import-1",
      username: "user.one",
      batchSize: 20,
      maxRows: null,
    }]);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/ai/branches/import/:id normalizes branch import keys", async () => {
  const { app, branchImportCalls } = createAiRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/ai/branches/import/import-1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nameKey: "branch_name",
        latKey: 123,
        lngKey: "longitude",
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(branchImportCalls, [{
      importId: "import-1",
      username: "user.one",
      nameKey: "branch_name",
      latKey: null,
      lngKey: "longitude",
    }]);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/ai/chat respects disabled AI runtime settings", async () => {
  const { app, chatCalls } = createAiRouteHarness({
    runtimeSettings: {
      aiEnabled: false,
      semanticSearchEnabled: true,
      aiTimeoutMs: 6000,
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      message: "AI assistant is disabled by system settings.",
    });
    assert.equal(chatCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});
