import type { Express, RequestHandler } from "express";
import { DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES } from "../config/body-limit";
import type { MaintenanceState } from "../config/system-settings";
import { SettingsService } from "../services/settings.service";
import type { PostgresStorage } from "../storage-postgres";

export type SettingsRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  clearTabVisibilityCache: () => void;
  invalidateRuntimeSettingsCache: () => void;
  invalidateMaintenanceCache: () => void;
  getMaintenanceStateCached: (force?: boolean) => Promise<MaintenanceState>;
  broadcastWsMessage: (payload: Record<string, unknown>) => void;
  importUploadLimitBytes?: number;
};

export type SettingsRouteContext = {
  app: Express;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  settingsService: SettingsService;
  safeImportUploadLimitBytes: number;
};

export function createSettingsRouteContext(
  app: Express,
  deps: SettingsRouteDeps,
): SettingsRouteContext {
  const settingsService = new SettingsService(deps.storage, {
    clearTabVisibilityCache: deps.clearTabVisibilityCache,
    invalidateRuntimeSettingsCache: deps.invalidateRuntimeSettingsCache,
    invalidateMaintenanceCache: deps.invalidateMaintenanceCache,
    getMaintenanceStateCached: deps.getMaintenanceStateCached,
    broadcastWsMessage: deps.broadcastWsMessage,
  });

  const safeImportUploadLimitBytes =
    Number.isFinite(deps.importUploadLimitBytes) && Number(deps.importUploadLimitBytes) > 0
      ? Math.floor(Number(deps.importUploadLimitBytes))
      : DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES;

  return {
    app,
    authenticateToken: deps.authenticateToken,
    requireRole: deps.requireRole,
    requireTabAccess: deps.requireTabAccess,
    settingsService,
    safeImportUploadLimitBytes,
  };
}
