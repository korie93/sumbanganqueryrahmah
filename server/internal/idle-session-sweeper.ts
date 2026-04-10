import { WebSocket } from "ws";
import { logger } from "../lib/logger";
import { resolveTimestampMs } from "../lib/timestamp";
import type { PostgresStorage } from "../storage-postgres";

type RuntimeSettings = {
  sessionTimeoutMinutes: number;
  wsIdleMinutes: number;
};

type IdleSessionSweeperOptions = {
  storage: Pick<
    PostgresStorage,
    | "getActiveActivities"
    | "expireIdleActivitySession"
  >;
  connectedClients: Map<string, WebSocket>;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  defaultSessionTimeoutMinutes: number;
  intervalMs?: number;
};

export async function runIdleSessionSweeperPass(
  options: Pick<
    IdleSessionSweeperOptions,
    "storage" | "connectedClients" | "getRuntimeSettingsCached" | "defaultSessionTimeoutMinutes"
  >,
) {
  const {
    storage,
    connectedClients,
    getRuntimeSettingsCached,
    defaultSessionTimeoutMinutes,
  } = options;

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
  const idleCutoff = new Date(now - idleMs);

  for (const activity of activities) {
    if (!activity.lastActivityTime) {
      continue;
    }

    const last = resolveTimestampMs(activity.lastActivityTime);
    if (now - last <= idleMs) {
      continue;
    }

    const expiredActivity = await storage.expireIdleActivitySession({
      activityId: activity.id,
      idleCutoff,
      idleMinutes,
    });
    if (!expiredActivity) {
      continue;
    }

    logger.info("Session expired due to inactivity", {
      username: expiredActivity.username,
      activityId: expiredActivity.id,
      idleMinutes,
    });

    const socket = connectedClients.get(expiredActivity.id);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "idle_timeout",
        reason: "Session expired due to inactivity",
      }));
      socket.close();
    }

    connectedClients.delete(expiredActivity.id);
  }
}

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
      await runIdleSessionSweeperPass({
        storage,
        connectedClients,
        getRuntimeSettingsCached,
        defaultSessionTimeoutMinutes,
      });
    } catch (error) {
      logger.error("Idle session checker failed", { error });
    } finally {
      running = false;
    }
  }, intervalMs);

  handle.unref();
  return handle;
}
