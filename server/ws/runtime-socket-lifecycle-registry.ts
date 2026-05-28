import type { WebSocket } from "ws";
import type {
  RuntimeSocketCleanupOptions,
  RuntimeTrackedSocketEntry,
} from "./runtime-manager-types";

export type RuntimeSocketCleanupCallback = (options?: RuntimeSocketCleanupOptions) => void;

export type RuntimeSocketLifecycleSnapshot = {
  cleanupCallbacks: number;
  connectedClients: number;
  socketEntriesByActivity: number;
  socketEntriesByInstance: number;
  trackedSockets: number;
};

export class RuntimeSocketLifecycleRegistry {
  readonly socketCleanupCallbacks = new Map<WebSocket, RuntimeSocketCleanupCallback>();
  readonly socketEntriesByActivity = new Map<string, RuntimeTrackedSocketEntry>();
  readonly socketEntriesByInstance = new Map<WebSocket, RuntimeTrackedSocketEntry>();
  readonly trackedSockets = new Set<WebSocket>();

  constructor(private readonly connectedClients: Map<string, WebSocket>) {}

  get connectedClientMap(): Map<string, WebSocket> {
    return this.connectedClients;
  }

  get size(): number {
    return this.trackedSockets.size;
  }

  getSnapshot(): RuntimeSocketLifecycleSnapshot {
    return {
      cleanupCallbacks: this.socketCleanupCallbacks.size,
      connectedClients: this.connectedClients.size,
      socketEntriesByActivity: this.socketEntriesByActivity.size,
      socketEntriesByInstance: this.socketEntriesByInstance.size,
      trackedSockets: this.trackedSockets.size,
    };
  }

  hasSocket(ws: WebSocket): boolean {
    return this.trackedSockets.has(ws)
      || this.socketEntriesByInstance.has(ws)
      || this.socketCleanupCallbacks.has(ws);
  }

  getCleanupCallback(ws: WebSocket): RuntimeSocketCleanupCallback | undefined {
    return this.socketCleanupCallbacks.get(ws);
  }

  getEntryByActivity(activityId: string): RuntimeTrackedSocketEntry | undefined {
    return this.socketEntriesByActivity.get(activityId);
  }

  getEntryBySocket(ws: WebSocket): RuntimeTrackedSocketEntry | undefined {
    return this.socketEntriesByInstance.get(ws);
  }

  trackSocket(ws: WebSocket, cleanupCallback: RuntimeSocketCleanupCallback): void {
    this.trackedSockets.add(ws);
    this.socketCleanupCallbacks.set(ws, cleanupCallback);
  }

  registerTrackedSocketEntry(
    activityId: string,
    ws: WebSocket,
    userKey: string | null,
  ): RuntimeTrackedSocketEntry {
    const entry: RuntimeTrackedSocketEntry = {
      activityId,
      ws,
      userKey,
      alive: true,
    };
    this.socketEntriesByActivity.set(activityId, entry);
    this.socketEntriesByInstance.set(ws, entry);
    this.connectedClients.set(activityId, ws);
    return entry;
  }

  deregisterActivity(activityId: string, ws?: WebSocket): void {
    const currentEntry = this.socketEntriesByActivity.get(activityId);
    const targetWs = ws ?? currentEntry?.ws ?? this.connectedClients.get(activityId);

    if (currentEntry && (!ws || currentEntry.ws === ws)) {
      this.socketEntriesByActivity.delete(activityId);
      this.socketEntriesByInstance.delete(currentEntry.ws);
    }

    if (targetWs) {
      this.socketEntriesByInstance.delete(targetWs);
      this.socketCleanupCallbacks.delete(targetWs);
      this.trackedSockets.delete(targetWs);
    }

    if (!ws || this.connectedClients.get(activityId) === ws) {
      this.connectedClients.delete(activityId);
    }
  }

  deregisterSocket(ws: WebSocket): RuntimeTrackedSocketEntry | undefined {
    const entry = this.socketEntriesByInstance.get(ws);

    this.socketCleanupCallbacks.delete(ws);
    this.socketEntriesByInstance.delete(ws);
    this.trackedSockets.delete(ws);

    if (entry) {
      if (this.socketEntriesByActivity.get(entry.activityId)?.ws === ws) {
        this.socketEntriesByActivity.delete(entry.activityId);
      }
      if (this.connectedClients.get(entry.activityId) === ws) {
        this.connectedClients.delete(entry.activityId);
      }
    }

    return entry;
  }

  clearAll(): void {
    this.socketCleanupCallbacks.clear();
    this.socketEntriesByActivity.clear();
    this.socketEntriesByInstance.clear();
    this.trackedSockets.clear();
    this.connectedClients.clear();
  }
}
