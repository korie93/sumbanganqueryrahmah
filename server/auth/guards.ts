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
  ACTIVITY_UPDATE_CACHE_MAX_SIZE,
  ACTIVITY_UPDATE_CACHE_SWEEP_INTERVAL_MS,
  ACTIVITY_UPDATE_THROTTLE_MS,
  TAB_VISIBILITY_CACHE_MAX_SIZE,
  TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS,
  TAB_VISIBILITY_CACHE_TTL_MS,
  evictOldestActivityUpdateCacheEntry,
  evictOldestTabVisibilityCacheEntry,
  sweepExpiredActivityUpdateCacheEntries,
  sweepExpiredTabVisibilityCacheEntries,
  type TabVisibilityCacheEntry,
} from "./guard-cache";
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
  const activityUpdateThrottleMs = Math.max(0, options.activityUpdateThrottleMs ?? ACTIVITY_UPDATE_THROTTLE_MS);
  const activityUpdateCache = new Map<string, number>();
  const tabVisibilityCache = new Map<string, TabVisibilityCacheEntry>();
  let tabVisibilitySweepStopped = false;
  let activityUpdateSweepStopped = false;
  const tabVisibilitySweepHandle = setInterval(() => {
    sweepExpiredTabVisibilityCacheEntries(tabVisibilityCache);
  }, TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS);
  tabVisibilitySweepHandle.unref?.();
  const activityUpdateSweepHandle = setInterval(() => {
    sweepExpiredActivityUpdateCacheEntries(activityUpdateCache);
  }, ACTIVITY_UPDATE_CACHE_SWEEP_INTERVAL_MS);
  activityUpdateSweepHandle.unref?.();

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

    const tabs = await storage.getRoleTabVisibility(role);
    setRoleTabVisibilityCache(role, tabs, now);
    return tabs;
  }

  function stopTabVisibilityCacheSweep() {
    if (tabVisibilitySweepStopped) {
      return;
    }
    tabVisibilitySweepStopped = true;
    clearInterval(tabVisibilitySweepHandle);
  }

  function stopActivityUpdateCacheSweep() {
    if (activityUpdateSweepStopped) {
      return;
    }
    activityUpdateSweepStopped = true;
    clearInterval(activityUpdateSweepHandle);
  }

  async function loadAuthenticatedSessionSnapshot(decoded: AuthenticatedUser): Promise<{
    activity: UserActivity | undefined;
    user?: User | undefined;
    isVisitorBanned: boolean;
  }> {
    if (storage.getAuthenticatedSessionSnapshot) {
      const snapshot = await storage.getAuthenticatedSessionSnapshot(decoded.activityId);
      if (snapshot) {
        return {
          activity: snapshot.activity,
          user: snapshot.user,
          isVisitorBanned: snapshot.isVisitorBanned,
        };
      }
    }

    const activity = await storage.getActivityById(decoded.activityId);
    if (!activity) {
      return {
        activity: undefined,
        user: undefined,
        isVisitorBanned: false,
      };
    }

    const [isVisitorBanned, user] = await Promise.all([
      storage.isVisitorBanned(
        activity.fingerprint ?? null,
        activity.ipAddress ?? null,
        activity.username || decoded.username,
      ),
      activity.userId
        ? storage.getUser(activity.userId)
        : storage.getUserByUsername(activity.username || decoded.username),
    ]);

    return {
      activity,
      user,
      isVisitorBanned,
    };
  }

  function reserveActivityUpdate(activityId: string, now: number) {
    if (activityUpdateThrottleMs <= 0) {
      return true;
    }

    sweepExpiredActivityUpdateCacheEntries(activityUpdateCache, now);
    const lastUpdatedAt = activityUpdateCache.get(activityId);
    if (lastUpdatedAt !== undefined && now - lastUpdatedAt < activityUpdateThrottleMs) {
      return false;
    }

    if (!activityUpdateCache.has(activityId)) {
      while (activityUpdateCache.size >= ACTIVITY_UPDATE_CACHE_MAX_SIZE) {
        if (!evictOldestActivityUpdateCacheEntry(activityUpdateCache)) {
          break;
        }
      }
    }

    activityUpdateCache.set(activityId, now);
    return true;
  }

  function releaseFailedActivityUpdateReservation(activityId: string, reservedAt: number) {
    if (activityUpdateThrottleMs > 0 && activityUpdateCache.get(activityId) === reservedAt) {
      activityUpdateCache.delete(activityId);
    }
  }

  async function updateAuthenticatedActivity(activityId: string) {
    const now = Date.now();
    if (!reserveActivityUpdate(activityId, now)) {
      return;
    }

    try {
      await storage.updateActivity(activityId, {
        lastActivityTime: new Date(now),
      });
    } catch (error) {
      releaseFailedActivityUpdateReservation(activityId, now);
      throw error;
    }
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
      const decoded = verifySessionJwt<AuthenticatedUser>(token, secret) as AuthenticatedUser;
      const sessionExpiry = normalizeSessionExpiry(
        typeof decoded.exp === "number" ? decoded.exp * 1000 : null,
        { allowExpired: true },
      );
      const { activity, user, isVisitorBanned } = await loadAuthenticatedSessionSnapshot(decoded);

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

      await updateAuthenticatedActivity(decoded.activityId);

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
    },
    clearActivityUpdateCache() {
      activityUpdateCache.clear();
    },
    stopActivityUpdateCacheSweep,
    stopTabVisibilityCacheSweep,
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
