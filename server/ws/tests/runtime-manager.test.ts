import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import type { UserActivity } from "../../../shared/schema-postgres";
import { createRuntimeWebSocketManager } from "../runtime-manager";

class FakeWebSocketServer extends EventEmitter {}
class FakeWebSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  closeCalls = 0;
  terminateCalls = 0;
  pingCalls = 0;
  sentMessages: string[] = [];

  send(payload: string) {
    this.sentMessages.push(String(payload));
  }

  close() {
    this.closeCalls += 1;
    if (this.readyState === WebSocket.CLOSED) {
      return;
    }

    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }

  terminate() {
    this.terminateCalls += 1;
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }

  ping() {
    this.pingCalls += 1;
  }

  fail(error = new Error("socket failed")) {
    this.readyState = WebSocket.CLOSED;
    this.emit("error", error);
  }
}

const TEST_SECRET = "runtime-manager-test-secret";

function createWsToken(activityId: string) {
  return jwt.sign({ activityId }, TEST_SECRET, { algorithm: "HS256" });
}

function createConnectionRequest(token?: string) {
  return {
    url: token ? `/ws?token=${encodeURIComponent(token)}` : "/ws",
    headers: {
      host: "example.test",
    },
  } as any;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function createActiveSession(activityId: string): UserActivity {
  return {
    id: activityId,
    userId: "user-1",
    username: "socket.user",
    role: "user",
    pcName: null,
    browser: null,
    fingerprint: null,
    ipAddress: null,
    loginTime: null,
    lastActivityTime: null,
    isActive: true,
    logoutTime: null,
    logoutReason: null,
  };
}

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

test("runtime manager rejects sockets before registration without leaving tracked state or listeners", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => undefined,
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest());
    await flushAsyncWork();

    assert.equal(providedMap.size, 0);
    assert.equal(socket.closeCalls, 1);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager does not register sockets that close during async session validation", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityLookup = createDeferred<ReturnType<typeof createActiveSession> | undefined>();
  const activityId = "activity-early-close";

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => activityLookup.promise,
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    socket.close();
    activityLookup.resolve(createActiveSession(activityId));
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager does not register sockets that error during async session validation", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityLookup = createDeferred<ReturnType<typeof createActiveSession> | undefined>();
  const activityId = "activity-early-error";

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => activityLookup.promise,
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    socket.fail(new Error("boom"));
    activityLookup.resolve(createActiveSession(activityId));
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager removes registered sockets cleanly on close", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-registered-close";

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);

    socket.close();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager tolerates repeated terminal lifecycle signals without duplicate tracked state", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-repeat-cleanup";

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    assert.doesNotThrow(() => {
      socket.fail(new Error("repeat cleanup"));
      socket.close();
    });

    assert.equal(providedMap.has(activityId), false);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
  } finally {
    wss.emit("close");
  }
});
