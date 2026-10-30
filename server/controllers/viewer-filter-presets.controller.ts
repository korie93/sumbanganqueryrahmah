import { z } from "zod";
import { viewerFilterPresetCreateSchema, viewerFilterPresetRenameSchema } from "../../shared/common/viewer-filter-presets";
import type { AuthenticatedRequest } from "../auth/guards";
import type { Response } from "express";
import { badRequest, unauthorized } from "../http/errors";
import { parseRequestBody, readRouteParam } from "../http/validation";
import type { ViewerFilterPresetsService } from "../services/viewer-filter-presets.service";

export function createViewerFilterPresetsController(service: ViewerFilterPresetsService) {
  function scope(req: AuthenticatedRequest) {
    const owner = req.user?.userId;
    if (!owner) throw unauthorized();
    const importId = readRouteParam(req.params.id, "Import ID", 200);
    return { owner, importId };
  }
  function presetId(req: AuthenticatedRequest) {
    const parsed = z.string().uuid().safeParse(req.params.presetId);
    if (!parsed.success) throw badRequest("Invalid preset ID.");
    return parsed.data;
  }
  return {
    list: async (req: AuthenticatedRequest, res: Response) => {
      const { owner, importId } = scope(req);
      return res.json({ presets: await service.list(owner, importId) });
    },
    create: async (req: AuthenticatedRequest, res: Response) => {
      const { owner, importId } = scope(req);
      const input = parseRequestBody(viewerFilterPresetCreateSchema, req.body);
      return res.status(201).json({ preset: await service.create(owner, importId, input) });
    },
    rename: async (req: AuthenticatedRequest, res: Response) => {
      const { owner, importId } = scope(req), id = presetId(req);
      const input = parseRequestBody(viewerFilterPresetRenameSchema, req.body);
      return res.json({ preset: await service.rename(owner, importId, id, input.name) });
    },
    delete: async (req: AuthenticatedRequest, res: Response) => {
      const { owner, importId } = scope(req), id = presetId(req);
      await service.delete(owner, importId, id);
      return res.json({ ok: true });
    },
  };
}
