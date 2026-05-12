import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { User, UserActivity } from "../../shared/schema-postgres";
import { ERROR_CODES } from "../../shared/error-codes";
import type { IStorage } from "../storage-postgres";
import { getSessionSecret } from "../config/security";
import { verifySessionJwt } from "./session-jwt";
import {
  canUserBypassForcedPasswordChange,
  getAccountAccessBlockReason,
} from "./account-lifecycle";
import { canAccessDuringForcedPasswordChange } from "./guard-forced-password-change";
import { getInvalidatedSessionMessage } from "./guard-session-messages";
import { clearAuthSessionCookie, readAuthSessionTokenFromHeaders } from "./session-cookie";
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
export { getInvalidatedSessionMessage } from "./guard-session-messages";

export interface AuthenticatedUser {
  userId?: string | undefined;
  username: string;
  role: string;
  activityId: string;
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
  };
  secret?: string;
  activityUpdateThrottleMs?: number;
};

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
    const token = readAuthSessionTokenFromHeaders(req.headers);

    if (!token) {
      clearAuthSessionCookie(res);
      return res.status(401).json({ message: "Token required" });
    }

    try {
      const decoded = verifySessionJwt<AuthenticatedUser>(token, secret) as AuthenticatedUser;
      const sessionExpiry = normalizeSessionExpiry(
        typeof decoded.exp === "number" ? decoded.exp * 1000 : null,
        { allowExpired: true },
      );
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

      await activityUpdates.updateAuthenticatedActivity(decoded.activityId);

      req.user = {
        userId: user.id || activity.userId || decoded.userId,
        username: user.username || activity.username || decoded.username,
        role: user.role || activity.role || decoded.role,
        activityId: decoded.activityId,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        passwordResetBySuperuser: user.passwordResetBySuperuser,
        isBanned: user.isBanned,
        sessionExpiresAt: sessionExpiry?.expiresAtIso ?? null,
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
