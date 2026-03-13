import { WebSocket } from "ws";
import type { PostgresStorage } from "../storage-postgres";

type RuntimeSettings = {
  sessionTimeoutMinutes: number;
  wsIdleMinutes: number;
};

type IdleSessionSweeperOptions = {
  storage: Pick<
    PostgresStorage,
    | "getActiveActivities"
    | "getActivityById"
    | "updateActivity"
    | "createAuditLog"
    | "clearCollectionNicknameSessionByActivity"
  >;
  connectedClients: Map<string, WebSocket>;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  defaultSessionTimeoutMinutes: number;
  intervalMs?: number;
};

export function startIdleSessionSweeper(options: IdleSessionSweeperOptions) {
  const {
    storage,
    connectedClients,
    getRuntimeSettingsCached,
    defaultSessionTimeoutMinutes,
    intervalMs = 60_000,
  } = options;

  let running = false;

  const handle = setInterval(async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      const now = Date.now();
      const activities = await storage.getActiveActivities();
      const runtimeSettings = await getRuntimeSettingsCached();
      const idleMinutes = Math.max(
        1,
        runtimeSettings.sessionTimeoutMinutes
          || runtimeSettings.wsIdleMinutes
          || defaultSessionTimeoutMinutes,
      );
      const idleMs = idleMinutes * 60 * 1000;

      for (const activity of activities) {
        if (!activity.lastActivityTime) {
          continue;
        }

        const last = new Date(activity.lastActivityTime).getTime();
        if (now - last <= idleMs) {
          continue;
        }

        const freshActivity = await storage.getActivityById(activity.id);
        if (!freshActivity || freshActivity.isActive === false) {
          continue;
        }

        const freshLast = freshActivity.lastActivityTime
          ? new Date(freshActivity.lastActivityTime).getTime()
          : 0;
        if (!freshLast || now - freshLast <= idleMs) {
          continue;
        }

        console.log(`IDLE TIMEOUT: ${activity.username} (${activity.id})`);

        await storage.updateActivity(activity.id, {
          isActive: false,
          logoutTime: new Date(),
          logoutReason: "IDLE_TIMEOUT",
        });

        const socket = connectedClients.get(activity.id);
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "idle_timeout",
            reason: "Session expired due to inactivity",
          }));
          socket.close();
        }

        connectedClients.delete(activity.id);
        await storage.clearCollectionNicknameSessionByActivity(activity.id);

        await storage.createAuditLog({
          action: "SESSION_IDLE_TIMEOUT",
          performedBy: activity.username,
          details: `Auto logout after ${idleMinutes} minutes idle`,
        });
      }
    } catch (error) {
      console.error("Idle session checker error:", error);
    } finally {
      running = false;
    }
  }, intervalMs);

  handle.unref();
  return handle;
}
