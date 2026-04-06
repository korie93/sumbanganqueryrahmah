import type { ActivityFilters, ActivityStorage } from "./activity-service-types";

type CloseActivitySocket = (
  activityId: string,
  payload?: Record<string, unknown>,
) => Promise<void>;

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

    async getAllActivities() {
      return storage.getAllActivities();
    },

    async getFilteredActivities(filters: ActivityFilters) {
      return storage.getFilteredActivities(filters);
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
