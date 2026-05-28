import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { User, UserActivity } from "../../shared/schema-postgres";
import { ERROR_CODES } from "../../shared/error-codes";
import type { IStorage } from "../storage-postgres";
import { getSessionSecret } from "../config/security";
import {
  resolveSessionJwtExpiresAt,
  resolveSessionJwtId,
  shouldRefreshSessionJwt,
  signSessionJwtWithSecret,
  verifySessionJwt,
} from "./session-jwt";
import { parseAuthenticatedSessionJwtPayload } from "./session-jwt-payload";
import { isSessionJwtRevoked, revokeSessionJwt } from "./session-revocation-store";
import {
  canUserBypassForcedPasswordChange,
  getAccountAccessBlockReason,
} from "./account-lifecycle";
import { canAccessDuringForcedPasswordChange } from "./guard-forced-password-change";
import { getInvalidatedSessionMessage } from "./guard-session-messages";
import {
  AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_REFRESH_HEADER_NAME,
  clearAuthSessionCookie,
  readCookieValueFromHeader,
  refreshAuthSessionCookie,
} from "./session-cookie";
import { normalizeSessionExpiry } from "./session-lifetime";
import { logger } from "../lib/logger";
import {
  evictOldestTabVisibilityCacheEntry,
  sweepExpiredActivityUpdateCacheEntries,
  sweepExpiredTabVisibilityCacheEntries,
  type TabVisibilityCacheEntry,
} from "./guard-cache";
import { createActivityUpdateThrottler } from "./guard-activity-update";
import { createRoleTabVisibilityCache } from "./guard-tab-visibility";
import { loadAuthenticatedSessionSnapshot } from "./guard-session-snapshot";
import { internalMetrics } from "../internal/metrics";
export { getInvalidatedSessionMessage } from "./guard-session-messages";

export interface AuthenticatedUser {
  userId?: string | undefined;
  username: string;
  role: string;
  activityId: string;
  jti?: string | undefined;
  status?: string | undefined;
  mustChangePassword?: boolean | undefined;
  passwordResetBySuperuser?: boolean | undefined;
  isBanned?: boolean | null | undefined;
  sessionExpiresAt?: string | null | undefined;
  exp?: number | undefined;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

type CreateAuthGuardsOptions = {
  storage: Pick<
    IStorage,
    | "getActivityById"
    | "getUser"
    | "getUserByUsername"
    | "isVisitorBanned"
    | "updateActivity"
    | "getRoleTabVisibility"
  > & {
    getAuthenticatedSessionSnapshot?: (activityId: string) => Promise<{
      activity: UserActivity;
      user?: User | undefined;
      isVisitorBanned: boolean;
    } | undefined>;
    touchAuthenticatedActivity?: ((activityId: string) => Promise<UserActivity | undefined>) | undefined;
  };
  secret?: string;
  activityUpdateThrottleMs?: number;
  sessionRefreshRevocationRetry?: Partial<SessionRefreshRevocationRetryConfig>;
};

type AuthSessionTokenSource = "bearer" | "cookie";

type AuthSessionTokenReadResult = {
  source: AuthSessionTokenSource | null;
  token: string | null;
};

type RefreshedSessionToken = {
  exp?: number | undefined;
  jwtId?: string | undefined;
  sessionExpiresAtIso?: string | null | undefined;
};

type SessionRefreshRevocationRetryConfig = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  random: () => number;
};

type SessionRefreshRevocationLogContext = {
  method: string;
  path: string;
};

const MIN_SESSION_REFRESH_REVOCATION_RETRY_ATTEMPTS = 1;
const MAX_SESSION_REFRESH_REVOCATION_RETRY_ATTEMPTS = 5;
const DEFAULT_SESSION_REFRESH_REVOCATION_RETRY_ATTEMPTS = 3;
const DEFAULT_SESSION_REFRESH_REVOCATION_RETRY_BASE_DELAY_MS = 25;
const DEFAULT_SESSION_REFRESH_REVOCATION_RETRY_MAX_DELAY_MS = 250;
const SESSION_REFRESH_REVOCATION_BACKOFF_FACTOR = 2;
const RETRYABLE_SESSION_REVOCATION_ERROR_CODES = new Set([
  "CLUSTERDOWN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "LOADING",
  "NR_CLOSED",
  "SOCKET_CLOSED",
]);
const NON_RETRYABLE_SESSION_REVOCATION_ERROR_CODES = new Set([
  "NOAUTH",
  "NOPERM",
  "READONLY",
  "WRONGPASS",
  "WRONGTYPE",
]);

function normalizeRetryAttempts(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SESSION_REFRESH_REVOCATION_RETRY_ATTEMPTS;
  }

  const normalizedValue = Math.trunc(Number(value));
  return Math.min(
    MAX_SESSION_REFRESH_REVOCATION_RETRY_ATTEMPTS,
    Math.max(MIN_SESSION_REFRESH_REVOCATION_RETRY_ATTEMPTS, normalizedValue),
  );
}

function normalizeRetryDelayMs(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(Number(value)));
}

function normalizeRetryRandom(value: (() => number) | undefined): () => number {
  if (typeof value !== "function") {
    return Math.random;
  }

  return () => {
    const randomValue = Number(value());
    if (!Number.isFinite(randomValue)) {
      return Math.random();
    }
    return Math.min(1, Math.max(0, randomValue));
  };
}

function resolveSessionRefreshRevocationRetryConfig(
  options: Partial<SessionRefreshRevocationRetryConfig> | undefined,
): SessionRefreshRevocationRetryConfig {
  const baseDelayMs = normalizeRetryDelayMs(
    options?.baseDelayMs,
    DEFAULT_SESSION_REFRESH_REVOCATION_RETRY_BASE_DELAY_MS,
  );
  const maxDelayMs = normalizeRetryDelayMs(
    options?.maxDelayMs,
    DEFAULT_SESSION_REFRESH_REVOCATION_RETRY_MAX_DELAY_MS,
  );

  return {
    attempts: normalizeRetryAttempts(options?.attempts),
    baseDelayMs,
    maxDelayMs: Math.max(baseDelayMs, maxDelayMs),
    random: normalizeRetryRandom(options?.random),
  };
}

function resolveSessionRefreshRevocationRetryDelayMs(
  failedAttemptIndex: number,
  config: SessionRefreshRevocationRetryConfig,
): number {
  const exponentialDelayMs =
    config.baseDelayMs * (SESSION_REFRESH_REVOCATION_BACKOFF_FACTOR ** failedAttemptIndex);
  const cappedDelayMs = Math.min(config.maxDelayMs, exponentialDelayMs);
  return Math.floor(config.random() * cappedDelayMs);
}

async function sleepSessionRefreshRevocationRetry(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

type SessionRefreshRevocationErrorLike = {
  code?: unknown;
  name?: unknown;
};

function readSessionRefreshRevocationErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }
  const errorLike = error as SessionRefreshRevocationErrorLike;
  return typeof errorLike.code === "string" ? errorLike.code.trim().toUpperCase() : "";
}

function readSessionRefreshRevocationErrorName(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }
  const errorLike = error as SessionRefreshRevocationErrorLike;
  return typeof errorLike.name === "string" ? errorLike.name.trim() : "";
}

function isSessionRefreshRevocationRetryableError(error: unknown): boolean {
  const code = readSessionRefreshRevocationErrorCode(error);
  if (NON_RETRYABLE_SESSION_REVOCATION_ERROR_CODES.has(code)) {
    return false;
  }
  if (RETRYABLE_SESSION_REVOCATION_ERROR_CODES.has(code)) {
    return true;
  }

  const name = readSessionRefreshRevocationErrorName(error).toLowerCase();
  return name.includes("connection")
    || name.includes("socket")
    || name.includes("timeout")
    || name.includes("unavailable");
}

function sanitizeSessionRefreshRevocationError(error: unknown) {
  const code = readSessionRefreshRevocationErrorCode(error);
  const name = readSessionRefreshRevocationErrorName(error);
  return {
    ...(code ? { code } : {}),
    ...(name ? { name } : {}),
    retryable: isSessionRefreshRevocationRetryableError(error),
  };
}

async function revokeSessionJwtForRefresh(
  record: Parameters<typeof revokeSessionJwt>[0],
  context: SessionRefreshRevocationLogContext,
  config: SessionRefreshRevocationRetryConfig,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.attempts; attempt += 1) {
    try {
      await revokeSessionJwt(record);
      return;
    } catch (error) {
      lastError = error;
      internalMetrics.increment("sessionRevocationRedisErrorsTotal");
      const retryable = isSessionRefreshRevocationRetryableError(error);

      if (!retryable || attempt >= config.attempts) {
        if (retryable) {
          internalMetrics.increment("sessionRefreshRevocationRetryExhaustedTotal");
        }
        break;
      }

      const retryAfterMs = resolveSessionRefreshRevocationRetryDelayMs(attempt - 1, config);
      internalMetrics.increment("sessionRefreshRevocationRetryAttemptsTotal");
      logger.warn("Retrying JWT refresh revocation after failure", {
        event: "session_refresh_revocation_retry",
        operation: "revoke",
        path: context.path,
        method: context.method,
        attempt,
        max: config.attempts,
        retryAfterMs,
        error: sanitizeSessionRefreshRevocationError(error),
      });
      await sleepSessionRefreshRevocationRetry(retryAfterMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Session refresh revocation failed");
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return String(value[0] || "");
  }
  return String(value || "");
}

function readAuthSessionToken(req: Request): AuthSessionTokenReadResult {
  const rawAuthorization = firstHeaderValue(req.headers.authorization).trim();
  if (rawAuthorization.toLowerCase().startsWith("bearer ")) {
    const bearerToken = rawAuthorization.slice(7).trim();
    if (bearerToken) {
      return { source: "bearer", token: bearerToken };
    }
  }

  const cookieToken = readCookieValueFromHeader(req.headers.cookie, AUTH_SESSION_COOKIE_NAME);
  if (cookieToken) {
    return { source: "cookie", token: cookieToken };
  }

  return { source: null, token: null };
}

export function createAuthGuards(options: CreateAuthGuardsOptions) {
  const storage = options.storage;
  const secret = options.secret || getSessionSecret();
  const sessionRefreshRevocationRetry = resolveSessionRefreshRevocationRetryConfig(
    options.sessionRefreshRevocationRetry,
  );
  const tabVisibility = createRoleTabVisibilityCache({ storage });
  const activityUpdates = createActivityUpdateThrottler({
    activityUpdateThrottleMs: options.activityUpdateThrottleMs,
    storage,
  });

  const authenticateToken: RequestHandler = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const { source: tokenSource, token } = readAuthSessionToken(req);

    if (!token) {
      clearAuthSessionCookie(res);
      return res.status(401).json({ message: "Token required" });
    }

    try {
      const decoded = parseAuthenticatedSessionJwtPayload(verifySessionJwt<unknown>(token, secret));
      const sessionExpiry = normalizeSessionExpiry(
        typeof decoded.exp === "number" ? decoded.exp * 1000 : null,
      );
      if (await isSessionJwtRevoked(decoded.jti)) {
        clearAuthSessionCookie(res);
        return res.status(401).json({
          message: "Session expired. Please login again.",
          forceLogout: true,
        });
      }
      const { activity, user, isVisitorBanned } = await loadAuthenticatedSessionSnapshot(storage, decoded);

      if (!activity || activity.isActive === false || activity.logoutTime !== null) {
        clearAuthSessionCookie(res);
        return res.status(401).json({
          message: getInvalidatedSessionMessage(activity?.logoutReason),
          forceLogout: true,
        });
      }

      if (isVisitorBanned) {
        clearAuthSessionCookie(res);
        return res.status(401).json({
          message: "Session banned. Please login again.",
          forceLogout: true,
        });
      }

      if (!user) {
        await storage.updateActivity(decoded.activityId, {
          isActive: false,
          logoutTime: new Date(),
          logoutReason: "USER_NOT_FOUND",
        });
        clearAuthSessionCookie(res);
        return res.status(401).json({
          message: "Session expired. Please login again.",
          forceLogout: true,
        });
      }

      const blockReason = getAccountAccessBlockReason(user);
      if (blockReason) {
        await storage.updateActivity(decoded.activityId, {
          isActive: false,
          logoutTime: new Date(),
          logoutReason: blockReason.toUpperCase(),
        });
        clearAuthSessionCookie(res);
        return res.status(blockReason === "banned" ? 403 : blockReason === "locked" ? 423 : 401).json({
          message: blockReason === "banned"
            ? "Account is banned"
            : blockReason === "locked"
              ? "Your account has been locked due to too many incorrect login attempts. Please contact the system administrator."
              : "Session expired. Please login again.",
          banned: blockReason === "banned",
          locked: blockReason === "locked",
          forceLogout: true,
          code:
            blockReason === "banned"
              ? ERROR_CODES.ACCOUNT_BANNED
              : blockReason === "locked"
                ? ERROR_CODES.ACCOUNT_LOCKED
                : ERROR_CODES.ACCOUNT_UNAVAILABLE,
        });
      }

      const forcePasswordChange =
        user.mustChangePassword === true && !canUserBypassForcedPasswordChange(user.role);
      if (forcePasswordChange && !canAccessDuringForcedPasswordChange(req.method, req.path)) {
        return res.status(403).json({
          message: "Password change required before accessing the application.",
          code: ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
          forcePasswordChange: true,
        });
      }

      const missingIdentityFields = [
        user.id == null ? "userId" : null,
        user.username == null ? "username" : null,
        user.role == null ? "role" : null,
      ].filter((field): field is string => field !== null);

      if (missingIdentityFields.length > 0) {
        internalMetrics.increment("authIdentityFallbackTotal");
        logger.warn("Authenticated session invalidated because database identity fields are missing", {
          missingIdentityFields,
          activityFallbackAvailable: {
            userId: activity.userId != null,
            username: activity.username != null,
            role: activity.role != null,
          },
          tokenFallbackAvailable: {
            userId: decoded.userId != null,
            username: decoded.username != null,
            role: decoded.role != null,
          },
        });
        await storage.updateActivity(decoded.activityId, {
          isActive: false,
          logoutTime: new Date(),
          logoutReason: "USER_IDENTITY_INCOMPLETE",
        });
        clearAuthSessionCookie(res);
        return res.status(401).json({
          message: "Session expired. Please login again.",
          forceLogout: true,
          code: ERROR_CODES.ACCOUNT_UNAVAILABLE,
        });
      }

      const activityUpdateResult = await activityUpdates.updateAuthenticatedActivity(decoded.activityId);
      if (activityUpdateResult === "stale") {
        clearAuthSessionCookie(res);
        return res.status(401).json({
          message: "Session expired. Please login again.",
          forceLogout: true,
        });
      }

      let refreshedSessionToken: RefreshedSessionToken | null = null;
      if (tokenSource && shouldRefreshSessionJwt(decoded)) {
        const refreshedToken = signSessionJwtWithSecret(
          {
            userId: user.id,
            username: user.username,
            role: user.role,
            activityId: decoded.activityId,
          },
          secret,
        );
        const refreshedExpiry = normalizeSessionExpiry(resolveSessionJwtExpiresAt(refreshedToken));
        const refreshedJwtId = resolveSessionJwtId(refreshedToken) ?? undefined;

        try {
          await revokeSessionJwtForRefresh(
            {
              jwtId: decoded.jti || "",
              expiresAtMs: sessionExpiry?.expiresAtMs ?? 0,
            },
            {
              path: req.path,
              method: req.method,
            },
            sessionRefreshRevocationRetry,
          );
        } catch (error) {
          logger.error("Failed to revoke previous JWT during authenticated session refresh", {
            path: req.path,
            method: req.method,
            error: sanitizeSessionRefreshRevocationError(error),
          });
          clearAuthSessionCookie(res);
          return res.status(503).json({
            message: "Session refresh is temporarily unavailable. Please try again.",
            code: "SESSION_REFRESH_UNAVAILABLE",
          });
        }

        if (tokenSource === "cookie") {
          refreshAuthSessionCookie(res, refreshedToken);
        } else {
          res.setHeader(AUTH_SESSION_REFRESH_HEADER_NAME, refreshedToken);
        }

        refreshedSessionToken = {
          exp: refreshedExpiry ? Math.floor(refreshedExpiry.expiresAtMs / 1000) : undefined,
          jwtId: refreshedJwtId,
          sessionExpiresAtIso: refreshedExpiry?.expiresAtIso ?? sessionExpiry?.expiresAtIso ?? null,
        };
      }

      req.user = {
        userId: user.id,
        username: user.username,
        role: user.role,
        activityId: decoded.activityId,
        jti: refreshedSessionToken?.jwtId ?? decoded.jti,
        exp: refreshedSessionToken?.exp ?? decoded.exp,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        passwordResetBySuperuser: user.passwordResetBySuperuser,
        isBanned: user.isBanned,
        sessionExpiresAt: refreshedSessionToken?.sessionExpiresAtIso ?? sessionExpiry?.expiresAtIso ?? null,
      };

      return next();
    } catch (error) {
      logger.debug("Token validation failed", {
        path: req.path,
        method: req.method,
        error: (error as Error)?.message,
      });
      clearAuthSessionCookie(res);
      return res.status(401).json({ message: "Invalid token" });
    }
  };

  const requireRole = (...roles: string[]): RequestHandler => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthenticated" });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      return next();
    };
  };

  const requireTabAccess = (tabId: string): RequestHandler => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const role = req.user?.role;
        if (!role) {
          return res.status(401).json({ message: "Unauthenticated" });
        }
        if (role === "superuser") {
          return next();
        }
        if (role !== "admin" && role !== "user") {
          return res.status(403).json({ message: "Insufficient permissions" });
        }

        const tabs = await tabVisibility.getRoleTabVisibilityCached(role);
        const hasExplicit = Object.prototype.hasOwnProperty.call(tabs, tabId);
        const enabled = hasExplicit ? tabs[tabId] !== false : false;

        if (!enabled) {
          return res.status(403).json({ message: `Tab '${tabId}' is disabled for role '${role}'` });
        }

        return next();
      } catch (error) {
        logger.error("Tab access guard error", {
          tabId,
          message: (error as Error)?.message,
        });
        return res.status(500).json({ message: "Failed to validate tab access" });
      }
    };
  };

  const requireMonitorAccess: RequestHandler = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const role = req.user?.role;
      if (!role) {
        return res.status(401).json({ message: "Unauthenticated" });
      }
      if (role === "superuser") {
        return next();
      }
      if (role !== "admin" && role !== "user") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const tabs = await tabVisibility.getRoleTabVisibilityCached(role);
      if (tabs.monitor !== true) {
        return res.status(403).json({ message: "System Monitor access is disabled for this role." });
      }

      return next();
    } catch (error) {
      logger.error("Monitor access guard error", {
        message: (error as Error)?.message,
      });
      return res.status(500).json({ message: "Failed to validate monitor access" });
    }
  };

  return {
    authenticateToken,
    requireRole,
    requireTabAccess,
    requireMonitorAccess,
    clearTabVisibilityCache() {
      tabVisibility.clear();
    },
    clearActivityUpdateCache() {
      activityUpdates.clear();
    },
    stopActivityUpdateCacheSweep: activityUpdates.stop,
    stopTabVisibilityCacheSweep: tabVisibility.stop,
  };
}

export function evictOldestTabVisibilityCacheEntryForTests(
  cache: Map<string, TabVisibilityCacheEntry>,
): string | null {
  return evictOldestTabVisibilityCacheEntry(cache);
}

export function sweepExpiredTabVisibilityCacheEntriesForTests(
  cache: Map<string, TabVisibilityCacheEntry>,
  now?: number,
): number {
  return sweepExpiredTabVisibilityCacheEntries(cache, now);
}

export function sweepExpiredActivityUpdateCacheEntriesForTests(
  cache: Map<string, number>,
  now?: number,
): number {
  return sweepExpiredActivityUpdateCacheEntries(cache, now);
}
