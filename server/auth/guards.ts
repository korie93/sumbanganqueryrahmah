import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { User, UserActivity } from "../../shared/schema-postgres";
import { ERROR_CODES } from "../../shared/error-codes";
import type { IStorage } from "../storage-postgres";
import { getSessionSecret } from "../config/security";
import { verifySessionJwt } from "./session-jwt";
import { z } from "zod";
import {
  canUserBypassForcedPasswordChange,
  getAccountAccessBlockReason,
} from "./account-lifecycle";
import { isSessionRevoked, revokeSession } from "./session-revocation-registry";
import { clearAuthSessionCookie, readAuthSessionTokenFromHeaders } from "./session-cookie";
import { logger } from "../lib/logger";

export interface AuthenticatedUser {
  userId?: string | undefined;
  username: string;
  role: string;
  activityId: string;
  status?: string | undefined;
  mustChangePassword?: boolean | undefined;
  passwordResetBySuperuser?: boolean | undefined;
  isBanned?: boolean | null | undefined;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

type CreateAuthGuardsOptions = {
  storage: Pick<
    IStorage,
    | "updateActivity"
    | "getRoleTabVisibility"
  > & {
    getAuthenticatedSessionSnapshot: (activityId: string) => Promise<{
      activity: UserActivity;
      user?: User | undefined;
      isVisitorBanned: boolean;
    } | undefined>;
  };
  secret?: string;
};

type TabVisibilityCacheEntry = {
  tabs: Record<string, boolean>;
  cachedAt: number;
};

const TAB_VISIBILITY_CACHE_TTL_MS = 5 * 60 * 1000;
const TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS = TAB_VISIBILITY_CACHE_TTL_MS;
const TAB_VISIBILITY_CACHE_MAX_SIZE = 100;
const FORCED_PASSWORD_CHANGE_ALLOWLIST = new Set([
  "GET:/api/auth/me",
  "GET:/api/me",
  "POST:/api/auth/change-password",
  "PATCH:/api/me/credentials",
  "POST:/api/activity/logout",
  "POST:/api/activity/heartbeat",
]);

const authenticatedSessionTokenSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  username: z.string().trim().min(1),
  role: z.string().trim().min(1),
  activityId: z.string().trim().min(1),
  status: z.string().trim().min(1).optional(),
  mustChangePassword: z.boolean().optional(),
  passwordResetBySuperuser: z.boolean().optional(),
  isBanned: z.boolean().nullable().optional(),
});

function canAccessDuringForcedPasswordChange(method: string, path: string) {
  return FORCED_PASSWORD_CHANGE_ALLOWLIST.has(`${method.toUpperCase()}:${path}`);
}

export function getInvalidatedSessionMessage(logoutReason?: string | null): string {
  const normalized = String(logoutReason || "").trim().toUpperCase();

  if (normalized === "NEW_SESSION") {
    return "Your account was opened in another browser or device. Please login again.";
  }

  if (normalized === "PASSWORD_RESET_BY_SUPERUSER" || normalized === "PASSWORD_RESET_COMPLETED") {
    return "Password was reset. Please login again.";
  }

  if (normalized === "PASSWORD_CHANGED") {
    return "Password changed. Please login again.";
  }

  if (normalized === "ROLE_CHANGED") {
    return "Account role changed. Please login again.";
  }

  return "Session expired. Please login again.";
}

function evictOldestTabVisibilityCacheEntry(
  cache: Map<string, TabVisibilityCacheEntry>,
): string | null {
  let oldestKey: string | null = null;
  let oldestCachedAt = Number.POSITIVE_INFINITY;

  for (const [key, entry] of cache.entries()) {
    if (entry.cachedAt < oldestCachedAt) {
      oldestCachedAt = entry.cachedAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    cache.delete(oldestKey);
  }

  return oldestKey;
}

function sweepExpiredTabVisibilityCacheEntries(
  cache: Map<string, TabVisibilityCacheEntry>,
  now = Date.now(),
): number {
  let removed = 0;
  for (const [key, entry] of cache.entries()) {
    if (now - entry.cachedAt >= TAB_VISIBILITY_CACHE_TTL_MS) {
      cache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function createAuthGuards(options: CreateAuthGuardsOptions) {
  const storage = options.storage;
  const secret = options.secret || getSessionSecret();
  const tabVisibilityCache = new Map<string, TabVisibilityCacheEntry>();
  const tabVisibilityInflight = new Map<string, Promise<Record<string, boolean>>>();
  let tabVisibilitySweepStopped = false;
  const tabVisibilitySweepHandle = setInterval(() => {
    sweepExpiredTabVisibilityCacheEntries(tabVisibilityCache);
  }, TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS);
  tabVisibilitySweepHandle.unref?.();

  function setRoleTabVisibilityCache(role: string, tabs: Record<string, boolean>, cachedAt: number) {
    sweepExpiredTabVisibilityCacheEntries(tabVisibilityCache, cachedAt);

    if (!tabVisibilityCache.has(role)) {
      while (tabVisibilityCache.size >= TAB_VISIBILITY_CACHE_MAX_SIZE) {
        if (!evictOldestTabVisibilityCacheEntry(tabVisibilityCache)) {
          break;
        }
      }
    }

    tabVisibilityCache.set(role, { tabs, cachedAt });
  }

  async function getRoleTabVisibilityCached(role: string): Promise<Record<string, boolean>> {
    if (role === "superuser") return {};
    const now = Date.now();
    const cached = tabVisibilityCache.get(role);
    if (cached) {
      if (now - cached.cachedAt < TAB_VISIBILITY_CACHE_TTL_MS) {
        return cached.tabs;
      }

      tabVisibilityCache.delete(role);
    }

    const inFlight = tabVisibilityInflight.get(role);
    if (inFlight) {
      return inFlight;
    }

    const nextLookup = Promise.resolve(storage.getRoleTabVisibility(role))
      .then((tabs) => {
        setRoleTabVisibilityCache(role, tabs, now);
        return tabs;
      })
      .finally(() => {
        tabVisibilityInflight.delete(role);
      });

    tabVisibilityInflight.set(role, nextLookup);
    return nextLookup;
  }

  function stopTabVisibilityCacheSweep() {
    if (tabVisibilitySweepStopped) {
      return;
    }
    tabVisibilitySweepStopped = true;
    clearInterval(tabVisibilitySweepHandle);
    tabVisibilityCache.clear();
    tabVisibilityInflight.clear();
  }

  async function loadAuthenticatedSessionSnapshot(decoded: AuthenticatedUser): Promise<{
    activity: UserActivity | undefined;
    user?: User | undefined;
    isVisitorBanned: boolean;
  }> {
    const snapshot = await storage.getAuthenticatedSessionSnapshot(decoded.activityId);
    if (!snapshot) {
      return {
        activity: undefined,
        user: undefined,
        isVisitorBanned: false,
      };
    }

    return {
      activity: snapshot.activity,
      user: snapshot.user,
      isVisitorBanned: snapshot.isVisitorBanned,
    };
  }

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
      const decoded = authenticatedSessionTokenSchema.parse(verifySessionJwt<unknown>(token, secret));
      if (isSessionRevoked(decoded.activityId)) {
        clearAuthSessionCookie(res);
        return res.status(401).json({
          message: "Session revoked. Please login again.",
          forceLogout: true,
        });
      }
      const { activity, user, isVisitorBanned } = await loadAuthenticatedSessionSnapshot(decoded);

      if (!activity || activity.isActive === false || activity.logoutTime !== null) {
        revokeSession(decoded.activityId);
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
        revokeSession(decoded.activityId);
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
        revokeSession(decoded.activityId);
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

      const currentRole = String(user.role || activity.role || decoded.role).trim().toLowerCase();
      const tokenRole = String(decoded.role || "").trim().toLowerCase();
      if (currentRole && tokenRole && currentRole !== tokenRole) {
        await storage.updateActivity(decoded.activityId, {
          isActive: false,
          logoutTime: new Date(),
          logoutReason: "ROLE_CHANGED",
        });
        revokeSession(decoded.activityId);
        clearAuthSessionCookie(res);
        return res.status(401).json({
          message: getInvalidatedSessionMessage("ROLE_CHANGED"),
          forceLogout: true,
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

      await storage.updateActivity(decoded.activityId, {
        lastActivityTime: new Date(),
        isActive: true,
      });

      req.user = {
        userId: user.id || activity.userId || decoded.userId,
        username: user.username || activity.username || decoded.username,
        role: user.role || activity.role || decoded.role,
        activityId: decoded.activityId,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        passwordResetBySuperuser: user.passwordResetBySuperuser,
        isBanned: user.isBanned,
      };

      return next();
    } catch (error) {
      logger.debug("Token validation failed", {
        path: req.path,
        method: req.method,
        error: (error as Error)?.message,
      });
      clearAuthSessionCookie(res);
      return res.status(403).json({ message: "Invalid token" });
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

        const tabs = await getRoleTabVisibilityCached(role);
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

      const tabs = await getRoleTabVisibilityCached(role);
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
      tabVisibilityCache.clear();
      tabVisibilityInflight.clear();
    },
    stopTabVisibilityCacheSweep,
  };
}

export function evictOldestTabVisibilityCacheEntryForTests(
  cache: Map<string, TabVisibilityCacheEntry>,
): string | null {
  let oldestKey: string | null = null;
  let oldestCachedAt = Number.POSITIVE_INFINITY;

  for (const [key, entry] of cache.entries()) {
    if (entry.cachedAt < oldestCachedAt) {
      oldestCachedAt = entry.cachedAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    cache.delete(oldestKey);
  }

  return oldestKey;
}

export function sweepExpiredTabVisibilityCacheEntriesForTests(
  cache: Map<string, TabVisibilityCacheEntry>,
  now?: number,
): number {
  return sweepExpiredTabVisibilityCacheEntries(cache, now);
}
