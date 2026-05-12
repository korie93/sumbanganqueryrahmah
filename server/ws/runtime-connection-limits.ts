import { WebSocket } from "ws";
import type { RuntimeTrackedSocketEntry } from "./runtime-manager-types";

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
    if (entry.ws.readyState === WebSocket.OPEN || entry.ws.readyState === WebSocket.CONNECTING) {
      count += 1;
    }
  }
  return count;
}
