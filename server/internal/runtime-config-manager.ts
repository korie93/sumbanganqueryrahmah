import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { AuthenticatedRequest } from "../auth/guards";
import { readAuthSessionTokenFromHeaders } from "../auth/session-cookie";
import type { MaintenanceState } from "../config/system-settings";
import type { PostgresStorage } from "../storage-postgres";

export type RuntimeSettings = {
  sessionTimeoutMinutes: number;
  wsIdleMinutes: number;
  aiEnabled: boolean;
  semanticSearchEnabled: boolean;
  aiTimeoutMs: number;
  searchResultLimit: number;
  viewerRowsPerPage: number;
};

type RuntimeConfigManagerOptions = {
  storage: Pick<PostgresStorage, "getAppConfig" | "getMaintenanceState">;
  secret: string;
  defaults: {
    sessionTimeoutMinutes: number;
    wsIdleMinutes: number;
    aiTimeoutMs: number;
    searchResultLimit: number;
    viewerRowsPerPage: number;
  };
  maintenanceCacheTtlMs: number;
  runtimeSettingsCacheTtlMs: number;
};

export function createRuntimeConfigManager(options: RuntimeConfigManagerOptions): {
  invalidateMaintenanceCache: () => void;
  invalidateRuntimeSettingsCache: () => void;
  getRuntimeSettingsCached: (force?: boolean) => Promise<RuntimeSettings>;
  getMaintenanceStateCached: (force?: boolean) => Promise<MaintenanceState>;
  maintenanceGuard: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void | Response>;
} {
  const {
    storage,
    secret,
    defaults,
    maintenanceCacheTtlMs,
    runtimeSettingsCacheTtlMs,
  } = options;

  let maintenanceCache: { state: MaintenanceState; cachedAt: number } | null = null;
  let runtimeSettingsCache: { settings: RuntimeSettings; cachedAt: number } | null = null;

  const invalidateMaintenanceCache = () => {
    maintenanceCache = null;
  };

  const invalidateRuntimeSettingsCache = () => {
    runtimeSettingsCache = null;
  };

  const getRuntimeSettingsCached = async (force = false): Promise<RuntimeSettings> => {
    const now = Date.now();
    if (!force && runtimeSettingsCache && now - runtimeSettingsCache.cachedAt < runtimeSettingsCacheTtlMs) {
      return runtimeSettingsCache.settings;
    }

    const config = await storage.getAppConfig();
    const settings: RuntimeSettings = {
      sessionTimeoutMinutes: Number.isFinite(config.sessionTimeoutMinutes)
        ? Math.max(1, config.sessionTimeoutMinutes)
        : defaults.sessionTimeoutMinutes,
      wsIdleMinutes: Number.isFinite(config.wsIdleMinutes)
        ? Math.max(1, config.wsIdleMinutes)
        : defaults.wsIdleMinutes,
      aiEnabled: config.aiEnabled !== false,
      semanticSearchEnabled: config.semanticSearchEnabled !== false,
      aiTimeoutMs: Number.isFinite(config.aiTimeoutMs)
        ? Math.max(1000, config.aiTimeoutMs)
        : defaults.aiTimeoutMs,
      searchResultLimit: Number.isFinite(config.searchResultLimit)
        ? Math.min(5000, Math.max(10, Math.floor(config.searchResultLimit)))
        : defaults.searchResultLimit,
      viewerRowsPerPage: Number.isFinite(config.viewerRowsPerPage)
        ? Math.min(500, Math.max(10, Math.floor(config.viewerRowsPerPage)))
        : defaults.viewerRowsPerPage,
    };

    runtimeSettingsCache = { settings, cachedAt: now };
    return settings;
  };

  const getMaintenanceStateCached = async (force = false): Promise<MaintenanceState> => {
    const now = Date.now();
    if (!force && maintenanceCache && now - maintenanceCache.cachedAt < maintenanceCacheTtlMs) {
      return maintenanceCache.state;
    }

    const state = await storage.getMaintenanceState(new Date());
    maintenanceCache = { state, cachedAt: now };
    return state;
  };

  const extractRoleFromToken = (req: Request): string | null => {
    const token = readAuthSessionTokenFromHeaders(req.headers);
    if (!token) return null;

    try {
      const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] }) as { role?: string };
      return decoded?.role || null;
    } catch {
      return null;
    }
  };

  const isMaintenanceBypassPath = (pathname: string) =>
    pathname.startsWith("/api/login")
      || pathname.startsWith("/api/auth/login")
      || pathname.startsWith("/api/health")
      || pathname.startsWith("/api/maintenance-status")
      || pathname.startsWith("/api/settings/maintenance")
      || pathname.startsWith("/internal/")
      || pathname.startsWith("/ws");

  const maintenanceGuard = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (isMaintenanceBypassPath(req.path)) {
        return next();
      }

      const state = await getMaintenanceStateCached();
      if (!state.maintenance) {
        return next();
      }

      const role = req.user?.role || extractRoleFromToken(req);
      if (role === "superuser" || role === "admin") {
        return next();
      }

      const maintenanceResponse = {
        maintenance: true,
        message: state.message,
        type: state.type,
        startTime: state.startTime,
        endTime: state.endTime,
      };

      if (req.path.startsWith("/api/")) {
        if (state.type === "soft") {
          const blockedSoftPrefixes = ["/api/search", "/api/imports", "/api/ai"];
          if (!blockedSoftPrefixes.some((prefix) => req.path.startsWith(prefix))) {
            return next();
          }
        }
        return res.status(503).json(maintenanceResponse);
      }

      if (req.path.startsWith("/assets/") || req.path.match(/\.(js|css|png|jpg|svg|ico)$/i)) {
        return next();
      }

      if (state.type === "hard" && req.path !== "/maintenance") {
        return res.redirect(302, "/maintenance");
      }

      return next();
    } catch (err) {
      console.error("Maintenance guard error:", err);
      return next();
    }
  };

  return {
    invalidateMaintenanceCache,
    invalidateRuntimeSettingsCache,
    getRuntimeSettingsCached,
    getMaintenanceStateCached,
    maintenanceGuard,
  };
}
