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
          await revokeSessionJwt({
            jwtId: decoded.jti || "",
            expiresAtMs: sessionExpiry?.expiresAtMs ?? 0,
          });
        } catch (error) {
          logger.error("Failed to revoke previous JWT during authenticated session refresh", {
            path: req.path,
            method: req.method,
            error: error instanceof Error ? error.message : "Unknown session refresh revocation failure",
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
