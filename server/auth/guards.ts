import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { User, UserActivity } from "../../shared/schema-postgres";
import { ERROR_CODES, type ErrorCode } from "../../shared/error-codes";
import type { IStorage } from "../storage-postgres";
import { getSessionSecret } from "../config/security";
import {
  resolveSessionJwtExpiresAt,
  resolveSessionJwtId,
  shouldRefreshSessionJwt,
  signSessionJwtWithSecret,
  verifySessionJwt,
} from "./session-jwt";
import {
  parseAuthenticatedSessionJwtPayload,
  type AuthenticatedSessionJwtPayload,
} from "./session-jwt-payload";
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
import { buildApiErrorResponse } from "../http/api-error-response";
import { buildSecurityAuditDetails } from "../lib/security-audit-log";
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
    createAuditLog?: IStorage["createAuditLog"] | undefined;
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

type SignedRefreshedSessionToken = RefreshedSessionToken & {
  token: string;
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

const inFlightSessionRefreshes = new Map<string, Promise<SignedRefreshedSessionToken>>();

function buildAuthGuardErrorResponse(
  statusCode: number,
  message: string,
  options?: { code?: ErrorCode | undefined; extra?: Record<string, unknown> | undefined },
) {
  return buildApiErrorResponse(message, {
    statusCode,
    ...(options?.code ? { code: options.code } : {}),
    ...(options?.extra ? { extra: options.extra } : {}),
  });
}

async function recordAuthorizationDeniedAudit(params: {
  readonly action: "AUTHZ_PERMISSION_DENIED";
  readonly metadata: Record<string, string | number | boolean | null>;
  readonly req: AuthenticatedRequest;
  readonly storage: CreateAuthGuardsOptions["storage"];
  readonly targetResource: string;
}): Promise<void> {
  const createAuditLog = params.storage.createAuditLog;
  if (typeof createAuditLog !== "function") {
    return;
  }

  try {
    await createAuditLog({
      action: params.action,
      performedBy: params.req.user?.username ?? "unknown",
      targetUser: params.req.user?.userId ?? null,
      targetResource: params.targetResource,
      details: buildSecurityAuditDetails({
        event: "AUTHZ_PERMISSION_DENIED",
        outcome: "blocked",
        actorId: params.req.user?.userId,
        ipAddress: params.req.ip ?? params.req.socket?.remoteAddress ?? null,
        userAgent: Array.isArray(params.req.headers["user-agent"])
          ? params.req.headers["user-agent"].join(",")
          : params.req.headers["user-agent"],
        metadata: params.metadata,
        message: "Authorization guard denied access.",
      }),
    });
  } catch (error) {
    logger.error("Authorization denial audit log failed", {
      event: "authz_permission_denied_audit_failed",
      message: error instanceof Error ? error.message : "Unknown audit error",
      targetResource: params.targetResource,
    });
  }
}

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

async function refreshSessionJwtAfterRevocation(params: {
  config: SessionRefreshRevocationRetryConfig;
  context: SessionRefreshRevocationLogContext;
  decoded: AuthenticatedSessionJwtPayload;
  secret: string;
  sessionExpiry: ReturnType<typeof normalizeSessionExpiry>;
  user: User;
}): Promise<SignedRefreshedSessionToken> {
  const oldJwtId = String(params.decoded.jti || "").trim();
  if (!oldJwtId) {
    throw new Error("Cannot refresh a session JWT without a JWT id.");
  }

  const existingRefresh = inFlightSessionRefreshes.get(oldJwtId);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshPromise = Promise.resolve().then(async () => {
    // The replacement JWT is intentionally signed only after the previous
    // JTI has been durably revoked. This coalesces same-token concurrent
    // refreshes in-process and keeps the distributed race window bounded by
    // the revocation store's fail-closed semantics.
    await revokeSessionJwtForRefresh(
      {
        jwtId: oldJwtId,
        expiresAtMs: params.sessionExpiry?.expiresAtMs ?? 0,
      },
      params.context,
      params.config,
    );

    const token = signSessionJwtWithSecret(
      {
        userId: params.user.id,
        username: params.user.username,
        role: params.user.role,
        activityId: params.decoded.activityId,
      },
      params.secret,
    );
    const refreshedExpiry = normalizeSessionExpiry(resolveSessionJwtExpiresAt(token));
    const refreshedJwtId = resolveSessionJwtId(token) ?? undefined;

    return {
      token,
      exp: refreshedExpiry ? Math.floor(refreshedExpiry.expiresAtMs / 1000) : undefined,
      jwtId: refreshedJwtId,
      sessionExpiresAtIso: refreshedExpiry?.expiresAtIso ?? params.sessionExpiry?.expiresAtIso ?? null,
    };
  });

  inFlightSessionRefreshes.set(oldJwtId, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    if (inFlightSessionRefreshes.get(oldJwtId) === refreshPromise) {
      inFlightSessionRefreshes.delete(oldJwtId);
    }
  }
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
      return res.status(401).json(buildAuthGuardErrorResponse(401, "Token required", {
        code: "TOKEN_REQUIRED",
      }));
    }

    try {
      const decoded = parseAuthenticatedSessionJwtPayload(verifySessionJwt<unknown>(token, secret));
      const sessionExpiry = normalizeSessionExpiry(
        typeof decoded.exp === "number" ? decoded.exp * 1000 : null,
      );
      if (await isSessionJwtRevoked(decoded.jti)) {
        clearAuthSessionCookie(res);
        return res.status(401).json(buildAuthGuardErrorResponse(401, "Session expired. Please login again.", {
          code: ERROR_CODES.TOKEN_EXPIRED,
          extra: { forceLogout: true },
        }));
      }
      const { activity, user, isVisitorBanned } = await loadAuthenticatedSessionSnapshot(storage, decoded);

      if (!activity || activity.isActive === false || activity.logoutTime !== null) {
        clearAuthSessionCookie(res);
        return res.status(401).json(buildAuthGuardErrorResponse(401, getInvalidatedSessionMessage(activity?.logoutReason), {
          code: ERROR_CODES.TOKEN_EXPIRED,
          extra: { forceLogout: true },
        }));
      }

      if (isVisitorBanned) {
        clearAuthSessionCookie(res);
        return res.status(401).json(buildAuthGuardErrorResponse(401, "Session banned. Please login again.", {
          code: ERROR_CODES.ACCOUNT_BANNED,
          extra: { forceLogout: true },
        }));
      }

      if (!user) {
        await storage.updateActivity(decoded.activityId, {
          isActive: false,
          logoutTime: new Date(),
          logoutReason: "USER_NOT_FOUND",
        });
        clearAuthSessionCookie(res);
        return res.status(401).json(buildAuthGuardErrorResponse(401, "Session expired. Please login again.", {
          code: ERROR_CODES.USER_NOT_FOUND,
          extra: { forceLogout: true },
        }));
      }

      const blockReason = getAccountAccessBlockReason(user);
      if (blockReason) {
        await storage.updateActivity(decoded.activityId, {
          isActive: false,
          logoutTime: new Date(),
          logoutReason: blockReason.toUpperCase(),
        });
        clearAuthSessionCookie(res);
        const statusCode = blockReason === "banned" ? 403 : blockReason === "locked" ? 423 : 401;
        const message = blockReason === "banned"
          ? "Account is banned"
          : blockReason === "locked"
            ? "Your account has been locked due to too many incorrect login attempts. Please contact the system administrator."
            : "Session expired. Please login again.";
        const code = blockReason === "banned"
          ? ERROR_CODES.ACCOUNT_BANNED
          : blockReason === "locked"
            ? ERROR_CODES.ACCOUNT_LOCKED
            : ERROR_CODES.ACCOUNT_UNAVAILABLE;
        return res.status(statusCode).json(buildAuthGuardErrorResponse(statusCode, message, {
          code,
          extra: {
            banned: blockReason === "banned",
            locked: blockReason === "locked",
            forceLogout: true,
          },
        }));
      }

      const forcePasswordChange =
        user.mustChangePassword === true && !canUserBypassForcedPasswordChange(user.role);
      if (forcePasswordChange && !canAccessDuringForcedPasswordChange(req.method, req.path)) {
        return res.status(403).json(buildAuthGuardErrorResponse(403, "Password change required before accessing the application.", {
          code: ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
          extra: { forcePasswordChange: true },
        }));
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
        return res.status(401).json(buildAuthGuardErrorResponse(401, "Session expired. Please login again.", {
          code: ERROR_CODES.ACCOUNT_UNAVAILABLE,
          extra: { forceLogout: true },
        }));
      }

      const activityUpdateResult = await activityUpdates.updateAuthenticatedActivity(decoded.activityId);
      if (activityUpdateResult === "stale") {
        clearAuthSessionCookie(res);
        return res.status(401).json(buildAuthGuardErrorResponse(401, "Session expired. Please login again.", {
          code: ERROR_CODES.TOKEN_EXPIRED,
          extra: { forceLogout: true },
        }));
      }

      let refreshedSessionToken: RefreshedSessionToken | null = null;
      if (tokenSource && shouldRefreshSessionJwt(decoded)) {
        let refreshedToken: SignedRefreshedSessionToken;
        try {
          refreshedToken = await refreshSessionJwtAfterRevocation({
            config: sessionRefreshRevocationRetry,
            context: {
              path: req.path,
              method: req.method,
            },
            decoded,
            secret,
            sessionExpiry,
            user,
          });
        } catch (error) {
          logger.error("Failed to revoke previous JWT during authenticated session refresh", {
            path: req.path,
            method: req.method,
            error: sanitizeSessionRefreshRevocationError(error),
          });
          clearAuthSessionCookie(res);
          return res.status(503).json(buildAuthGuardErrorResponse(503, "Session refresh is temporarily unavailable. Please try again.", {
            code: "SESSION_REFRESH_UNAVAILABLE",
          }));
        }

        if (tokenSource === "cookie") {
          refreshAuthSessionCookie(res, refreshedToken.token);
        } else {
          res.setHeader(AUTH_SESSION_REFRESH_HEADER_NAME, refreshedToken.token);
        }

        refreshedSessionToken = {
          exp: refreshedToken.exp,
          jwtId: refreshedToken.jwtId,
          sessionExpiresAtIso: refreshedToken.sessionExpiresAtIso,
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
      return res.status(401).json(buildAuthGuardErrorResponse(401, "Invalid token", {
        code: ERROR_CODES.INVALID_TOKEN,
      }));
    }
  };

  const requireRole = (...roles: string[]): RequestHandler => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json(buildAuthGuardErrorResponse(401, "Unauthenticated"));
      }

      if (!roles.includes(req.user.role)) {
        await recordAuthorizationDeniedAudit({
          action: "AUTHZ_PERMISSION_DENIED",
          req,
          storage,
          targetResource: "role",
          metadata: {
            actual_role: req.user.role,
            required_roles_count: roles.length,
          },
        });
        return res.status(403).json(buildAuthGuardErrorResponse(403, "Insufficient permissions"));
      }
      return next();
    };
  };

  const requireTabAccess = (tabId: string): RequestHandler => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const role = req.user?.role;
        if (!role) {
          return res.status(401).json(buildAuthGuardErrorResponse(401, "Unauthenticated"));
        }
        if (role === "superuser") {
          return next();
        }
        if (role !== "admin" && role !== "user") {
          await recordAuthorizationDeniedAudit({
            action: "AUTHZ_PERMISSION_DENIED",
            req,
            storage,
            targetResource: `tab:${tabId}`,
            metadata: {
              actual_role: role,
              reason: "unsupported_role",
            },
          });
          return res.status(403).json(buildAuthGuardErrorResponse(403, "Insufficient permissions"));
        }

        const tabs = await tabVisibility.getRoleTabVisibilityCached(role);
        const hasExplicit = Object.prototype.hasOwnProperty.call(tabs, tabId);
        const enabled = hasExplicit ? tabs[tabId] !== false : false;

        if (!enabled) {
          await recordAuthorizationDeniedAudit({
            action: "AUTHZ_PERMISSION_DENIED",
            req,
            storage,
            targetResource: `tab:${tabId}`,
            metadata: {
              actual_role: role,
              reason: "tab_disabled",
            },
          });
          return res.status(403).json(buildAuthGuardErrorResponse(403, `Tab '${tabId}' is disabled for role '${role}'`, {
            code: "TAB_ACCESS_DISABLED",
          }));
        }

        return next();
      } catch (error) {
        logger.error("Tab access guard error", {
          tabId,
          message: (error as Error)?.message,
        });
        return res.status(500).json(buildAuthGuardErrorResponse(500, "Failed to validate tab access"));
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
        return res.status(401).json(buildAuthGuardErrorResponse(401, "Unauthenticated"));
      }
      if (role === "superuser") {
        return next();
      }
      if (role !== "admin" && role !== "user") {
        await recordAuthorizationDeniedAudit({
          action: "AUTHZ_PERMISSION_DENIED",
          req,
          storage,
          targetResource: "monitor",
          metadata: {
            actual_role: role,
            reason: "unsupported_role",
          },
        });
        return res.status(403).json(buildAuthGuardErrorResponse(403, "Insufficient permissions"));
      }

      const tabs = await tabVisibility.getRoleTabVisibilityCached(role);
      if (tabs.monitor !== true) {
        await recordAuthorizationDeniedAudit({
          action: "AUTHZ_PERMISSION_DENIED",
          req,
          storage,
          targetResource: "monitor",
          metadata: {
            actual_role: role,
            reason: "monitor_disabled",
          },
        });
        return res.status(403).json(buildAuthGuardErrorResponse(403, "System Monitor access is disabled for this role.", {
          code: "MONITOR_ACCESS_DISABLED",
        }));
      }

      return next();
    } catch (error) {
      logger.error("Monitor access guard error", {
        message: (error as Error)?.message,
      });
      return res.status(500).json(buildAuthGuardErrorResponse(500, "Failed to validate monitor access"));
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
    getTabVisibilityCacheStats: tabVisibility.getStats,
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
