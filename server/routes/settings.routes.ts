import type { Express, RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import { ensureObject, readNonEmptyString } from "../http/validation";
import type { PostgresStorage } from "../storage-postgres";

type MaintenanceState = {
  maintenance: boolean;
  message: string;
  type: "soft" | "hard";
  startTime: string | null;
  endTime: string | null;
};

type SettingsRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  clearTabVisibilityCache: () => void;
  invalidateRuntimeSettingsCache: () => void;
  invalidateMaintenanceCache: () => void;
  getMaintenanceStateCached: (force?: boolean) => Promise<MaintenanceState>;
  broadcastWsMessage: (payload: Record<string, unknown>) => void;
  defaultAiTimeoutMs: number;
};

export function registerSettingsRoutes(app: Express, deps: SettingsRouteDeps) {
  const {
    storage,
    authenticateToken,
    requireRole,
    clearTabVisibilityCache,
    invalidateRuntimeSettingsCache,
    invalidateMaintenanceCache,
    getMaintenanceStateCached,
    broadcastWsMessage,
    defaultAiTimeoutMs,
  } = deps;

  app.get("/api/app-config", authenticateToken, asyncHandler(async (_req, res) => {
    const config = await storage.getAppConfig();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return res.json(config);
  }));

  app.get("/api/settings/tab-visibility", authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const role = req.user?.role || "user";
    return res.json({
      role,
      tabs: await storage.getRoleTabVisibility(role),
    });
  }));

  app.get("/api/settings", authenticateToken, requireRole("admin", "superuser"), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const role = req.user?.role || "user";
    return res.json({
      categories: await storage.getSettingsForRole(role),
    });
  }));

  app.patch("/api/settings", authenticateToken, requireRole("admin", "superuser"), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = ensureObject(req.body) || {};
    const key = readNonEmptyString(body.key);
    if (!key) {
      return res.status(400).json({ message: "Invalid setting key" });
    }

    const role = req.user?.role || "user";
    const result = await storage.updateSystemSetting({
      role,
      settingKey: key,
      value: body.value ?? null,
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

    if (result.status === "updated") {
      clearTabVisibilityCache();
      invalidateRuntimeSettingsCache();

      await storage.createAuditLog({
        action: result.setting?.isCritical ? "CRITICAL_SETTING_UPDATED" : "SETTING_UPDATED",
        performedBy: req.user?.username || "system",
        targetResource: key,
        details: `Updated setting ${key} to "${String(result.setting?.value ?? "")}"`,
      });

      if (key === "ai_timeout_ms") {
        process.env.OLLAMA_TIMEOUT_MS = String(result.setting?.value ?? defaultAiTimeoutMs);
      }

      if (result.shouldBroadcast) {
        invalidateMaintenanceCache();
        const maintenanceState = await getMaintenanceStateCached(true);
        broadcastWsMessage({
          type: "maintenance_update",
          maintenance: maintenanceState.maintenance,
          message: maintenanceState.message,
          mode: maintenanceState.type,
          startTime: maintenanceState.startTime,
          endTime: maintenanceState.endTime,
        });
      } else {
        broadcastWsMessage({
          type: "settings_updated",
          key,
          updatedBy: req.user?.username || "system",
        });
      }
    }

    return res.json({
      success: result.status === "updated" || result.status === "unchanged",
      status: result.status,
      message: result.message,
      setting: result.setting || null,
    });
  }));
}
