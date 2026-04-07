import { type OllamaMessage } from "../ai-ollama";
import type { CategoryStatsService } from "./category-stats.service";
import { CircuitOpenError } from "../internal/circuitBreaker";
import type { PostgresStorage } from "../storage-postgres";
import {
  buildAiChatContextBlock,
  buildAiChatQuickReply,
  buildAiChatSearchTerms,
  fetchAiChatRetrievalRows,
} from "./ai-chat-utils";

type AiChatServiceOptions = {
  storage: PostgresStorage;
  categoryStatsService: CategoryStatsService;
  withAiCircuit: <T>(operation: () => Promise<T>) => Promise<T>;
  ollamaChat: (
    messages: OllamaMessage[],
    options?: Record<string, unknown>,
  ) => Promise<string>;
};

type AiChatResult = {
  statusCode: number;
  body: {
    conversationId?: string;
    reply?: string;
    processing?: boolean;
    stats?: Awaited<ReturnType<PostgresStorage["getCategoryStats"]>>;
    message?: string;
    circuit?: string;
  };
};

export class AiChatService {
  constructor(private readonly options: AiChatServiceOptions) {}

  async handleChat(params: {
    message: string;
    username: string;
    existingConversationId?: string | null;
    aiTimeoutMs: number;
  }): Promise<AiChatResult> {
    const conversationId =
      params.existingConversationId || await this.options.storage.createConversation(params.username);
    const history = await this.options.storage.getConversationMessages(conversationId, 3);

    const countSummary = await this.options.categoryStatsService.resolveCountSummary(
      params.message,
      12_000,
    );
    if (countSummary) {
      const reply = countSummary.summary;
      await this.persistConversation(conversationId, params.username, params.message, reply);
      return {
        statusCode: 200,
        body: {
          conversationId,
          reply,
          processing: countSummary.processing,
          stats: countSummary.stats,
        },
      };
    }

    const searchTerms = buildAiChatSearchTerms(params.message);
    const retrievalRows = await fetchAiChatRetrievalRows(this.options.storage, searchTerms);
    const contextBlock = buildAiChatContextBlock(searchTerms, retrievalRows);
    const chatMessages: OllamaMessage[] = [
      {
        role: "system",
        content:
          "Anda ialah pembantu AI offline untuk sistem SQR. Jawab dalam Bahasa Melayu. " +
          "Jawapan mestilah berdasarkan DATA SISTEM di bawah. Jika tiada data yang sepadan, katakan dengan jelas bahawa tiada data dijumpai. " +
          "Jangan membuat andaian atau menambah fakta yang tiada dalam data.",
      },
      { role: "system", content: contextBlock },
      ...history.map((entry) => ({
        role: entry.role as "user" | "assistant" | "system",
        content: entry.content,
      })),
      { role: "user", content: params.message },
    ];

    let reply = "";
    try {
      reply = await this.options.withAiCircuit(() =>
        this.options.ollamaChat(chatMessages, {
          num_predict: 96,
          temperature: 0.2,
          top_p: 0.9,
          timeoutMs: params.aiTimeoutMs,
        }),
      );
    } catch (error: unknown) {
      if (error instanceof CircuitOpenError) {
        return {
          statusCode: 503,
          body: {
            message: "AI circuit is OPEN. Please retry after cooldown.",
            circuit: "OPEN",
          },
        };
      }

      if (isNamedError(error, "AbortError")) {
        reply = buildAiChatQuickReply(retrievalRows);
      } else {
        throw error;
      }
    }

    await this.persistConversation(conversationId, params.username, params.message, reply);
    return {
      statusCode: 200,
      body: {
        conversationId,
        reply,
      },
    };
  }

  private async persistConversation(
    conversationId: string,
    username: string,
    message: string,
    reply: string,
  ) {
    await this.options.storage.saveConversationMessage(conversationId, "user", message);
    await this.options.storage.saveConversationMessage(conversationId, "assistant", reply);
    await this.options.storage.createAuditLog({
      action: "AI_CHAT",
      performedBy: username,
      details: `Conversation=${conversationId}`,
    });
  }
}

function isNamedError(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}
