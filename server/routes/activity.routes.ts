import type { Express, RequestHandler, Response } from "express";
import { WebSocket } from "ws";
import type { AuthenticatedRequest } from "../auth/guards";
import { clearAuthSessionCookie } from "../auth/session-cookie";
import { asyncHandler } from "../http/async-handler";
import { ensureObject, readDate, readNonEmptyString, readStringList } from "../http/validation";
import { ActivityService } from "../services/activity.service";
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
  const activityService = new ActivityService(storage, connectedClients);

  app.post("/api/activity/logout", authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      clearAuthSessionCookie(res);
      return res.status(401).json({ success: false });
    }

    await activityService.logout(req.user.activityId, req.user.username);
    clearAuthSessionCookie(res);
    return res.json({ success: true });
  }));

  app.get(
    "/api/activity/all",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json({ activities: await activityService.getAllActivities() });
    }),
  );

  app.get(
    "/api/activity/filter",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req, res) => {
      return res.json({ activities: await activityService.getFilteredActivities(buildActivityFilters(req.query as Record<string, unknown>)) });
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

      await activityService.deleteActivityLog(activityId);
      return res.json({ success: true });
    }),
  );

  app.delete(
    "/api/activity/logs/bulk-delete",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = ensureObject(req.body) || {};
      const rawIds = Array.isArray(body.activityIds) ? body.activityIds : [];
      const activityIds = Array.from(
        new Set(
          rawIds
            .map((value) => readNonEmptyString(value))
            .filter((value): value is string => Boolean(value)),
        ),
      ).slice(0, 500);

      if (activityIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "activityIds is required",
        });
      }

      const { deletedCount, notFoundIds } = await activityService.bulkDeleteActivityLogs(activityIds);

      return res.json({
        success: true,
        requestedCount: activityIds.length,
        deletedCount,
        notFoundIds,
      });
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

      const result = await activityService.kickActivity(activityId, req.user!.username);
      if (result.status === "not_found") {
        return res.status(404).json({ message: "Activity not found" });
      }

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

      const result = await activityService.banActivity(activityId, req.user!.username);
      if (result.status === "not_found") {
        return res.status(404).json({ message: "Activity not found" });
      }
      if (result.status === "cannot_ban_superuser") {
        return res.status(403).json({ message: "Cannot ban a superuser" });
      }

      return res.json({ success: true });
    }),
  );

  app.post("/api/admin/ban", authenticateToken, requireRole("superuser"), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = ensureObject(req.body) || {};
    const username = readNonEmptyString(body.username);
    if (!username) {
      return res.status(400).json({ message: "Username required" });
    }

    const result = await activityService.banAccount(username, req.user!.username);
    if (result.status === "not_found") {
      return res.status(404).json({ message: "User not found" });
    }
    if (result.status === "cannot_ban_superuser") {
      return res.status(403).json({ message: "Cannot ban a superuser" });
    }

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

      await activityService.unbanUser(banId, req.user!.username);

      return res.json({ success: true });
    }),
  );

  app.get(
    "/api/users/banned",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json({
        users: await activityService.getBannedUsers(),
      });
    }),
  );

  app.post("/api/activity/heartbeat", authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, message: "Unauthenticated" });
    }

    return res.json(await activityService.heartbeat(req.user.activityId));
  }));

  app.get(
    "/api/activities",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json(await activityService.getAllActivities());
    }),
  );

  app.get(
    "/api/activities/active",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json(await activityService.getActiveActivities());
    }),
  );

  app.post(
    "/api/activities/filter",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req, res) => {
      const filters = buildActivityFilters(ensureObject(req.body) || {});
      return res.json(await activityService.getFilteredActivities(filters));
    }),
  );
}
