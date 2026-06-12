import { createHash } from "node:crypto";
import { resolveTimestampMs, serializeTimestamp } from "../lib/timestamp";
import { logger } from "../lib/logger";
import type {
  ActivityFilters,
  ActivityPageOptions,
  ActivityStorage,
} from "./activity-service-types";

type CloseActivitySocket = (
  activityId: string,
  payload?: Record<string, unknown>,
) => Promise<void>;

type ActivityListItem = Awaited<ReturnType<ActivityStorage["getAllActivities"]>>[number] & {
  id?: string | null | undefined;
  isActive?: boolean | null | undefined;
  logoutTime?: Date | string | null | undefined;
  loginTime?: Date | string | null | undefined;
  username?: string | null | undefined;
  ipAddress?: string | null | undefined;
  browser?: string | null | undefined;
  lastActivityTime?: Date | string | null | undefined;
  status?: string | undefined;
};

function resolveActivityTimestampMs(value: Date | string | null | undefined) {
  return resolveTimestampMs(value);
}

function hashActivityIdForLogoutFlush(activityId: string): string {
  return createHash("sha256")
    .update(activityId)
    .digest("base64url")
    .slice(0, 16);
}

type SerializedActivityListItem<T extends ActivityListItem> = Omit<
  T,
  "lastActivityTime" | "loginTime" | "logoutTime"
> & {
  lastActivityTime: string | null;
  loginTime: string;
  logoutTime: string | null;
};

function serializeActivityForResponse<T extends ActivityListItem>(
  activity: T,
): SerializedActivityListItem<T> {
  return {
    ...activity,
    lastActivityTime: serializeTimestamp(activity.lastActivityTime),
    loginTime: serializeTimestamp(activity.loginTime) ?? "",
    logoutTime: serializeTimestamp(activity.logoutTime),
  } as SerializedActivityListItem<T>;
}

function serializeActivitiesForResponse<T extends ActivityListItem>(activities: T[]) {
  return activities.map((activity) => serializeActivityForResponse(activity));
}

function matchesActivityBaseFilters(
  activity: ActivityListItem,
  filters: ActivityFilters | undefined,
) {
  if (!filters) {
    return true;
  }

  if (filters.username && activity.username !== filters.username) {
    return false;
  }

  if (filters.ipAddress && activity.ipAddress !== filters.ipAddress) {
    return false;
  }

  if (filters.browser && activity.browser !== filters.browser) {
    return false;
  }

  const loginTimeMs = resolveActivityTimestampMs(activity.loginTime);

  if (filters.dateFrom && (!Number.isFinite(loginTimeMs) || loginTimeMs < filters.dateFrom.getTime())) {
    return false;
  }

  if (filters.dateTo) {
    const endOfDay = new Date(filters.dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    if (!Number.isFinite(loginTimeMs) || loginTimeMs > endOfDay.getTime()) {
      return false;
    }
  }

  return true;
}

function sortActivitiesByLoginTimeDesc<T extends ActivityListItem>(activities: T[]) {
  return [...activities].sort((left, right) => {
    const leftMs = resolveActivityTimestampMs(left.loginTime);
    const rightMs = resolveActivityTimestampMs(right.loginTime);
    if (!Number.isFinite(leftMs) && !Number.isFinite(rightMs)) {
      return 0;
    }
    if (!Number.isFinite(leftMs)) {
      return 1;
    }
    if (!Number.isFinite(rightMs)) {
      return -1;
    }
    return rightMs - leftMs;
  });
}

function buildActivityBatchAuditDetails(params: {
  requestedCount: number;
  deletedCount: number;
  notFoundCount: number;
  durationMs: number;
}) {
  return JSON.stringify({
    requestedCount: params.requestedCount,
    deletedCount: params.deletedCount,
    notFoundCount: params.notFoundCount,
    durationMs: params.durationMs,
  });
}

function buildActivityBatchFailureAuditDetails(params: {
  requestedCount: number;
  durationMs: number;
  errorType: string;
}) {
  return JSON.stringify({
    requestedCount: params.requestedCount,
    durationMs: params.durationMs,
    errorType: params.errorType,
  });
}

function buildActivityRetentionCleanupAuditDetails(params: {
  cutoffIso: string;
  deletedCount: number;
  durationMs: number;
  limit: number;
  olderThanDays: number;
}) {
  return JSON.stringify({
    cutoffIso: params.cutoffIso,
    deletedCount: params.deletedCount,
    durationMs: params.durationMs,
    limit: params.limit,
    olderThanDays: params.olderThanDays,
  });
}

function buildActivityRetentionCleanupFailureAuditDetails(params: {
  cutoffIso: string;
  durationMs: number;
  errorType: string;
  limit: number;
  olderThanDays: number;
}) {
  return JSON.stringify({
    cutoffIso: params.cutoffIso,
    durationMs: params.durationMs,
    errorType: params.errorType,
    limit: params.limit,
    olderThanDays: params.olderThanDays,
  });
}

async function createBatchFailureAuditLog(params: {
  storage: ActivityStorage;
  performedBy: string;
  requestedCount: number;
  startedAt: number;
  error: unknown;
}) {
  try {
    await params.storage.createAuditLog({
      action: "BULK_DELETE_ACTIVITY_LOGS_FAILED",
      performedBy: params.performedBy,
      targetResource: "activity_logs",
      details: buildActivityBatchFailureAuditDetails({
        requestedCount: params.requestedCount,
        durationMs: Date.now() - params.startedAt,
        errorType: params.error instanceof Error ? params.error.name : "UnknownError",
      }),
    });
  } catch (auditError) {
    logger.error("Activity batch operation failure audit failed", {
      event: "activity_batch_failure_audit_failed",
      action: "BULK_DELETE_ACTIVITY_LOGS_FAILED",
      errorType: auditError instanceof Error ? auditError.name : "UnknownError",
    });
  }
}

async function createRetentionCleanupFailureAuditLog(params: {
  cutoff: Date;
  error: unknown;
  limit: number;
  olderThanDays: number;
  performedBy: string;
  startedAt: number;
  storage: ActivityStorage;
}) {
  try {
    await params.storage.createAuditLog({
      action: "DELETE_OLD_ACTIVITY_LOGS_FAILED",
      performedBy: params.performedBy,
      targetResource: "activity_logs",
      details: buildActivityRetentionCleanupFailureAuditDetails({
        cutoffIso: params.cutoff.toISOString(),
        durationMs: Date.now() - params.startedAt,
        errorType: params.error instanceof Error ? params.error.name : "UnknownError",
        limit: params.limit,
        olderThanDays: params.olderThanDays,
      }),
    });
  } catch (auditError) {
    logger.error("Activity retention cleanup failure audit failed", {
      event: "activity_retention_cleanup_failure_audit_failed",
      action: "DELETE_OLD_ACTIVITY_LOGS_FAILED",
      errorType: auditError instanceof Error ? auditError.name : "UnknownError",
    });
  }
}

async function flushActivitySessionBeforeLogout(
  storage: ActivityStorage,
  activityId: string,
): Promise<void> {
  try {
    await storage.updateActivity(activityId, {
      lastActivityTime: new Date(),
    });
  } catch (error) {
    logger.warn("Activity session flush failed before logout; continuing logout", {
      event: "activity_logout_flush_failed",
      activityIdHash: hashActivityIdForLogoutFlush(activityId),
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

function reconcileRequestingActivityPresence<T extends ActivityListItem>(
  activities: T[],
  requestingActivity: T | undefined,
  filters?: ActivityFilters,
) {
  const requestingActivityId = String(requestingActivity?.id || "").trim();
  if (!requestingActivityId) {
    return activities;
  }

  if (!requestingActivity) {
    return activities;
  }

  if (requestingActivity?.isActive === false || requestingActivity?.logoutTime) {
    return activities.filter((activity) => String(activity.id || "").trim() !== requestingActivityId);
  }

  const onlineAllowed = !filters?.status?.length || filters.status.includes("ONLINE");
  const baseFiltersMatched = matchesActivityBaseFilters(requestingActivity, filters);
  const nextActivities = activities.filter((activity) => String(activity.id || "").trim() !== requestingActivityId);

  if (!onlineAllowed || !baseFiltersMatched) {
    return nextActivities;
  }

  const now = new Date();
  const nextRequestingActivity = {
    ...requestingActivity,
    lastActivityTime: now,
    status: "ONLINE",
  } as T;

  return sortActivitiesByLoginTimeDesc([...nextActivities, nextRequestingActivity]);
}

export function createActivitySessionOperations(
  storage: ActivityStorage,
  closeSocket: CloseActivitySocket,
) {
  return {
    async logout(activityId: string, username: string) {
      const activity = await storage.getActivityById(activityId);
      if (!activity || activity.isActive === false) {
        return;
      }

      await flushActivitySessionBeforeLogout(storage, activityId);

      await storage.updateActivity(activityId, {
        isActive: false,
        logoutTime: new Date(),
        logoutReason: "USER_LOGOUT",
      });

      // A manual logout already has an in-flight HTTP response that will
      // transition the current tab; closing the socket is enough here and avoids
      // racing a same-tab websocket logout event against cookie clearing.
      await closeSocket(activityId);

      await storage.createAuditLog({
        action: "LOGOUT",
        performedBy: username,
      });
    },

    async getAllActivities(currentActivityId?: string) {
      const activities = await storage.getAllActivities();
      if (!currentActivityId) {
        return serializeActivitiesForResponse(activities as ActivityListItem[]);
      }

      const requestingActivity = await storage.getActivityById(currentActivityId) as ActivityListItem | undefined;
      return serializeActivitiesForResponse(
        reconcileRequestingActivityPresence(
          activities as ActivityListItem[],
          requestingActivity,
        ),
      );
    },

    async getFilteredActivities(filters: ActivityFilters, currentActivityId?: string) {
      const activities = await storage.getFilteredActivities(filters);
      if (!currentActivityId) {
        return serializeActivitiesForResponse(activities as ActivityListItem[]);
      }

      const requestingActivity = await storage.getActivityById(currentActivityId) as ActivityListItem | undefined;
      return serializeActivitiesForResponse(
        reconcileRequestingActivityPresence(
          activities as ActivityListItem[],
          requestingActivity,
          filters,
        ),
      );
    },

    async listActivityPage(
      options: ActivityPageOptions,
      filters: ActivityFilters,
      currentActivityId?: string,
    ) {
      const result = await storage.listActivityPage({
        ...options,
        currentActivityId,
        filters,
      });
      const now = new Date();
      const activities = result.activities.map((activity) => {
        if (
          currentActivityId
          && activity.id === currentActivityId
          && activity.isActive !== false
          && !activity.logoutTime
        ) {
          return {
            ...activity,
            lastActivityTime: now,
            status: "ONLINE",
          };
        }
        return activity;
      });

      return {
        ...result,
        activities: serializeActivitiesForResponse(activities as ActivityListItem[]),
      };
    },

    async deleteActivityLog(activityId: string) {
      await storage.deleteActivity(activityId);
      await closeSocket(activityId);
    },

    async bulkDeleteActivityLogs(activityIds: string[], performedBy: string) {
      const startedAt = Date.now();
      let deletedCount = 0;
      const notFoundIds: string[] = [];

      try {
        for (const activityId of activityIds) {
          const activity = await storage.getActivityById(activityId);
          if (!activity) {
            notFoundIds.push(activityId);
            continue;
          }

          await storage.deleteActivity(activityId);
          await closeSocket(activityId);
          deletedCount += 1;
        }
      } catch (error) {
        // AUDIT2-FIX [M2]: failed state-changing batch operations leave an audit trail.
        await createBatchFailureAuditLog({
          storage,
          performedBy,
          requestedCount: activityIds.length,
          startedAt,
          error,
        });
        throw error;
      }

      // AUDIT2-FIX [M2]: successful state-changing batch operations leave an audit trail.
      await storage.createAuditLog({
        action: "BULK_DELETE_ACTIVITY_LOGS",
        performedBy,
        targetResource: "activity_logs",
        details: buildActivityBatchAuditDetails({
          requestedCount: activityIds.length,
          deletedCount,
          notFoundCount: notFoundIds.length,
          durationMs: Date.now() - startedAt,
        }),
      });

      return {
        deletedCount,
        notFoundIds,
      };
    },

    async cleanupEndedActivityLogs(params: {
      cutoff: Date;
      limit: number;
      olderThanDays: number;
      performedBy: string;
    }) {
      const startedAt = Date.now();

      try {
        const deletedIds = await storage.deleteEndedActivitiesBefore({
          cutoff: params.cutoff,
          limit: params.limit,
        });

        await Promise.all(deletedIds.map((activityId) => closeSocket(activityId)));

        await storage.createAuditLog({
          action: "DELETE_OLD_ACTIVITY_LOGS",
          performedBy: params.performedBy,
          targetResource: "activity_logs",
          details: buildActivityRetentionCleanupAuditDetails({
            cutoffIso: params.cutoff.toISOString(),
            deletedCount: deletedIds.length,
            durationMs: Date.now() - startedAt,
            limit: params.limit,
            olderThanDays: params.olderThanDays,
          }),
        });

        return {
          deletedCount: deletedIds.length,
          cutoff: params.cutoff.toISOString(),
        };
      } catch (error) {
        await createRetentionCleanupFailureAuditLog({
          cutoff: params.cutoff,
          error,
          limit: params.limit,
          olderThanDays: params.olderThanDays,
          performedBy: params.performedBy,
          startedAt,
          storage,
        });
        throw error;
      }
    },

    async heartbeat(activityId: string) {
      const now = new Date();
      await storage.updateActivity(activityId, {
        lastActivityTime: now,
        isActive: true,
      });

      return {
        ok: true,
        status: "ONLINE" as const,
        lastActivityTime: now.toISOString(),
      };
    },

    async getActiveActivities() {
      return storage.getActiveActivities();
    },
  };
}
