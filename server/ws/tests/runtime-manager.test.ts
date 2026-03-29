import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";
import { createRuntimeWebSocketManager } from "../runtime-manager";

class FakeWebSocketServer extends EventEmitter {}

test("createRuntimeWebSocketManager reuses the provided connected clients map", () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => undefined,
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: "test-secret",
    connectedClients: providedMap,
  });

  try {
    assert.equal(manager.connectedClients, providedMap);
  } finally {
    wss.emit("close");
  }
});

test("broadcastWsMessage removes closed sockets from the shared client map", () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const closedSocket = {
    readyState: WebSocket.CLOSING,
    terminate: () => undefined,
    ping: () => undefined,
    send: () => undefined,
    on: () => undefined,
  } as unknown as WebSocket;

  providedMap.set("activity-1", closedSocket);

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => undefined,
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: "test-secret",
    connectedClients: providedMap,
  });

  try {
    manager.broadcastWsMessage({ type: "ping" });
    assert.equal(providedMap.size, 0);
  } finally {
    wss.emit("close");
  }
});
