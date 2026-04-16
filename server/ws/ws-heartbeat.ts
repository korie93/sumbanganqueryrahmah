import { WebSocket } from "ws";
import { HEARTBEAT_INTERVAL_MS, type RuntimeTrackedSocketEntry } from "./ws-runtime-types";

type StartRuntimeWebSocketHeartbeatOptions = {
  socketEntriesByActivity: Map<string, RuntimeTrackedSocketEntry>;
  removeTrackedSocket: (activityId: string, ws?: WebSocket) => void;
};

export function startRuntimeWebSocketHeartbeat(
  options: StartRuntimeWebSocketHeartbeatOptions,
) {
  const {
    socketEntriesByActivity,
    removeTrackedSocket,
  } = options;

  const heartbeatHandle = setInterval(() => {
    for (const entry of Array.from(socketEntriesByActivity.values())) {
      const { activityId, ws } = entry;
      if (!ws || (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING)) {
        removeTrackedSocket(activityId, ws);
        continue;
      }

      if (ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      const currentEntry = socketEntriesByActivity.get(activityId);
      if (!currentEntry || currentEntry.ws !== ws) {
        removeTrackedSocket(activityId, ws);
        continue;
      }

      if (!currentEntry.alive) {
        removeTrackedSocket(activityId, ws);
        if (ws.readyState === WebSocket.OPEN) {
          ws.terminate();
        }
        continue;
      }

      currentEntry.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatHandle.unref?.();

  return heartbeatHandle;
}
