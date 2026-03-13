import { type OllamaMessage } from "../ai-ollama";
import type { CategoryStatsService } from "./category-stats.service";
import { CircuitOpenError } from "../internal/circuitBreaker";
import type { PostgresStorage } from "../storage-postgres";

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

    const searchTerms = this.buildSearchTerms(params.message);
    const retrievalRows = await this.fetchRetrievalRows(searchTerms);
    const contextBlock = this.buildContextBlock(searchTerms, retrievalRows);
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
    } catch (error: any) {
      if (error instanceof CircuitOpenError) {
        return {
          statusCode: 503,
          body: {
            message: "AI circuit is OPEN. Please retry after cooldown.",
            circuit: "OPEN",
          },
        };
      }

      if (error?.name === "AbortError") {
        reply = this.buildQuickReply(retrievalRows);
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

  private buildSearchTerms(message: string): string[] {
    const raw = message.toLowerCase();
    const digitMatches = raw.match(/\d{4,}/g) || [];
    const wordMatches = raw.match(/\b[a-z0-9]{4,}\b/gi) || [];
    const combined = [...digitMatches, ...wordMatches]
      .map((term) => term.replace(/[^a-z0-9]/gi, ""))
      .filter((term) => term.length >= 4);
    const unique = Array.from(new Set(combined));
    unique.sort((a, b) => b.length - a.length);
    return unique.length > 0 ? unique.slice(0, 4) : [message];
  }

  private async fetchRetrievalRows(searchTerms: string[]) {
    const resultMap = new Map<string, any>();

    for (const term of searchTerms) {
      const retrieval = await this.options.storage.searchGlobalDataRows({
        search: term,
        limit: 30,
        offset: 0,
      });

      for (const row of retrieval.rows || []) {
        if (!resultMap.has(row.id)) {
          resultMap.set(row.id, row);
        }
      }

      if (resultMap.size >= 60) {
        break;
      }
    }

    const allRows = Array.from(resultMap.values());
    const matchedRows = allRows.filter((row) =>
      searchTerms.some((term) => this.rowMatchesTerm(row, term)),
    );

    return (matchedRows.length > 0 ? matchedRows : allRows)
      .map((row) => ({
        row,
        score: Math.max(...searchTerms.map((term) => this.scoreRowForTerm(row, term))),
      }))
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.row)
      .slice(0, 5);
  }

  private buildContextBlock(searchTerms: string[], retrievalRows: any[]): string {
    const contextRows = retrievalRows.map((row, index) => {
      const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
      const entries = Object.entries(data).slice(0, 20);
      const lines = entries.map(([key, value]) => `${key}: ${String(value ?? "")}`);
      const source = row.importFilename || row.importName || "Unknown";
      return `# Rekod ${index + 1} (Source: ${source}, RowId: ${row.id || row.rowId || "unknown"})\n${lines.join("\n")}`;
    });

    if (contextRows.length === 0) {
      return "DATA SISTEM: TIADA REKOD DIJUMPAI UNTUK KATA KUNCI INI.";
    }

    return `DATA SISTEM (HASIL CARIAN KATA KUNCI: ${searchTerms.join(", ")}):\n${contextRows.join("\n\n")}`;
  }

  private buildQuickReply(retrievalRows: any[]): string {
    if (retrievalRows.length === 0) {
      return "Tiada data dijumpai untuk kata kunci tersebut.";
    }

    const priorityKeys = [
      "nama",
      "name",
      "no. mykad",
      "mykad",
      "ic",
      "no. ic",
      "nric",
      "no. kp",
      "akaun",
      "account",
      "telefon",
      "phone",
      "hp",
      "alamat",
      "address",
      "umur",
      "age",
    ];

    const summaries = retrievalRows.slice(0, 3).map((row, index) => {
      const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
      const pairs: string[] = [];

      for (const key of Object.keys(data)) {
        const lower = key.toLowerCase();
        if (priorityKeys.some((term) => lower.includes(term))) {
          pairs.push(`${key}: ${String(data[key] ?? "")}`);
        }
        if (pairs.length >= 8) {
          break;
        }
      }

      if (pairs.length === 0) {
        pairs.push(
          ...Object.entries(data)
            .slice(0, 6)
            .map(([key, value]) => `${key}: ${String(value ?? "")}`),
        );
      }

      const source = row.importFilename || row.importName || "Unknown";
      return `Rekod ${index + 1} (Source: ${source})\n${pairs.join("\n")}`;
    });

    return `Rekod dijumpai:\n${summaries.join("\n\n")}`;
  }

  private rowMatchesTerm(row: any, term: string): boolean {
    const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
    return Object.values(data).some((value) => this.valueMatchesTerm(value, term));
  }

  private valueMatchesTerm(value: unknown, term: string): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    const termLower = term.toLowerCase();
    const termDigits = term.replace(/\D/g, "");
    const asString = String(value);
    if (termDigits.length >= 6) {
      const valueDigits = asString.replace(/\D/g, "");
      if (valueDigits.includes(termDigits)) {
        return true;
      }
    }

    return asString.toLowerCase().includes(termLower);
  }

  private scoreRowForTerm(row: any, term: string): number {
    const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
    const termDigits = term.replace(/\D/g, "");
    let score = 0;

    for (const [key, value] of Object.entries(data)) {
      const keyLower = key.toLowerCase();
      const valueString = String(value ?? "");
      const valueDigits = valueString.replace(/\D/g, "");

      if (!termDigits) {
        if (valueString.toLowerCase().includes(term.toLowerCase())) {
          score += 2;
        }
        continue;
      }

      if (valueDigits === termDigits) {
        if (
          keyLower.includes("ic") ||
          keyLower.includes("mykad") ||
          keyLower.includes("nric") ||
          keyLower.includes("kp")
        ) {
          score += 10;
        } else {
          score += 6;
        }
      } else if (valueDigits.includes(termDigits)) {
        score += 3;
      }
    }

    return score;
  }
}
