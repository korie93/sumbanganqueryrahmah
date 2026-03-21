import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { ensureObject } from "../http/validation";
import type { AiIndexOperationsService } from "../services/ai-index-operations.service";
import type { AiInteractionService } from "../services/ai-interaction.service";

type CreateAiControllerDeps = {
  aiInteractionService: Pick<AiInteractionService, "chat" | "getConfig" | "search">;
  aiIndexOperationsService: Pick<AiIndexOperationsService, "importBranches" | "indexImport">;
};

export type AiController = ReturnType<typeof createAiController>;

export function createAiController(deps: CreateAiControllerDeps) {
  const { aiInteractionService, aiIndexOperationsService } = deps;

  const getConfig = async (_req: AuthenticatedRequest, res: Response) => {
    return res.json(await aiInteractionService.getConfig());
  };

  const search = async (req: AuthenticatedRequest, res: Response) => {
    const body = ensureObject(req.body) || {};
    const result = await aiInteractionService.search({
      query: body.query,
      userKey: req.user!.activityId || req.user!.username,
      username: req.user!.username,
    });
    return res.status(result.statusCode).json(result.body);
  };

  const indexImport = async (req: AuthenticatedRequest, res: Response) => {
    const body = ensureObject(req.body) || {};
    const result = await aiIndexOperationsService.indexImport({
      importId: req.params.id,
      username: req.user!.username,
      batchSize: body.batchSize,
      maxRows: body.maxRows,
    });

    return res.status(result.statusCode).json(result.body);
  };

  const importBranches = async (req: AuthenticatedRequest, res: Response) => {
    const body = ensureObject(req.body) || {};
    const result = await aiIndexOperationsService.importBranches({
      importId: req.params.id,
      username: req.user!.username,
      nameKey: body.nameKey,
      latKey: body.latKey,
      lngKey: body.lngKey,
    });

    return res.status(result.statusCode).json(result.body);
  };

  const chat = async (req: AuthenticatedRequest, res: Response) => {
    const body = ensureObject(req.body) || {};
    const result = await aiInteractionService.chat({
      message: body.message,
      conversationId: body.conversationId,
      username: req.user!.username,
    });
    return res.status(result.statusCode).json(result.body);
  };

  return {
    getConfig,
    search,
    indexImport,
    importBranches,
    chat,
  };
}
