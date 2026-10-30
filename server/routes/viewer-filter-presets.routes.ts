import type { Express, RequestHandler } from "express";
import { createViewerFilterPresetsController } from "../controllers/viewer-filter-presets.controller";
import { asyncHandler } from "../http/async-handler";
import type { ViewerFilterPresetsService } from "../services/viewer-filter-presets.service";

export function registerViewerFilterPresetRoutes(app: Express, deps: {
  service: ViewerFilterPresetsService;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string, ...alternatives: string[]) => RequestHandler;
  rateLimiter: RequestHandler;
}) {
  const controller = createViewerFilterPresetsController(deps.service);
  const guards = [deps.authenticateToken, deps.requireRole("user", "admin", "manager", "superuser"),
    deps.requireTabAccess("import", "saved", "viewer"), deps.rateLimiter];
  const path = "/api/imports/:id/viewer-presets";
  app.get(path, ...guards, asyncHandler(controller.list));
  app.post(path, ...guards, asyncHandler(controller.create));
  app.patch(`${path}/:presetId`, ...guards, asyncHandler(controller.rename));
  app.delete(`${path}/:presetId`, ...guards, asyncHandler(controller.delete));
}
