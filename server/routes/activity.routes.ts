import type { Express, RequestHandler, Response } from "express";
import { WebSocket } from "ws";
import type { AuthenticatedRequest } from "../auth/guards";
import { ensureObject } from "../http/validation";
import type { PostgresStorage } from "../storage-postgres";

type ActivityRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  connectedClients: Map<string, WebSocket>;
};

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

  app.post("/api/activity/logout", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
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
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Failed to logout" });
    }
  });

  app.get(
    "/api/activity/all",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("activity"),
    async (_req, res) => {
      try {
        return res.json({ activities: await storage.getAllActivities() });
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load activities" });
      }
    },
  );

  app.get(
    "/api/activity/filter",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("activity"),
    async (req, res) => {
      try {
        const filters: any = {};
        if (req.query.status) filters.status = String(req.query.status).split(",");
        if (req.query.username) filters.username = String(req.query.username);
        if (req.query.ipAddress) filters.ipAddress = String(req.query.ipAddress);
        if (req.query.browser) filters.browser = String(req.query.browser);
        if (req.query.dateFrom) filters.dateFrom = new Date(String(req.query.dateFrom));
        if (req.query.dateTo) filters.dateTo = new Date(String(req.query.dateTo));

        return res.json({ activities: await storage.getFilteredActivities(filters) });
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to filter activities" });
      }
    },
  );

  app.delete(
    "/api/activity/:id",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const activityId = String(req.params.id || "");
        if (!activityId) {
          return res.status(400).json({ success: false, message: "Invalid activityId" });
        }

        await storage.deleteActivity(activityId);
        await closeSocket(activityId);
        return res.json({ success: true });
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to delete activity" });
      }
    },
  );

  app.post(
    "/api/activity/kick",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const body = ensureObject(req.body) || {};
        const activityId = String(body.activityId || "");
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
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to kick activity" });
      }
    },
  );

  app.post(
    "/api/activity/ban",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("activity"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const body = ensureObject(req.body) || {};
        const activityId = String(body.activityId || "");
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
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to ban activity" });
      }
    },
  );

  app.post("/api/admin/ban", authenticateToken, requireRole("superuser"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = ensureObject(req.body) || {};
      const username = String(body.username || "");
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

      await storage.updateUserBan(username, true);
      await storage.deactivateUserActivities(username, "BANNED");

      const activities = await storage.getAllActivities();
      for (const activity of activities) {
        if (activity.username !== username) continue;
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
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Failed to ban user" });
    }
  });

  app.post(
    "/api/admin/unban",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("activity"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const body = ensureObject(req.body) || {};
        const banId = String(body.banId || "");
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
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to unban user" });
      }
    },
  );

  app.get(
    "/api/users/banned",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    async (_req, res) => {
      try {
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
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load banned users" });
      }
    },
  );

  app.post("/api/activity/heartbeat", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
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
    } catch {
      return res.status(500).json({ ok: false });
    }
  });

  app.get(
    "/api/activities",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    async (_req, res) => {
      try {
        return res.json(await storage.getAllActivities());
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load activities" });
      }
    },
  );

  app.get(
    "/api/activities/active",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    async (_req, res) => {
      try {
        return res.json(await storage.getActiveActivities());
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load active activities" });
      }
    },
  );

  app.post(
    "/api/activities/filter",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    async (req, res) => {
      try {
        const filters = ensureObject(req.body) || {};
        return res.json(await storage.getFilteredActivities(filters));
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to filter activities" });
      }
    },
  );
}
