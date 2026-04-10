import { resolveTimestampMs, serializeTimestamp } from "../lib/timestamp";
import type { ActivityFilters, ActivityStorage } from "./activity-service-types";

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

    async deleteActivityLog(activityId: string) {
      await storage.deleteActivity(activityId);
      await closeSocket(activityId);
    },

    async bulkDeleteActivityLogs(activityIds: string[]) {
      let deletedCount = 0;
      const notFoundIds: string[] = [];

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

      return {
        deletedCount,
        notFoundIds,
      };
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
