import type { Express, RequestHandler } from "express";
import { WebSocket } from "ws";
import { ensureObject, readDate, readNonEmptyString, readStringList } from "../http/validation";
import { createAuthRouteRateLimiters, type AuthRouteRateLimiters } from "../middleware/rate-limit";
import { ActivityService } from "../services/activity.service";
import type { PostgresStorage } from "../storage-postgres";

export type ActivityRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  connectedClients: Map<string, WebSocket>;
  rateLimiters?: Pick<AuthRouteRateLimiters, "adminAction">;
};

export type ActivityRouteContext = {
  app: Express;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  adminActionRateLimiter: RequestHandler;
  activityService: ActivityService;
};

export function buildActivitySuccessPayload<T extends Record<string, unknown>>(payload?: T) {
  return {
    ok: true as const,
    success: true as const,
    ...(payload ?? {}),
  };
}

export function buildActivityErrorPayload(
  message?: string,
  extra?: Record<string, unknown>,
) {
  return {
    ok: false as const,
    ...(message ? { message } : {}),
    ...(extra ?? {}),
  };
}

export function buildActivityFilters(source: Record<string, unknown>) {
  return {
    status: readStringList(source.status),
    username: readNonEmptyString(source.username),
    ipAddress: readNonEmptyString(source.ipAddress),
    browser: readNonEmptyString(source.browser),
    dateFrom: readDate(source.dateFrom),
    dateTo: readDate(source.dateTo),
  };
}

export function readActivityBodyObject(source: unknown) {
  return ensureObject(source) || {};
}

export function createActivityRouteContext(
  app: Express,
  deps: ActivityRouteDeps,
): ActivityRouteContext {
  return {
    app,
    authenticateToken: deps.authenticateToken,
    requireRole: deps.requireRole,
    requireTabAccess: deps.requireTabAccess,
    adminActionRateLimiter:
      deps.rateLimiters?.adminAction ?? createAuthRouteRateLimiters().adminAction,
    activityService: new ActivityService(deps.storage, deps.connectedClients),
  };
}
