import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import type { IStorage } from "../storage-postgres";
import { getSessionSecret } from "../config/security";
import {
  canUserBypassForcedPasswordChange,
  getAccountAccessBlockReason,
} from "./account-lifecycle";
import { clearAuthSessionCookie, readAuthSessionTokenFromHeaders } from "./session-cookie";
import { logger } from "../lib/logger";

export interface AuthenticatedUser {
  userId?: string;
  username: string;
  role: string;
  activityId: string;
  status?: string;
  mustChangePassword?: boolean;
  passwordResetBySuperuser?: boolean;
  isBanned?: boolean | null;
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
  >;
  secret?: string;
};

const TAB_VISIBILITY_CACHE_TTL_MS = 5_000;
const FORCED_PASSWORD_CHANGE_ALLOWLIST = new Set([
  "GET:/api/auth/me",
  "GET:/api/me",
  "POST:/api/auth/change-password",
  "PATCH:/api/me/credentials",
  "POST:/api/activity/logout",
  "POST:/api/activity/heartbeat",
]);

function canAccessDuringForcedPasswordChange(method: string, path: string) {
  return FORCED_PASSWORD_CHANGE_ALLOWLIST.has(`${method.toUpperCase()}:${path}`);
}

export function createAuthGuards(options: CreateAuthGuardsOptions) {
  const storage = options.storage;
  const secret = options.secret || getSessionSecret();
  const tabVisibilityCache = new Map<string, { tabs: Record<string, boolean>; cachedAt: number }>();

  async function getRoleTabVisibilityCached(role: string): Promise<Record<string, boolean>> {
    if (role === "superuser") return {};
    const now = Date.now();
    const cached = tabVisibilityCache.get(role);
    if (cached && now - cached.cachedAt < TAB_VISIBILITY_CACHE_TTL_MS) {
      return cached.tabs;
    }

    const tabs = await storage.getRoleTabVisibility(role);
    tabVisibilityCache.set(role, { tabs, cachedAt: now });
    return tabs;
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
      const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] }) as AuthenticatedUser;
      const activity = await storage.getActivityById(decoded.activityId);

      if (!activity || activity.isActive === false || activity.logoutTime !== null) {
        clearAuthSessionCookie(res);
        return res.status(401).json({
          message: "Session expired. Please login again.",
          forceLogout: true,
        });
      }

      const isVisitorBanned = await storage.isVisitorBanned(
        activity.fingerprint ?? null,
        activity.ipAddress ?? null,
      );

      if (isVisitorBanned) {
        clearAuthSessionCookie(res);
        return res.status(401).json({
          message: "Session banned. Please login again.",
          forceLogout: true,
        });
      }

      const user = activity.userId
        ? await storage.getUser(activity.userId)
        : await storage.getUserByUsername(activity.username || decoded.username);

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
        return res.status(blockReason === "banned" ? 403 : 401).json({
          message: blockReason === "banned"
            ? "Account is banned"
            : "Session expired. Please login again.",
          banned: blockReason === "banned",
          forceLogout: true,
          code: blockReason === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_UNAVAILABLE",
        });
      }

      const forcePasswordChange =
        user.mustChangePassword === true && !canUserBypassForcedPasswordChange(user.role);
      if (forcePasswordChange && !canAccessDuringForcedPasswordChange(req.method, req.path)) {
        return res.status(403).json({
          message: "Password change required before accessing the application.",
          code: "PASSWORD_CHANGE_REQUIRED",
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
      if (!req.user || !roles.includes(req.user.role)) {
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
  };
}
