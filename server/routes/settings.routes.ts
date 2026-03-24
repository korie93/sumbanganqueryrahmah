import type { Express, RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import { ensureObject, readNonEmptyString } from "../http/validation";
import { SettingsService } from "../services/settings.service";
import type { PostgresStorage } from "../storage-postgres";
import type { MaintenanceState } from "../config/system-settings";

type SettingsRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  clearTabVisibilityCache: () => void;
  invalidateRuntimeSettingsCache: () => void;
  invalidateMaintenanceCache: () => void;
  getMaintenanceStateCached: (force?: boolean) => Promise<MaintenanceState>;
  broadcastWsMessage: (payload: Record<string, unknown>) => void;
};

export function registerSettingsRoutes(app: Express, deps: SettingsRouteDeps) {
  const {
    storage,
    authenticateToken,
    requireRole,
    requireTabAccess,
    clearTabVisibilityCache,
    invalidateRuntimeSettingsCache,
    invalidateMaintenanceCache,
    getMaintenanceStateCached,
    broadcastWsMessage,
  } = deps;
  const settingsService = new SettingsService(storage, {
    clearTabVisibilityCache,
    invalidateRuntimeSettingsCache,
    invalidateMaintenanceCache,
    getMaintenanceStateCached,
    broadcastWsMessage,
  });

  app.get("/api/app-config", authenticateToken, asyncHandler(async (_req, res) => {
    const config = await settingsService.getAppConfig();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return res.json(config);
  }));

  app.get("/api/settings/tab-visibility", authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const role = req.user?.role || "user";
    return res.json({
      role,
      tabs: await settingsService.getTabVisibility(role),
    });
  }));

  app.get("/api/settings", authenticateToken, requireRole("admin", "superuser"), requireTabAccess("settings"), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const role = req.user?.role || "user";
    return res.json({
      categories: await settingsService.getSettingsForRole(role),
    });
  }));

  app.patch("/api/settings", authenticateToken, requireRole("admin", "superuser"), requireTabAccess("settings"), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = ensureObject(req.body) || {};
    const key = readNonEmptyString(body.key);
    if (!key) {
      return res.status(400).json({ message: "Invalid setting key" });
    }

    const role = req.user?.role || "user";
    const result = await settingsService.updateSetting({
      role,
      key,
      value: body.value,
      confirmCritical: Boolean(body.confirmCritical),
      updatedBy: req.user?.username || "system",
    });

    if (result.status === "not_found") {
      return res.status(404).json({ message: result.message });
    }
    if (result.status === "forbidden") {
      return res.status(403).json({ message: result.message });
    }
    if (result.status === "requires_confirmation") {
      return res.status(409).json({ message: result.message, requiresConfirmation: true });
    }
    if (result.status === "invalid") {
      return res.status(400).json({ message: result.message });
    }

    return res.json({
      success: result.status === "updated" || result.status === "unchanged",
      status: result.status,
      message: result.message,
      setting: result.setting || null,
    });
  }));
}
