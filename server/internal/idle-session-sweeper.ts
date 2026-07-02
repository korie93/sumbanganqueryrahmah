import { WebSocket } from "ws";
import { logger } from "../lib/logger";
import { resolveTimestampMs } from "../lib/timestamp";
import type { PostgresStorage } from "../storage-postgres";
import { sanitizeRuntimeWebSocketError } from "../ws/ws-lifecycle";

type RuntimeSettings = {
  sessionTimeoutMinutes: number;
  wsIdleMinutes: number;
};

type IdleSessionSweeperOptions = {
  storage: Pick<
    PostgresStorage,
    | "getActiveActivities"
    | "expireIdleActivitySession"
  > & {
    expireIdleActivitySessions?: (params: {
      idleCutoff: Date;
      idleMinutes: number;
    }) => Promise<Array<{
      id: string;
      username: string;
    }>>;
  };
  connectedClients: Map<string, WebSocket>;
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  defaultSessionTimeoutMinutes: number;
  intervalMs?: number;
};

export type IdleSessionSweeperHandle = ReturnType<typeof setInterval> & {
  isActive: () => boolean;
  stop: () => void;
};

async function expireIdleActivitiesBatch(
  storage: IdleSessionSweeperOptions["storage"],
  idleCutoff: Date,
  idleMinutes: number,
) {
  if (typeof storage.expireIdleActivitySessions === "function") {
    return storage.expireIdleActivitySessions({
      idleCutoff,
      idleMinutes,
    });
  }

  const now = Date.now();
  const idleMs = idleMinutes * 60 * 1000;
  const activities = await storage.getActiveActivities();
  const expiredActivities: Array<{ id: string; username: string }> = [];

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

    expiredActivities.push(expiredActivity);
  }

  return expiredActivities;
}

function closeExpiredIdleSocket(socket: WebSocket, activityId: string): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    socket.send(JSON.stringify({
      type: "idle_timeout",
      reason: "Session expired due to inactivity",
    }));
  } catch (error) {
    logger.warn("Failed to notify idle WebSocket before cleanup", {
      activityId,
      error: sanitizeRuntimeWebSocketError(error),
    });
  }

  try {
    socket.close();
  } catch (error) {
    logger.warn("Failed to close idle WebSocket cleanly; terminating", {
      activityId,
      error: sanitizeRuntimeWebSocketError(error),
    });
    try {
      socket.terminate();
    } catch (terminateError) {
      logger.warn("Failed to terminate idle WebSocket after close failure", {
        activityId,
        error: sanitizeRuntimeWebSocketError(terminateError),
      });
    }
  }
}

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
  const runtimeSettings = await getRuntimeSettingsCached();
  const idleMinutes = Math.max(
    1,
    runtimeSettings.sessionTimeoutMinutes
      ?? runtimeSettings.wsIdleMinutes
      ?? defaultSessionTimeoutMinutes,
  );
  const idleMs = idleMinutes * 60 * 1000;
  const idleCutoff = new Date(now - idleMs);

  const expiredActivities = await expireIdleActivitiesBatch(
    storage,
    idleCutoff,
    idleMinutes,
  );

  for (const expiredActivity of expiredActivities) {
    if (!expiredActivity) {
      continue;
    }

    logger.info("Session expired due to inactivity", {
      username: expiredActivity.username,
      activityId: expiredActivity.id,
      idleMinutes,
    });

    const socket = connectedClients.get(expiredActivity.id);
    if (socket) {
      closeExpiredIdleSocket(socket, expiredActivity.id);
    }

    connectedClients.delete(expiredActivity.id);
  }
}

export function startIdleSessionSweeper(options: IdleSessionSweeperOptions): IdleSessionSweeperHandle {
  const {
    storage,
    connectedClients,
    getRuntimeSettingsCached,
    defaultSessionTimeoutMinutes,
    intervalMs = 60_000,
  } = options;

  let running = false;
  let stopped = false;

  const handle = setInterval(async () => {
    if (stopped || running) {
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
  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(handle);
  };

  return Object.assign(handle, {
    isActive: () => !stopped,
    stop,
  });
}
