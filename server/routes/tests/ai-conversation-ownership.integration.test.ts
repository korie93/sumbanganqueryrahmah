import assert from "node:assert/strict";
import test from "node:test";
import { createAiController } from "../../controllers/ai.controller";
import { asyncHandler } from "../../http/async-handler";
import { notFound } from "../../http/errors";
import type { AuthenticatedRequest } from "../../auth/guards";
import { errorHandler } from "../../middleware/error-handler";
import { AiChatService } from "../../services/ai-chat.service";
import { AiInteractionService } from "../../services/ai-interaction.service";
import { registerAiRoutes } from "../ai.routes";
import {
  createJsonTestApp, createTestAuthenticateToken, createTestRequireRole,
  startTestServer, stopTestServer,
} from "./http-test-utils";

type ChatOptions = ConstructorParameters<typeof AiChatService>[0];
type InteractionOptions = ConstructorParameters<typeof AiInteractionService>[0];
type ConversationWrite = { conversationId: string; owner: string };

for (const branch of ["count-summary", "model"] as const) {
  test(`AI chat HTTP ${branch} binds conversation access to authenticated account`, async () => {
    const owners = new Map([["alice-conversation", "alice-id"], ["bob-conversation", "bob-id"]]);
    const calls: string[] = [];
    const auditUsernames: string[] = [];
    let runtimeReads = 0;
    const writes: ConversationWrite[] = [];
    const observeWrites = (): ConversationWrite[] => writes.slice();
    const authorize = (conversationId: string, owner: string) => {
      if (owners.get(conversationId) !== owner) throw notFound("Conversation not found.");
    };
    const categoryStatsService = {
      resolveCountSummary: async () => {
        calls.push("summary");
        return branch === "count-summary"
          ? { summary: "Jumlah: 1", processing: false, stats: [] } : null;
      },
    } as unknown as ChatOptions["categoryStatsService"];
    const chat = new AiChatService({
      storage: {
        createConversation: async (owner: string) => {
          owners.set("new-conversation", owner);
          return "new-conversation";
        },
        assertConversationOwner: async (conversationId: string, owner: string) => {
          authorize(conversationId, owner);
        },
        getConversationMessages: async (conversationId: string, owner: string) => {
          authorize(conversationId, owner);
          calls.push("history");
          return [];
        },
        saveConversationMessage: async (conversationId: string, owner: string) => {
          authorize(conversationId, owner);
          writes.push({ conversationId, owner });
        },
        searchGlobalDataRows: async () => { calls.push("retrieval"); return { rows: [], total: 0 }; },
        createAuditLog: async (entry: { performedBy: string }) => {
          calls.push("audit"); auditUsernames.push(entry.performedBy);
        },
      } as unknown as ChatOptions["storage"],
      categoryStatsService,
      withAiCircuit: async <T>(operation: () => Promise<T>) => operation(),
      ollamaChat: async () => { calls.push("model"); return "Private reply"; },
    });
    const interaction = new AiInteractionService({
      createAuditLog: async () => undefined,
      getRuntimeSettingsCached: async () => {
        runtimeReads += 1;
        return { aiEnabled: true, semanticSearchEnabled: false, aiTimeoutMs: 100 };
      },
      aiSearchService: {} as InteractionOptions["aiSearchService"],
      categoryStatsService,
      aiChatService: chat,
      getOllamaConfig: () => ({}),
      defaultAiTimeoutMs: 100,
    });
    const controller = createAiController({
      aiInteractionService: interaction,
      aiIndexOperationsService: {} as Parameters<typeof createAiController>[0]["aiIndexOperationsService"],
    });
    const app = createJsonTestApp();
    const authenticate = createTestAuthenticateToken({ userId: "alice-id", username: "alice", role: "user" });
    registerAiRoutes(app, {
      aiController: controller,
      authenticateToken: (req, res, next) => authenticate(req, res, (error) => {
        if (error) { next(error); return; }
        if (req.headers["x-test-no-userid"] === "1") (req as AuthenticatedRequest).user!.userId = undefined;
        next();
      }),
      requireRole: createTestRequireRole(),
      withAiConcurrencyGate: (_route, handler) => asyncHandler(handler),
    });
    app.use(errorHandler);
    const { server, baseUrl } = await startTestServer(app);
    try {
      const post = (conversationId: string | undefined, role = "user", userId = "alice-id", username = "alice", missingId = false) => fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST", headers: {
          "Content-Type": "application/json", "x-test-role": role, "x-test-userid": userId,
          "x-test-username": username, "x-test-no-userid": missingId ? "1" : "0",
        },
        body: JSON.stringify({ message: "private question", conversationId, userId: "bob-id", username: "bob", ownerUserId: "bob-id", createdBy: "bob" }),
      });
      assert.equal((await post(undefined, "user", "alice-id", "alice", true)).status, 401);
      assert.equal(runtimeReads, 0, "Missing trusted ID must reject before interaction work.");
      assert.deepEqual(calls, []);
      assert.deepEqual(writes, []);
      for (const role of ["user", "manager", "admin", "superuser"]) {
        for (const id of ["bob-conversation", "missing-conversation"]) {
          const denied = await post(id, role);
          assert.equal(denied.status, 404);
          assert.deepEqual(await denied.json(), { message: "Conversation not found." });
          assert.deepEqual(calls, [], "Denial must precede history, summary, retrieval and model.");
          assert.deepEqual(writes, []);
        }
      }
      for (const id of ["alice-conversation", undefined]) {
        const allowed = await post(id);
        assert.equal(allowed.status, 200);
        const body = await allowed.json() as { conversationId: string; reply: string };
        assert.equal(body.conversationId, id || "new-conversation");
        assert.equal(owners.get(body.conversationId), "alice-id");
        assert.equal(body.reply, branch === "count-summary" ? "Jumlah: 1" : "Private reply");
      }
      const successfulWrites = observeWrites();
      assert.equal(successfulWrites.length, 4);
      assert.ok(successfulWrites.every((entry) => entry.owner === "alice-id"));
      assert.ok(successfulWrites.every((entry) => entry.conversationId !== "bob-conversation"));
      const renamed = await post("alice-conversation", "user", "alice-id", "alice.renamed");
      assert.equal(renamed.status, 200);
      assert.equal(auditUsernames[auditUsernames.length - 1], "alice.renamed", "Audit still uses current username.");
      calls.length = 0;
      const beforeReuse = writes.length;
      const reused = await post("alice-conversation", "user", "replacement-id", "alice");
      assert.equal(reused.status, 404);
      assert.deepEqual(await reused.json(), { message: "Conversation not found." });
      assert.deepEqual(calls, []);
      assert.equal(writes.length, beforeReuse);
    } finally {
      await stopTestServer(server);
    }
  });
}
