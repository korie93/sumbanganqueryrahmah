import type { Express, RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import { ensureObject, readInteger } from "../http/validation";
import type { AiSearchService } from "../services/ai-search.service";
import type { CategoryStatsService } from "../services/category-stats.service";
import type { AiChatService } from "../services/ai-chat.service";
import type { AiIndexService } from "../services/ai-index.service";
import type { PostgresStorage } from "../storage-postgres";

type RuntimeSettings = {
  aiEnabled: boolean;
  semanticSearchEnabled: boolean;
  aiTimeoutMs: number;
};

type AiRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  withAiConcurrencyGate: (
    route: "search" | "chat",
    handler: (req: AuthenticatedRequest, res: Response) => Promise<unknown>,
  ) => RequestHandler;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  aiSearchService: AiSearchService;
  categoryStatsService: CategoryStatsService;
  aiChatService: AiChatService;
  aiIndexService: AiIndexService;
  getOllamaConfig: () => Record<string, unknown>;
  defaultAiTimeoutMs: number;
};

export function registerAiRoutes(app: Express, deps: AiRouteDeps) {
  const {
    storage,
    authenticateToken,
    requireRole,
    withAiConcurrencyGate,
    getRuntimeSettingsCached,
    aiSearchService,
    categoryStatsService,
    aiChatService,
    aiIndexService,
    getOllamaConfig,
    defaultAiTimeoutMs,
  } = deps;

  app.get(
    "/api/ai/config",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    asyncHandler(async (_req, res) => {
      const runtimeSettings = await getRuntimeSettingsCached();
      return res.json({
        ...getOllamaConfig(),
        aiEnabled: runtimeSettings.aiEnabled,
        semanticSearchEnabled: runtimeSettings.semanticSearchEnabled,
        aiTimeoutMs: runtimeSettings.aiTimeoutMs,
      });
    }),
  );

  app.post(
    "/api/ai/search",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    withAiConcurrencyGate("search", async (req: AuthenticatedRequest, res: Response) => {
      try {
        const body = ensureObject(req.body) || {};
        const query = String(body.query || "").trim();
        if (!query) {
          return res.status(400).json({ message: "Query required" });
        }

        const runtimeSettings = await getRuntimeSettingsCached();
        if (!runtimeSettings.aiEnabled) {
          return res.status(503).json({
            message: "AI assistant is disabled by system settings.",
            disabled: true,
          });
        }

        const countSummary = await categoryStatsService.resolveCountSummary(
          query,
          runtimeSettings.aiTimeoutMs || defaultAiTimeoutMs,
        );
        if (countSummary) {
          return res.json({
            person: null,
            nearest_branch: null,
            decision: null,
            ai_explanation: countSummary.summary,
            processing: countSummary.processing,
            stats: countSummary.stats,
          });
        }

        const result = await aiSearchService.resolveSearchRequest({
          query,
          userKey: req.user!.activityId || req.user!.username,
          runtimeSettings: {
            semanticSearchEnabled: runtimeSettings.semanticSearchEnabled,
            aiTimeoutMs: runtimeSettings.aiTimeoutMs,
          },
        });

        if (result.audit) {
          queueMicrotask(() => {
            storage.createAuditLog({
              action: "AI_SEARCH",
              performedBy: req.user!.username,
              targetResource: "ai_search",
              details: JSON.stringify(result.audit),
            }).catch((error) => {
              console.error("Audit log failed:", error?.message || error);
            });
          });
        }

        return res.status(result.statusCode).json(result.body);
      } catch (error: any) {
        console.error("AI search error:", error);
        return res.status(500).json({ message: error.message });
      }
    }),
  );

  app.post(
    "/api/ai/index/import/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const runtimeSettings = await getRuntimeSettingsCached();
      if (!runtimeSettings.aiEnabled) {
        return res.status(503).json({ message: "AI assistant is disabled by system settings." });
      }

      const body = ensureObject(req.body) || {};
      const batchSize = Math.max(1, Math.min(20, readInteger(body.batchSize, 5)));
      const maxRowsValue = readInteger(body.maxRows, 0);
      const maxRows = maxRowsValue > 0 ? Math.max(1, maxRowsValue) : null;
      const result = await aiIndexService.indexImport({
        importId: req.params.id,
        username: req.user!.username,
        batchSize,
        maxRows,
      });

      return res.status(result.statusCode).json(result.body);
    }),
  );

  app.post(
    "/api/ai/branches/import/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = ensureObject(req.body) || {};
      const result = await aiIndexService.importBranches({
        importId: req.params.id,
        username: req.user!.username,
        nameKey: typeof body.nameKey === "string" ? body.nameKey : null,
        latKey: typeof body.latKey === "string" ? body.latKey : null,
        lngKey: typeof body.lngKey === "string" ? body.lngKey : null,
      });

      return res.status(result.statusCode).json(result.body);
    }),
  );

  app.post(
    "/api/ai/chat",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    withAiConcurrencyGate("chat", async (req: AuthenticatedRequest, res: Response) => {
      try {
        const body = ensureObject(req.body) || {};
        const message = String(body.message || "").trim();
        if (!message) {
          return res.status(400).json({ message: "Message required" });
        }

        const runtimeSettings = await getRuntimeSettingsCached();
        if (!runtimeSettings.aiEnabled) {
          return res.status(503).json({ message: "AI assistant is disabled by system settings." });
        }

        const result = await aiChatService.handleChat({
          message,
          username: req.user!.username,
          existingConversationId: body.conversationId ? String(body.conversationId) : null,
          aiTimeoutMs: runtimeSettings.aiTimeoutMs,
        });

        return res.status(result.statusCode).json(result.body);
      } catch (error: any) {
        console.error("AI chat error:", error);
        return res.status(500).json({ message: error.message });
      }
    }),
  );
}
