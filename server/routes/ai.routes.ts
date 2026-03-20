import type { Express, RequestHandler } from "express";
import type { AiController } from "../controllers/ai.controller";
import { asyncHandler } from "../http/async-handler";

type AiRouteDeps = {
  aiController: AiController;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  withAiConcurrencyGate: (
    route: "search" | "chat",
    handler: AiController["search"] | AiController["chat"],
  ) => RequestHandler;
};

export function registerAiRoutes(app: Express, deps: AiRouteDeps) {
  const {
    aiController,
    authenticateToken,
    requireRole,
    withAiConcurrencyGate,
  } = deps;

  app.get(
    "/api/ai/config",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    asyncHandler(aiController.getConfig),
  );

  app.post(
    "/api/ai/search",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    withAiConcurrencyGate("search", aiController.search),
  );

  app.post(
    "/api/ai/index/import/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    asyncHandler(aiController.indexImport),
  );

  app.post(
    "/api/ai/branches/import/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    asyncHandler(aiController.importBranches),
  );

  app.post(
    "/api/ai/chat",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    withAiConcurrencyGate("chat", aiController.chat),
  );
}
