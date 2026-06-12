import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import { parseStrictInteger, readNonEmptyString, readRouteParam } from "../http/validation";
import {
  buildActivityErrorPayload,
  buildActivitySuccessPayload,
  readActivityBodyObject,
  type ActivityRouteContext,
} from "./activity-route-context";

const ACTIVITY_LOG_CLEANUP_MAX_DAYS = 3_650;
const ACTIVITY_LOG_CLEANUP_MAX_LIMIT = 5_000;

function readOptionalCleanupInteger(
  value: unknown,
  options: {
    label: string;
    max: number;
    min: number;
  },
): { ok: true; value: number | undefined } | { ok: false; message: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: undefined };
  }

  const parsed = parseStrictInteger(value, {
    max: options.max,
    min: options.min,
  });

  if (parsed === null) {
    return {
      ok: false,
      message: `${options.label} must be an integer between ${options.min} and ${options.max}`,
    };
  }

  return { ok: true, value: parsed };
}

export function registerActivityMutationRoutes(context: ActivityRouteContext) {
  const {
    app,
    authenticateToken,
    requireRole,
    requireTabAccess,
    adminActionRateLimiter,
    adminDestructiveActionRateLimiter,
    activityService,
  } = context;

  app.delete(
    "/api/activity/:id",
    authenticateToken,
    adminDestructiveActionRateLimiter,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const activityId = readRouteParam(req.params.id, "activity id");
      const result = await activityService.deleteActivityLog(activityId);
      if (result.status === "protected") {
        return res.status(409).json(buildActivityErrorPayload(
          "Activity logs linked to an active ban cannot be deleted.",
        ));
      }
      return res.json(buildActivitySuccessPayload());
    }),
  );

  app.delete(
    "/api/activity/logs/bulk-delete",
    authenticateToken,
    adminDestructiveActionRateLimiter,
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

      const { deletedCount, notFoundIds, protectedIds } =
        await activityService.bulkDeleteActivityLogs(activityIds, req.user!.username);

      return res.json(buildActivitySuccessPayload({
        requestedCount: activityIds.length,
        deletedCount,
        notFoundIds,
        protectedIds,
      }));
    }),
  );

  app.delete(
    "/api/activity/logs/cleanup-ended",
    authenticateToken,
    adminDestructiveActionRateLimiter,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = readActivityBodyObject(req.body);
      const olderThanDays = readOptionalCleanupInteger(body.olderThanDays, {
        label: "olderThanDays",
        max: ACTIVITY_LOG_CLEANUP_MAX_DAYS,
        min: 1,
      });
      if (!olderThanDays.ok) {
        return res.status(400).json(buildActivityErrorPayload(olderThanDays.message));
      }

      const limit = readOptionalCleanupInteger(body.limit, {
        label: "limit",
        max: ACTIVITY_LOG_CLEANUP_MAX_LIMIT,
        min: 1,
      });
      if (!limit.ok) {
        return res.status(400).json(buildActivityErrorPayload(limit.message));
      }

      const result = await activityService.cleanupEndedActivityLogs({
        ...(limit.value === undefined ? {} : { limit: limit.value }),
        ...(olderThanDays.value === undefined ? {} : { olderThanDays: olderThanDays.value }),
        performedBy: req.user!.username,
        source: "manual",
      });

      return res.json(buildActivitySuccessPayload({
        ...result,
        olderThanDays: result.standardRetentionDays,
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
