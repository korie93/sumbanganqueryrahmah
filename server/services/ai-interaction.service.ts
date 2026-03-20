import type { InsertAuditLog } from "../../shared/schema-postgres";
import { logger } from "../lib/logger";
import type { AiChatService } from "./ai-chat.service";
import type { AiSearchService } from "./ai-search.service";
import type { CategoryStatsService } from "./category-stats.service";

type RuntimeSettings = {
  aiEnabled: boolean;
  semanticSearchEnabled: boolean;
  aiTimeoutMs: number;
};

type AiInteractionDeps = {
  createAuditLog: (data: InsertAuditLog) => Promise<unknown>;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  aiSearchService: Pick<AiSearchService, "resolveSearchRequest">;
  categoryStatsService: Pick<CategoryStatsService, "resolveCountSummary">;
  aiChatService: Pick<AiChatService, "handleChat">;
  getOllamaConfig: () => Record<string, unknown>;
  defaultAiTimeoutMs: number;
};

type AiInteractionResponse = {
  statusCode: number;
  body: unknown;
};

export class AiInteractionService {
  constructor(private readonly deps: AiInteractionDeps) {}

  async getConfig() {
    const runtimeSettings = await this.deps.getRuntimeSettingsCached();
    return {
      ...this.deps.getOllamaConfig(),
      aiEnabled: runtimeSettings.aiEnabled,
      semanticSearchEnabled: runtimeSettings.semanticSearchEnabled,
      aiTimeoutMs: runtimeSettings.aiTimeoutMs,
    };
  }

  async search(params: {
    query?: unknown;
    userKey: string;
    username: string;
  }): Promise<AiInteractionResponse> {
    try {
      const query = String(params.query || "").trim();
      if (!query) {
        return {
          statusCode: 400,
          body: { message: "Query required" },
        };
      }

      const runtimeSettings = await this.deps.getRuntimeSettingsCached();
      if (!runtimeSettings.aiEnabled) {
        return {
          statusCode: 503,
          body: {
            message: "AI assistant is disabled by system settings.",
            disabled: true,
          },
        };
      }

      const countSummary = await this.deps.categoryStatsService.resolveCountSummary(
        query,
        runtimeSettings.aiTimeoutMs || this.deps.defaultAiTimeoutMs,
      );
      if (countSummary) {
        return {
          statusCode: 200,
          body: {
            person: null,
            nearest_branch: null,
            decision: null,
            ai_explanation: countSummary.summary,
            processing: countSummary.processing,
            stats: countSummary.stats,
          },
        };
      }

      const result = await this.deps.aiSearchService.resolveSearchRequest({
        query,
        userKey: params.userKey,
        runtimeSettings: {
          semanticSearchEnabled: runtimeSettings.semanticSearchEnabled,
          aiTimeoutMs: runtimeSettings.aiTimeoutMs,
        },
      });

      if (result.audit) {
        queueMicrotask(() => {
          void this.deps.createAuditLog({
            action: "AI_SEARCH",
            performedBy: params.username,
            targetResource: "ai_search",
            details: JSON.stringify(result.audit),
          }).catch((error) => {
            logger.error("Audit log failed for AI search", { error });
          });
        });
      }

      return {
        statusCode: result.statusCode,
        body: result.body,
      };
    } catch (error) {
      logger.error("AI search request failed", { error });
      return {
        statusCode: 500,
        body: { message: this.getErrorMessage(error) },
      };
    }
  }

  async chat(params: {
    message?: unknown;
    conversationId?: unknown;
    username: string;
  }): Promise<AiInteractionResponse> {
    try {
      const message = String(params.message || "").trim();
      if (!message) {
        return {
          statusCode: 400,
          body: { message: "Message required" },
        };
      }

      const runtimeSettings = await this.deps.getRuntimeSettingsCached();
      if (!runtimeSettings.aiEnabled) {
        return {
          statusCode: 503,
          body: { message: "AI assistant is disabled by system settings." },
        };
      }

      const result = await this.deps.aiChatService.handleChat({
        message,
        username: params.username,
        existingConversationId: params.conversationId ? String(params.conversationId) : null,
        aiTimeoutMs: runtimeSettings.aiTimeoutMs,
      });

      return {
        statusCode: result.statusCode,
        body: result.body,
      };
    } catch (error) {
      logger.error("AI chat request failed", { error });
      return {
        statusCode: 500,
        body: { message: this.getErrorMessage(error) },
      };
    }
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return "Internal Server Error";
  }
}
