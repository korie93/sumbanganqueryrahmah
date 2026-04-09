import assert from "node:assert/strict";
import test from "node:test";
import { CircuitOpenError } from "../../internal/circuitBreaker";
import { AiChatService } from "../ai-chat.service";

type AiChatServiceOptions = ConstructorParameters<typeof AiChatService>[0];
type AiChatStorage = AiChatServiceOptions["storage"];
type AiChatCategoryStatsService = AiChatServiceOptions["categoryStatsService"];

function createAiChatStorage(storage: object): AiChatStorage {
  return storage as unknown as AiChatStorage;
}

function createAiChatCategoryStatsService(service: object): AiChatCategoryStatsService {
  return service as unknown as AiChatCategoryStatsService;
}

function createAiChatHarness(options?: {
  countSummary?: {
    processing: boolean;
    summary: string;
    stats: Array<Record<string, unknown>>;
  } | null;
  withAiCircuitError?: Error;
}) {
  const savedMessages: Array<{
    conversationId: string;
    role: string;
    content: string;
  }> = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  const searchCalls: Array<Record<string, unknown>> = [];
  const chatMessages: Array<Record<string, unknown>> = [];

  const storage = {
    createConversation: async () => "conv-1",
    getConversationMessages: async () => [],
    searchGlobalDataRows: async (params: Record<string, unknown>) => {
      searchCalls.push(params);
      return {
        rows: [
          {
            id: "row-1",
            importName: "customer-import",
            importFilename: "customer-import.xlsx",
            jsonDataJsonb: {
              Nama: "Ali Bin Abu",
              "Account No": "123456789012",
              Alamat: "Jalan Merdeka",
            },
          },
        ],
        total: 1,
      };
    },
    saveConversationMessage: async (conversationId: string, role: string, content: string) => {
      savedMessages.push({ conversationId, role, content });
      return {
        id: `${role}-${savedMessages.length}`,
        conversationId,
        role,
        content,
      };
    },
    createAuditLog: async (entry: Record<string, unknown>) => {
      auditLogs.push(entry);
      return entry;
    },
  };

  const categoryStatsService = {
    resolveCountSummary: async () => options?.countSummary ?? null,
  };

  const service = new AiChatService({
    storage: createAiChatStorage(storage),
    categoryStatsService: createAiChatCategoryStatsService(categoryStatsService),
    withAiCircuit: async <T>(operation: () => Promise<T>) => {
      if (options?.withAiCircuitError) {
        throw options.withAiCircuitError;
      }
      return operation();
    },
    ollamaChat: async (messages: Array<Record<string, unknown>>) => {
      chatMessages.push(...messages);
      return "Jawapan AI";
    },
  });

  return {
    service,
    savedMessages,
    auditLogs,
    searchCalls,
    chatMessages,
  };
}

test("AiChatService persists count-summary replies without calling Ollama", async () => {
  const { service, savedMessages, auditLogs, searchCalls, chatMessages } = createAiChatHarness({
    countSummary: {
      processing: false,
      summary: "Jumlah kerajaan: 12",
      stats: [{ key: "kerajaan", total: 12 }],
    },
  });

  const result = await service.handleChat({
    message: "berapa kerajaan",
    username: "user.one",
    aiTimeoutMs: 6000,
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, {
    conversationId: "conv-1",
    reply: "Jumlah kerajaan: 12",
    processing: false,
    stats: [{ key: "kerajaan", total: 12 }],
  });
  assert.equal(searchCalls.length, 0);
  assert.equal(chatMessages.length, 0);
  assert.deepEqual(savedMessages, [
    {
      conversationId: "conv-1",
      role: "user",
      content: "berapa kerajaan",
    },
    {
      conversationId: "conv-1",
      role: "assistant",
      content: "Jumlah kerajaan: 12",
    },
  ]);
  assert.deepEqual(auditLogs, [{
    action: "AI_CHAT",
    performedBy: "user.one",
    details: "Conversation=conv-1",
  }]);
});

test("AiChatService falls back to quick replies on AbortError and persists the response", async () => {
  const abortError = new Error("timed out");
  abortError.name = "AbortError";

  const { service, savedMessages, auditLogs, searchCalls } = createAiChatHarness({
    withAiCircuitError: abortError,
  });

  const result = await service.handleChat({
    message: "123456789012 Ali",
    username: "user.one",
    aiTimeoutMs: 6000,
  });

  assert.equal(result.statusCode, 200);
  assert.ok(String(result.body.reply || "").includes("Rekod dijumpai:"));
  assert.ok(String(result.body.reply || "").includes("Account No: 123456789012"));
  assert.ok(searchCalls.length >= 1);
  assert.deepEqual(savedMessages, [
    {
      conversationId: "conv-1",
      role: "user",
      content: "123456789012 Ali",
    },
    {
      conversationId: "conv-1",
      role: "assistant",
      content: result.body.reply,
    },
  ]);
  assert.deepEqual(auditLogs, [{
    action: "AI_CHAT",
    performedBy: "user.one",
    details: "Conversation=conv-1",
  }]);
});

test("AiChatService returns 503 when the AI circuit is open", async () => {
  const { service, savedMessages, auditLogs } = createAiChatHarness({
    withAiCircuitError: new CircuitOpenError("OPEN"),
  });

  const result = await service.handleChat({
    message: "hello",
    username: "user.one",
    aiTimeoutMs: 6000,
  });

  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, {
    message: "AI circuit is OPEN. Please retry after cooldown.",
    circuit: "OPEN",
  });
  assert.equal(savedMessages.length, 0);
  assert.equal(auditLogs.length, 0);
});
