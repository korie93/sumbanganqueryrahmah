import type { Express, RequestHandler, Response } from "express";
import { WebSocket } from "ws";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import { ensureObject, readDate, readNonEmptyString, readStringList } from "../http/validation";
import type { PostgresStorage } from "../storage-postgres";

type ActivityRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  connectedClients: Map<string, WebSocket>;
};

function buildActivityFilters(source: Record<string, unknown>) {
  return {
    status: readStringList(source.status),
    username: readNonEmptyString(source.username),
    ipAddress: readNonEmptyString(source.ipAddress),
    browser: readNonEmptyString(source.browser),
    dateFrom: readDate(source.dateFrom),
    dateTo: readDate(source.dateTo),
  };
}

export function registerActivityRoutes(app: Express, deps: ActivityRouteDeps) {
  const { storage, authenticateToken, requireRole, requireTabAccess, connectedClients } = deps;

  const closeSocket = async (activityId: string, payload?: Record<string, unknown>) => {
    const socket = connectedClients.get(activityId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      if (payload) {
        socket.send(JSON.stringify(payload));
      }
      socket.close();
    }
    connectedClients.delete(activityId);
    await storage.clearCollectionNicknameSessionByActivity(activityId);
  };

  app.post("/api/activity/logout", authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ success: false });
    }

    const activityId = req.user.activityId;
    const activity = await storage.getActivityById(activityId);
    if (!activity || activity.isActive === false) {
      return res.json({ success: true });
    }

    await storage.updateActivity(activityId, {
      isActive: false,
      logoutTime: new Date(),
      logoutReason: "USER_LOGOUT",
    });

    await closeSocket(activityId, {
      type: "logout",
      reason: "User logged out",
    });

    await storage.createAuditLog({
      action: "LOGOUT",
      performedBy: req.user.username,
    });

    return res.json({ success: true });
  }));

  app.get(
    "/api/activity/all",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json({ activities: await storage.getAllActivities() });
    }),
  );

  app.get(
    "/api/activity/filter",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req, res) => {
      return res.json({ activities: await storage.getFilteredActivities(buildActivityFilters(req.query as Record<string, unknown>)) });
    }),
  );

  app.delete(
    "/api/activity/:id",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const activityId = readNonEmptyString(req.params.id);
      if (!activityId) {
        return res.status(400).json({ success: false, message: "Invalid activityId" });
      }

      await storage.deleteActivity(activityId);
      await closeSocket(activityId);
      return res.json({ success: true });
    }),
  );

  app.post(
    "/api/activity/kick",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = ensureObject(req.body) || {};
      const activityId = readNonEmptyString(body.activityId);
      if (!activityId) {
        return res.status(400).json({ success: false, message: "Invalid activityId" });
      }

      const activity = await storage.getActivityById(activityId);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      await storage.updateActivity(activityId, {
        isActive: false,
        logoutTime: new Date(),
        logoutReason: "KICKED",
      });

      await closeSocket(activityId, {
        type: "kicked",
        reason: "You have been logged out by an administrator.",
      });

      await storage.createAuditLog({
        action: "KICK_USER",
        performedBy: req.user!.username,
        targetUser: activity.username,
        details: `Kicked activityId=${activityId}`,
      });

      return res.json({ success: true });
    }),
  );

  app.post(
    "/api/activity/ban",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = ensureObject(req.body) || {};
      const activityId = readNonEmptyString(body.activityId);
      if (!activityId) {
        return res.status(400).json({ success: false, message: "Invalid activityId" });
      }

      const activity = await storage.getActivityById(activityId);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      const targetUser = await storage.getUserByUsername(activity.username);
      if (targetUser?.role === "superuser") {
        return res.status(403).json({ message: "Cannot ban a superuser" });
      }

      await storage.banVisitor({
        username: activity.username,
        role: activity.role,
        activityId: activity.id,
        fingerprint: activity.fingerprint ?? null,
        ipAddress: activity.ipAddress ?? null,
        browser: activity.browser ?? null,
        pcName: activity.pcName ?? null,
      });

      await storage.updateActivity(activityId, {
        isActive: false,
        logoutTime: new Date(),
        logoutReason: "BANNED",
      });

      await closeSocket(activityId, {
        type: "banned",
        reason: "Your account has been banned.",
      });

      await storage.createAuditLog({
        action: "BAN_USER",
        performedBy: req.user!.username,
        targetUser: activity.username,
        details: `Banned via activityId=${activityId}`,
      });

      return res.json({ success: true });
    }),
  );

  app.post("/api/admin/ban", authenticateToken, requireRole("superuser"), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = ensureObject(req.body) || {};
    const username = readNonEmptyString(body.username);
    if (!username) {
      return res.status(400).json({ message: "Username required" });
    }

    const targetUser = await storage.getUserByUsername(username);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }
    if (targetUser.role === "superuser") {
      return res.status(403).json({ message: "Cannot ban a superuser" });
    }

    const activeSessions = await storage.getActiveActivitiesByUsername(username);

    await storage.updateUserBan(username, true);
    await storage.deactivateUserActivities(username, "BANNED");

    for (const activity of activeSessions) {
      await closeSocket(activity.id, {
        type: "banned",
        reason: "Your account has been banned.",
      });
    }

    await storage.createAuditLog({
      action: "BAN_USER",
      performedBy: req.user!.username,
      targetUser: username,
      details: "Admin ban (account-level)",
    });

    return res.json({ success: true });
  }));

  app.post(
    "/api/admin/unban",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = ensureObject(req.body) || {};
      const banId = readNonEmptyString(body.banId);
      if (!banId) {
        return res.status(400).json({ message: "banId required" });
      }

      await storage.unbanVisitor(banId);
      await storage.createAuditLog({
        action: "UNBAN_USER",
        performedBy: req.user!.username,
        details: `Unbanned banId=${banId}`,
      });

      return res.json({ success: true });
    }),
  );

  app.get(
    "/api/users/banned",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      const bannedSessions = await storage.getBannedSessions();
      return res.json({
        users: bannedSessions.map((session) => ({
          visitorId: session.banId,
          banId: session.banId,
          username: session.username,
          role: session.role,
          banInfo: {
            ipAddress: session.ipAddress ?? null,
            browser: session.browser ?? null,
            bannedAt: session.bannedAt ?? null,
          },
        })),
      });
    }),
  );

  app.post("/api/activity/heartbeat", authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, message: "Unauthenticated" });
    }

    await storage.updateActivity(req.user.activityId, {
      lastActivityTime: new Date(),
      isActive: true,
    });

    return res.json({
      ok: true,
      status: "ONLINE",
      lastActivityTime: new Date().toISOString(),
    });
  }));

  app.get(
    "/api/activities",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json(await storage.getAllActivities());
    }),
  );

  app.get(
    "/api/activities/active",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json(await storage.getActiveActivities());
    }),
  );

  app.post(
    "/api/activities/filter",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req, res) => {
      const filters = buildActivityFilters(ensureObject(req.body) || {});
      return res.json(await storage.getFilteredActivities(filters));
    }),
  );
}
