import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import type { SettingsRouteContext } from "./settings-route-context";

export function registerSettingsReadRoutes(context: SettingsRouteContext) {
  const {
    app,
    authenticateToken,
    requireRole,
    requireTabAccess,
    settingsService,
    safeImportUploadLimitBytes,
  } = context;

  app.get(
    "/api/app-config",
    authenticateToken,
    asyncHandler(async (_req, res) => {
      const config = await settingsService.getAppConfig();
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      return res.json({
        ...config,
        importUploadLimitBytes: safeImportUploadLimitBytes,
      });
    }),
  );

  app.get(
    "/api/settings/tab-visibility",
    authenticateToken,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const role = req.user?.role || "user";
      return res.json({
        role,
        tabs: await settingsService.getTabVisibility(role),
      });
    }),
  );

  app.get(
    "/api/settings",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("settings"),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const role = req.user?.role || "user";
      return res.json({
        categories: await settingsService.getSettingsForRole(role),
      });
    }),
  );
}
