import { WebSocket } from "ws";
import type { RuntimeTrackedSocketEntry } from "./runtime-manager-types";

function isOpenOrConnecting(ws: WebSocket): boolean {
  return ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING;
}

export function countTrackedUserConnections(
  socketEntriesByActivity: ReadonlyMap<string, RuntimeTrackedSocketEntry>,
  userKey: string,
  excludedActivityId?: string,
): number {
  let count = 0;
  for (const entry of socketEntriesByActivity.values()) {
    if (entry.activityId === excludedActivityId || entry.userKey !== userKey) {
      continue;
    }
    if (isOpenOrConnecting(entry.ws)) {
      count += 1;
    }
  }
  return count;
}

export function countRuntimeWebSocketConnections(options: {
  connectedClients: ReadonlyMap<string, WebSocket>;
  trackedSockets: ReadonlySet<WebSocket>;
}): number {
  const sockets = new Set<WebSocket>();
  for (const ws of options.connectedClients.values()) {
    sockets.add(ws);
  }
  for (const ws of options.trackedSockets.values()) {
    sockets.add(ws);
  }

  let count = 0;
  for (const ws of sockets) {
    if (isOpenOrConnecting(ws)) {
      count += 1;
    }
  }
  return count;
}
