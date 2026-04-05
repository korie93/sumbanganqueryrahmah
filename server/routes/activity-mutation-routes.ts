import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import { readNonEmptyString } from "../http/validation";
import {
  buildActivityErrorPayload,
  buildActivitySuccessPayload,
  readActivityBodyObject,
  type ActivityRouteContext,
} from "./activity-route-context";

export function registerActivityMutationRoutes(context: ActivityRouteContext) {
  const {
    app,
    authenticateToken,
    requireRole,
    requireTabAccess,
    adminActionRateLimiter,
    activityService,
  } = context;

  app.delete(
    "/api/activity/:id",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const activityId = readNonEmptyString(req.params.id);
      if (!activityId) {
        return res.status(400).json(buildActivityErrorPayload("Invalid activityId"));
      }

      await activityService.deleteActivityLog(activityId);
      return res.json(buildActivitySuccessPayload());
    }),
  );

  app.delete(
    "/api/activity/logs/bulk-delete",
    authenticateToken,
    adminActionRateLimiter,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = readActivityBodyObject(req.body);
      const rawIds = Array.isArray(body.activityIds) ? body.activityIds : [];
      const activityIds = Array.from(
        new Set(
          rawIds
            .map((value) => readNonEmptyString(value))
            .filter((value): value is string => Boolean(value)),
        ),
      ).slice(0, 500);

      if (activityIds.length === 0) {
        return res.status(400).json(buildActivityErrorPayload("activityIds is required"));
      }

      const { deletedCount, notFoundIds } =
        await activityService.bulkDeleteActivityLogs(activityIds);

      return res.json(buildActivitySuccessPayload({
        requestedCount: activityIds.length,
        deletedCount,
        notFoundIds,
      }));
    }),
  );

  app.post(
    "/api/activity/kick",
    authenticateToken,
    adminActionRateLimiter,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = readActivityBodyObject(req.body);
      const activityId = readNonEmptyString(body.activityId);
      if (!activityId) {
        return res.status(400).json(buildActivityErrorPayload("Invalid activityId"));
      }

      const result = await activityService.kickActivity(activityId, req.user!.username);
      if (result.status === "not_found") {
        return res.status(404).json(buildActivityErrorPayload("Activity not found"));
      }

      return res.json(buildActivitySuccessPayload());
    }),
  );

  app.post(
    "/api/activity/ban",
    authenticateToken,
    adminActionRateLimiter,
    requireRole("superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = readActivityBodyObject(req.body);
      const activityId = readNonEmptyString(body.activityId);
      if (!activityId) {
        return res.status(400).json(buildActivityErrorPayload("Invalid activityId"));
      }

      const result = await activityService.banActivity(activityId, req.user!.username);
      if (result.status === "not_found") {
        return res.status(404).json(buildActivityErrorPayload("Activity not found"));
      }
      if (result.status === "cannot_ban_superuser") {
        return res.status(403).json(buildActivityErrorPayload("Cannot ban a superuser"));
      }

      return res.json(buildActivitySuccessPayload());
    }),
  );

  app.post(
    "/api/admin/ban",
    authenticateToken,
    adminActionRateLimiter,
    requireRole("superuser"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = readActivityBodyObject(req.body);
      const username = readNonEmptyString(body.username);
      if (!username) {
        return res.status(400).json(buildActivityErrorPayload("Username required"));
      }

      const result = await activityService.banAccount(username, req.user!.username);
      if (result.status === "not_found") {
        return res.status(404).json(buildActivityErrorPayload("User not found"));
      }
      if (result.status === "cannot_ban_superuser") {
        return res.status(403).json(buildActivityErrorPayload("Cannot ban a superuser"));
      }

      return res.json(buildActivitySuccessPayload());
    }),
  );

  app.post(
    "/api/admin/unban",
    authenticateToken,
    adminActionRateLimiter,
    requireRole("superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = readActivityBodyObject(req.body);
      const banId = readNonEmptyString(body.banId);
      if (!banId) {
        return res.status(400).json(buildActivityErrorPayload("banId required"));
      }

      await activityService.unbanUser(banId, req.user!.username);
      return res.json(buildActivitySuccessPayload());
    }),
  );
}
