import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { clearAuthSessionCookie } from "../auth/session-cookie";
import { asyncHandler } from "../http/async-handler";
import {
  buildActivityErrorPayload,
  buildActivityFilters,
  buildActivitySuccessPayload,
  readActivityBodyObject,
  type ActivityRouteContext,
} from "./activity-route-context";

export function registerActivityReadRoutes(context: ActivityRouteContext) {
  const {
    app,
    authenticateToken,
    requireRole,
    requireTabAccess,
    activityService,
  } = context;

  app.post(
    "/api/activity/logout",
    authenticateToken,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      if (!req.user) {
        clearAuthSessionCookie(res);
        return res.status(401).json(buildActivityErrorPayload());
      }

      await activityService.logout(req.user.activityId, req.user.username);
      clearAuthSessionCookie(res);
      return res.json(buildActivitySuccessPayload());
    }),
  );

  app.get(
    "/api/activity/all",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      return res.json({ activities: await activityService.getAllActivities(req.user?.activityId) });
    }),
  );

  app.get(
    "/api/activity/filter",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      return res.json({
        activities: await activityService.getFilteredActivities(
          buildActivityFilters(req.query as Record<string, unknown>),
          req.user?.activityId,
        ),
      });
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

  app.post(
    "/api/activity/heartbeat",
    authenticateToken,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({ ok: false, message: "Unauthenticated" });
      }

      return res.json(await activityService.heartbeat(req.user.activityId));
    }),
  );

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
      const filters = buildActivityFilters(readActivityBodyObject(req.body));
      return res.json(await activityService.getFilteredActivities(filters));
    }),
  );
}
