import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import type { UserActivity } from "../../../shared/schema-postgres";
import { logger } from "../../lib/logger";
import { createRuntimeWebSocketManager } from "../runtime-manager";
import { createRuntimeWsUpgradeRateLimiter } from "../upgrade-rate-limit";
import { createRuntimeWsMessageRateLimiter } from "../message-rate-limit";
import {
  DEFAULT_RUNTIME_WS_MAX_MESSAGE_BYTES,
  RUNTIME_WS_CLOSE_GOING_AWAY,
  RUNTIME_WS_CLOSE_MESSAGE_TOO_BIG,
} from "../runtime-manager-types";
import type {
  RuntimeWsSharedBus,
  RuntimeWsSharedBusEvent,
  RuntimeWsSharedBusPublishEvent,
} from "../runtime-shared-bus";

class FakeWebSocketServer extends EventEmitter {}
class FakeWebSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  closeCalls = 0;
  closeCodes: Array<{ code?: number; reason?: string }> = [];
  terminateCalls = 0;
  pingCalls = 0;
  bufferedAmount = 0;
  sentMessages: string[] = [];

  send(payload: string) {
    this.sentMessages.push(String(payload));
  }

  close(code?: number, reason?: string) {
    this.closeCalls += 1;
    const closeInfo: { code?: number; reason?: string } = {};
    if (code !== undefined) {
      closeInfo.code = code;
    }
    if (reason !== undefined) {
      closeInfo.reason = reason;
    }
    this.closeCodes.push(closeInfo);
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

type RuntimeConnectionRequest = Pick<IncomingMessage, "url" | "headers" | "socket">;

function createConnectionRequest(
  token?: string,
  options?: {
    host?: string;
    origin?: string;
    forwardedFor?: string;
    forwardedHost?: string;
    forwardedProto?: string;
    encrypted?: boolean;
    remoteAddress?: string;
  },
): RuntimeConnectionRequest {
  const headers: Record<string, string> = {
    host: options?.host ?? "example.test",
    origin: options?.origin ?? "http://example.test",
  };
  if (options?.forwardedHost) {
    headers["x-forwarded-host"] = options.forwardedHost;
  }
  if (options?.forwardedFor) {
    headers["x-forwarded-for"] = options.forwardedFor;
  }
  if (options?.forwardedProto) {
    headers["x-forwarded-proto"] = options.forwardedProto;
  }
  if (token) {
    headers.cookie = `sqr_auth=${encodeURIComponent(token)}`;
  }

  return {
    url: "/ws",
    headers,
    socket: ({
      encrypted: options?.encrypted ?? false,
      remoteAddress: options?.remoteAddress ?? "203.0.113.10",
    } as unknown) as IncomingMessage["socket"],
  };
}

class FakeRuntimeWsSharedBus implements RuntimeWsSharedBus {
  readonly instanceId = "local-test-instance";
  readonly published: RuntimeWsSharedBusPublishEvent[] = [];
  private readonly handlers = new Set<(event: RuntimeWsSharedBusEvent) => void>();

  closeCalls = 0;

  close() {
    this.closeCalls += 1;
    this.handlers.clear();
  }

  publish(event: RuntimeWsSharedBusPublishEvent) {
    this.published.push(event);
  }

  subscribe(handler: (event: RuntimeWsSharedBusEvent) => void) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emitRemote(event: RuntimeWsSharedBusPublishEvent) {
    const fullEvent = {
      ...event,
      id: `event-${this.published.length + 1}`,
      originId: "remote-test-instance",
    } as RuntimeWsSharedBusEvent;
    for (const handler of this.handlers) {
      handler(fullEvent);
    }
  }
}

function createQueryTokenConnectionRequest(token: string): RuntimeConnectionRequest {
  return {
    url: `/ws?token=${encodeURIComponent(token)}`,
    headers: {
      host: "example.test",
      origin: "http://example.test",
    },
    socket: ({
      encrypted: false,
    } as unknown) as IncomingMessage["socket"],
  };
}

function createCrossOriginConnectionRequest(token: string): RuntimeConnectionRequest {
  return {
    url: "/ws",
    headers: {
      cookie: `sqr_auth=${encodeURIComponent(token)}`,
      host: "example.test",
      origin: "https://evil.example",
    },
    socket: ({
      encrypted: true,
    } as unknown) as IncomingMessage["socket"],
  };
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

function interceptHeartbeatRegistration() {
  const originalSetInterval = global.setInterval;
  let heartbeatCallback: (() => void) | null = null;

  global.setInterval = (((
    callback: TimerHandler,
    delay?: number,
    ...args: unknown[]
  ) => {
    heartbeatCallback = () => {
      if (typeof callback === "function") {
        callback(...args);
        return;
      }
      throw new Error(`Unexpected string timer callback: ${String(callback)} with delay ${String(delay)}`);
    };

    const handle = originalSetInterval(() => undefined, 60_000);
    handle.unref();
    return handle;
  }) as unknown as typeof global.setInterval);

  return {
    getHeartbeatCallback() {
      if (!heartbeatCallback) {
        throw new Error("Expected heartbeat interval to be registered.");
      }
      return heartbeatCallback;
    },
    restore() {
      global.setInterval = originalSetInterval;
    },
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

test("createRuntimeWebSocketManager rejects connections before storage is ready", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  let storageLookupCount = 0;

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => {
        storageLookupCount += 1;
        return createActiveSession("activity-not-ready");
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    acceptConnections: () => false,
  });

  try {
    wss.emit(
      "connection",
      socket as unknown as WebSocket,
      createConnectionRequest(createWsToken("activity-not-ready")),
    );
    await flushAsyncWork();

    assert.equal(storageLookupCount, 0);
    assert.equal(providedMap.size, 0);
    assert.equal(socket.closeCalls, 1);
    assert.deepEqual(socket.closeCodes[0], {
      code: 1013,
      reason: "storage initializing",
    });
  } finally {
    wss.emit("close");
  }
});

test("createRuntimeWebSocketManager rejects new connections while shutdown is in progress", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  let storageLookupCount = 0;

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => {
        storageLookupCount += 1;
        return createActiveSession("activity-shutdown-rejected");
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    isShuttingDown: () => true,
  });

  try {
    wss.emit(
      "connection",
      socket as unknown as WebSocket,
      createConnectionRequest(createWsToken("activity-shutdown-rejected")),
    );
    await flushAsyncWork();

    assert.equal(storageLookupCount, 0);
    assert.equal(providedMap.size, 0);
    assert.equal(socket.closeCalls, 1);
    assert.deepEqual(socket.closeCodes[0], {
      code: RUNTIME_WS_CLOSE_GOING_AWAY,
      reason: "server shutting down",
    });
    assert.deepEqual(manager.getLifecycleSnapshot(), {
      cleanupCallbacks: 0,
      connectedClients: 0,
      socketEntriesByActivity: 0,
      socketEntriesByInstance: 0,
      trackedSockets: 0,
    });
  } finally {
    wss.emit("close");
  }
});

test("createRuntimeWebSocketManager terminates shutdown-rejected sockets if close throws", async () => {
  const wss = new FakeWebSocketServer();
  const socket = new FakeWebSocket();

  socket.close = ((code?: number, reason?: string) => {
    socket.closeCalls += 1;
    const closeInfo: { code?: number; reason?: string } = {};
    if (code !== undefined) {
      closeInfo.code = code;
    }
    if (reason !== undefined) {
      closeInfo.reason = reason;
    }
    socket.closeCodes.push(closeInfo);
    throw new Error("close failed");
  }) as FakeWebSocket["close"];

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => undefined,
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: new Map<string, WebSocket>(),
    isShuttingDown: () => true,
  });

  try {
    wss.emit(
      "connection",
      socket as unknown as WebSocket,
      createConnectionRequest(createWsToken("activity-shutdown-close-fails")),
    );
    await flushAsyncWork();

    assert.equal(socket.closeCalls, 1);
    assert.equal(socket.terminateCalls, 1);
    assert.deepEqual(socket.closeCodes[0], {
      code: RUNTIME_WS_CLOSE_GOING_AWAY,
      reason: "server shutting down",
    });
  } finally {
    wss.emit("close");
  }
});

test("createRuntimeWebSocketManager rate limits repeated upgrade attempts per IP", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const sockets = [new FakeWebSocket(), new FakeWebSocket(), new FakeWebSocket()];
  let storageLookupCount = 0;

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => {
        storageLookupCount += 1;
        return undefined;
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    upgradeRateLimiter: createRuntimeWsUpgradeRateLimiter({
      maxAttempts: 2,
      windowMs: 60_000,
    }),
  });

  try {
    for (const socket of sockets) {
      wss.emit(
        "connection",
        socket as unknown as WebSocket,
        createConnectionRequest(undefined, { remoteAddress: "203.0.113.42" }),
      );
      await flushAsyncWork();
    }

    assert.equal(storageLookupCount, 0);
    assert.equal(providedMap.size, 0);
    assert.equal(sockets[0].closeCalls, 1);
    assert.equal(sockets[1].closeCalls, 1);
    assert.deepEqual(sockets[2].closeCodes[0], {
      code: 1013,
      reason: "rate limited",
    });
  } finally {
    wss.emit("close");
  }
});

test("createRuntimeWebSocketManager trusts forwarded IP only when trusted proxies are enabled", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const sockets = [new FakeWebSocket(), new FakeWebSocket()];

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => undefined,
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    trustForwardedHeaders: true,
    upgradeRateLimiter: createRuntimeWsUpgradeRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
    }),
  });

  try {
    for (const socket of sockets) {
      wss.emit(
        "connection",
        socket as unknown as WebSocket,
        createConnectionRequest(undefined, {
          forwardedFor: "198.51.100.20, 10.0.0.1",
          forwardedHost: "example.test",
          forwardedProto: "http",
          remoteAddress: socket === sockets[0] ? "10.0.0.7" : "10.0.0.8",
        }),
      );
      await flushAsyncWork();
    }

    assert.deepEqual(sockets[1].closeCodes[0], {
      code: 1013,
      reason: "rate limited",
    });
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

test("broadcastWsMessage logs send failures before removing the socket", () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const failingSocket = new FakeWebSocket();
  const originalLoggerWarn = logger.warn;
  const warnings: Array<{ message: string; payload: unknown }> = [];
  let clearSessionCalls = 0;
  failingSocket.send = () => {
    throw new Error("send exploded");
  };
  providedMap.set("activity-send-failure", failingSocket as unknown as WebSocket);
  logger.warn = ((message: string, payload: unknown) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => undefined,
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: "test-secret",
    connectedClients: providedMap,
  });

  try {
    manager.broadcastWsMessage({ type: "ping" });
    assert.equal(providedMap.has("activity-send-failure"), false);
    assert.equal(clearSessionCalls, 1);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "WebSocket broadcast failed");
  } finally {
    logger.warn = originalLoggerWarn;
    wss.emit("close");
  }
});

test("broadcastWsMessage publishes local payloads and consumes remote bus broadcasts", () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const sharedBus = new FakeRuntimeWsSharedBus();

  providedMap.set("activity-shared-broadcast", socket as unknown as WebSocket);
  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => undefined,
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: "test-secret",
    connectedClients: providedMap,
    sharedBus,
  });

  try {
    manager.broadcastWsMessage({ type: "local-ping" });
    sharedBus.emitRemote({
      payload: { type: "remote-ping" },
      type: "broadcast",
    });

    assert.equal(sharedBus.published.length, 1);
    assert.deepEqual(sharedBus.published[0], {
      payload: { type: "local-ping" },
      type: "broadcast",
    });
    assert.deepEqual(socket.sentMessages.map((message) => JSON.parse(message)), [
      { type: "local-ping" },
      { type: "remote-ping" },
    ]);
  } finally {
    wss.emit("close");
  }
});

test("runtime WebSocket shared bus closes matching local sockets from remote workers", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const sharedBus = new FakeRuntimeWsSharedBus();
  let clearSessionCalls = 0;
  const activityId = "activity-shared-close";

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    sharedBus,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();
    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);

    sharedBus.emitRemote({
      activityId,
      reason: "remote-logout",
      type: "closeActivity",
    });

    assert.equal(providedMap.has(activityId), false);
    assert.equal(socket.closeCalls, 1);
    assert.equal(clearSessionCalls, 0);
    assert.equal(sharedBus.published.filter((event) => event.type === "closeActivity").length, 0);
  } finally {
    wss.emit("close");
  }
});

test("runtime WebSocket shared bus publishes local client map removals", async () => {
  const wss = new FakeWebSocketServer();
  const socket = new FakeWebSocket();
  const sharedBus = new FakeRuntimeWsSharedBus();
  const activityId = "activity-local-close-publish";

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    sharedBus,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();
    assert.equal(manager.connectedClients.has(activityId), true);

    manager.connectedClients.delete(activityId);

    assert.deepEqual(sharedBus.published.filter((event) => event.type === "closeActivity"), [
      {
        activityId,
        reason: "client-map-delete",
        type: "closeActivity",
      },
    ]);
  } finally {
    wss.emit("close");
  }
});

test("broadcastWsMessage skips oversized payloads before sending to sockets", () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const originalLoggerWarn = logger.warn;
  const warnings: string[] = [];

  providedMap.set("activity-oversized", socket as unknown as WebSocket);
  logger.warn = ((message: string) => {
    warnings.push(message);
  }) as typeof logger.warn;

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
    manager.broadcastWsMessage({ type: "ping", payload: "x".repeat(70 * 1024) });
    assert.equal(socket.sentMessages.length, 0);
    assert.equal(providedMap.size, 1);
    assert.deepEqual(warnings, ["WebSocket broadcast skipped because the payload is too large"]);
  } finally {
    logger.warn = originalLoggerWarn;
    wss.emit("close");
  }
});

test("broadcastWsMessage gives slow clients a grace period before dropping them", () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const slowSocket = new FakeWebSocket();
  const originalLoggerWarn = logger.warn;
  const warnings: Array<{ message: string; payload: unknown }> = [];
  let clearSessionCalls = 0;
  let nowMs = 0;

  slowSocket.send = (payload: string) => {
    slowSocket.sentMessages.push(String(payload));
    slowSocket.bufferedAmount = 300 * 1024;
  };

  providedMap.set("activity-backpressure", slowSocket as unknown as WebSocket);
  logger.warn = ((message: string, payload: unknown) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => undefined,
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: "test-secret",
    connectedClients: providedMap,
    now: () => nowMs,
  });

  try {
    manager.broadcastWsMessage({ type: "ping" });
    nowMs = 1_000;
    manager.broadcastWsMessage({ type: "ping" });

    assert.equal(slowSocket.sentMessages.length, 1);
    assert.equal(slowSocket.terminateCalls, 0);
    assert.equal(providedMap.has("activity-backpressure"), true);
    assert.equal(clearSessionCalls, 0);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "WebSocket broadcast deferred because the send buffer is backpressured");

    nowMs = 5_000;
    manager.broadcastWsMessage({ type: "ping" });

    assert.equal(slowSocket.sentMessages.length, 1);
    assert.equal(slowSocket.terminateCalls, 1);
    assert.equal(providedMap.has("activity-backpressure"), false);
    assert.equal(clearSessionCalls, 1);
    assert.equal(warnings.length, 2);
    assert.equal(
      warnings[1].message,
      "WebSocket client dropped because the send buffer remained above the runtime limit after grace period",
    );
  } finally {
    logger.warn = originalLoggerWarn;
    wss.emit("close");
  }
});

test("broadcastWsMessage resumes deferred sockets when the send buffer drains during grace", () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const slowSocket = new FakeWebSocket();
  let clearSessionCalls = 0;
  let nowMs = 0;

  slowSocket.bufferedAmount = 250 * 1024;
  providedMap.set("activity-pre-send-backpressure", slowSocket as unknown as WebSocket);

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => undefined,
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: "test-secret",
    connectedClients: providedMap,
    now: () => nowMs,
  });

  try {
    manager.broadcastWsMessage({ type: "ping", payload: "x".repeat(10 * 1024) });

    assert.equal(slowSocket.sentMessages.length, 0);
    assert.equal(slowSocket.terminateCalls, 0);
    assert.equal(providedMap.has("activity-pre-send-backpressure"), true);
    assert.equal(clearSessionCalls, 0);

    nowMs = 1_000;
    slowSocket.bufferedAmount = 0;
    manager.broadcastWsMessage({ type: "ping" });

    assert.equal(slowSocket.sentMessages.length, 1);
    assert.equal(slowSocket.terminateCalls, 0);
    assert.equal(providedMap.has("activity-pre-send-backpressure"), true);
    assert.equal(clearSessionCalls, 0);
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

test("runtime manager rejects query-string session tokens before lookup", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  let lookupCalls = 0;

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => {
        lookupCalls += 1;
        return undefined;
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit(
      "connection",
      socket as unknown as WebSocket,
      createQueryTokenConnectionRequest(createWsToken("activity-query-token")),
    );
    await flushAsyncWork();

    assert.equal(lookupCalls, 0);
    assert.equal(providedMap.size, 0);
    assert.equal(socket.closeCalls, 1);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager tolerates missing host headers during handshake parsing", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-missing-host";
  const warnings: Array<{ message: string; payload: unknown }> = [];
  let lookupCalls = 0;

  t.mock.method(logger, "warn", (message: string, payload: unknown) => {
    warnings.push({ message, payload });
  });

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async (id) => {
        lookupCalls += 1;
        return id === activityId ? createActiveSession(activityId) : undefined;
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    const request = createConnectionRequest(createWsToken(activityId), {
      origin: "http://localhost",
    });
    delete request.headers.host;
    wss.emit("connection", socket as unknown as WebSocket, request);
    await flushAsyncWork();

    assert.equal(lookupCalls, 1);
    assert.equal(providedMap.has(activityId), true);
    assert.equal(socket.closeCalls, 0);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "WebSocket handshake missing host header; using localhost fallback");
    assert.deepEqual(warnings[0].payload, { path: "/ws" });
  } finally {
    wss.emit("close");
  }
});

test("runtime manager rejects malformed handshake URLs before session lookup", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const warnings: Array<{ message: string; payload: unknown }> = [];
  let lookupCalls = 0;

  t.mock.method(logger, "warn", (message: string, payload: unknown) => {
    warnings.push({ message, payload });
  });

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => {
        lookupCalls += 1;
        return undefined;
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    const request = createConnectionRequest(createWsToken("activity-malformed-url"), {
      host: "bad host",
    });
    wss.emit("connection", socket as unknown as WebSocket, request);
    await flushAsyncWork();

    assert.equal(lookupCalls, 0);
    assert.equal(providedMap.size, 0);
    assert.equal(socket.closeCalls, 1);
    assert.deepEqual(socket.closeCodes, [
      { code: 1008, reason: "malformed handshake URL" },
    ]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "WebSocket rejected malformed handshake URL");
    assert.equal(
      typeof warnings[0].payload === "object"
        && warnings[0].payload !== null
        && (warnings[0].payload as { operation?: unknown }).operation,
      "parseWebSocketHandshakeUrl",
    );
  } finally {
    wss.emit("close");
  }
});

test("runtime manager rejects cross-origin browser handshakes", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  let lookupCalls = 0;

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => {
        lookupCalls += 1;
        return undefined;
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit(
      "connection",
      socket as unknown as WebSocket,
      createCrossOriginConnectionRequest(createWsToken("activity-cross-origin")),
    );
    await flushAsyncWork();

    assert.equal(lookupCalls, 0);
    assert.equal(providedMap.size, 0);
    assert.equal(socket.closeCalls, 1);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager rejects browser handshakes without an Origin header", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const warnings: Array<{ message: string; payload: Record<string, unknown> }> = [];
  let lookupCalls = 0;
  t.mock.method(logger, "warn", (message: string, payload: Record<string, unknown>) => {
    warnings.push({ message, payload });
  });

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => {
        lookupCalls += 1;
        return undefined;
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit(
      "connection",
      socket as unknown as WebSocket,
      createConnectionRequest(createWsToken("activity-missing-origin"), {
        origin: "",
      }),
    );
    await flushAsyncWork();

    assert.equal(lookupCalls, 0);
    assert.equal(providedMap.size, 0);
    assert.equal(socket.closeCalls, 1);
    assert.equal(warnings[0]?.message, "WebSocket rejected missing-origin handshake");
    assert.equal(warnings[0]?.payload.origin, null);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager rejects browser handshakes when the origin protocol mismatches the request protocol", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  let lookupCalls = 0;

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => {
        lookupCalls += 1;
        return undefined;
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit(
      "connection",
      socket as unknown as WebSocket,
      createConnectionRequest(createWsToken("activity-proto-mismatch"), {
        origin: "https://example.test",
        encrypted: false,
      }),
    );
    await flushAsyncWork();

    assert.equal(lookupCalls, 0);
    assert.equal(providedMap.size, 0);
    assert.equal(socket.closeCalls, 1);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager ignores forwarded host and proto headers unless explicitly trusted", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  let lookupCalls = 0;
  const warnings: Array<{ message: string; payload: Record<string, unknown> }> = [];
  t.mock.method(logger, "warn", (message: string, payload: Record<string, unknown>) => {
    warnings.push({ message, payload });
  });

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => {
        lookupCalls += 1;
        return createActiveSession("activity-forwarded-untrusted");
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit(
      "connection",
      socket as unknown as WebSocket,
      createConnectionRequest(createWsToken("activity-forwarded-untrusted"), {
        host: "internal.gateway",
        origin: "https://public.example",
        forwardedHost: "public.example",
        forwardedProto: "https",
        encrypted: false,
      }),
    );
    await flushAsyncWork();

    assert.equal(lookupCalls, 0);
    assert.equal(providedMap.size, 0);
    assert.equal(socket.closeCalls, 1);
    assert.equal(
      warnings.some((entry) =>
        entry.message === "WebSocket handshake included forwarded headers without trusted proxy configuration"
        && entry.payload.hasForwardedHost === true
        && entry.payload.hasForwardedProto === true
        && entry.payload.trustedProxiesConfigured === false,
      ),
      true,
    );
  } finally {
    wss.emit("close");
  }
});

test("runtime manager accepts trusted forwarded host and proto headers", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-forwarded-trusted";

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    trustForwardedHeaders: true,
  });

  try {
    wss.emit(
      "connection",
      socket as unknown as WebSocket,
      createConnectionRequest(createWsToken(activityId), {
        host: "internal.gateway",
        origin: "https://public.example",
        forwardedHost: "public.example",
        forwardedProto: "https",
        encrypted: false,
      }),
    );
    await flushAsyncWork();

    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);
    assert.equal(socket.closeCalls, 0);
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

test("runtime manager sanitizes socket error logs before writing debug output", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-sanitized-error";
  const debugLogs: Array<{ message: string; payload: unknown }> = [];

  const debugMock = t.mock.method(logger, "debug", (message: string, payload: unknown) => {
    debugLogs.push({ message, payload });
  });

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

    socket.fail(new Error("socket internals should stay out of logs"));
    await flushAsyncWork();

    assert.ok(debugMock.mock.callCount() >= 1);
    const socketErrorLog = debugLogs.find((entry) => entry.message === "WebSocket errored");
    assert.deepEqual(socketErrorLog?.payload, {
      activityId,
      error: {
        name: "Error",
      },
    });
  } finally {
    wss.emit("close");
  }
});

test("runtime manager removes registered sockets cleanly on close", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-registered-close";
  let clearSessionCalls = 0;

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);

    socket.close();
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(clearSessionCalls, 1);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
    assert.deepEqual(manager.getLifecycleSnapshot(), {
      cleanupCallbacks: 0,
      connectedClients: 0,
      socketEntriesByActivity: 0,
      socketEntriesByInstance: 0,
      trackedSockets: 0,
    });
  } finally {
    wss.emit("close");
  }
});

test("runtime manager preserves unmanaged socket listeners during cleanup", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-preserve-unmanaged-listeners";
  let unmanagedMessageCalls = 0;
  socket.on("message", () => {
    unmanagedMessageCalls += 1;
  });

  const manager = createRuntimeWebSocketManager({
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
    assert.equal(socket.listenerCount("message"), 2);

    socket.close();
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(socket.listenerCount("message"), 1);
    socket.emit("message", Buffer.from("after-cleanup"));
    assert.equal(unmanagedMessageCalls, 1);
    assert.deepEqual(manager.getLifecycleSnapshot(), {
      cleanupCallbacks: 0,
      connectedClients: 0,
      socketEntriesByActivity: 0,
      socketEntriesByInstance: 0,
      trackedSockets: 0,
    });
  } finally {
    wss.emit("close");
  }
});

test("runtime manager clears lifecycle registry even when listener cleanup throws", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-cleanup-detach-failure";
  const debugLogs: string[] = [];
  let clearSessionCalls = 0;
  t.mock.method(logger, "debug", (message: string) => {
    debugLogs.push(message);
  });

  const originalRemoveListener = socket.removeListener.bind(socket);
  socket.removeListener = ((eventName, listener) => {
    if (eventName === "pong") {
      throw new Error("listener cleanup failed");
    }
    return originalRemoveListener(eventName, listener);
  }) as typeof socket.removeListener;

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);

    socket.fail(new Error("socket failed during cleanup"));
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(clearSessionCalls, 1);
    assert.equal(
      debugLogs.includes("WebSocket lifecycle handler detach failed during cleanup"),
      true,
    );
    assert.deepEqual(manager.getLifecycleSnapshot(), {
      cleanupCallbacks: 0,
      connectedClients: 0,
      socketEntriesByActivity: 0,
      socketEntriesByInstance: 0,
      trackedSockets: 0,
    });
  } finally {
    wss.emit("close");
  }
});

test("runtime manager does not retain socket state across rapid reconnect cycles", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const activityCount = 100;
  let clearSessionCalls = 0;

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async (activityId: string) => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    maxConnections: activityCount,
    upgradeRateLimiter: createRuntimeWsUpgradeRateLimiter({
      maxAttempts: activityCount,
      windowMs: 60_000,
    }),
  });

  try {
    for (let index = 0; index < activityCount; index += 1) {
      const activityId = `activity-reconnect-loop-${index}`;
      const socket = new FakeWebSocket();
      wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
      await flushAsyncWork();
      socket.close();
      await flushAsyncWork();
    }

    assert.equal(clearSessionCalls, activityCount);
    assert.deepEqual(manager.getLifecycleSnapshot(), {
      cleanupCallbacks: 0,
      connectedClients: 0,
      socketEntriesByActivity: 0,
      socketEntriesByInstance: 0,
      trackedSockets: 0,
    });
  } finally {
    wss.emit("close");
  }
});

test("runtime manager removes registered sockets cleanly on error", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-registered-error";
  let clearSessionCalls = 0;

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);

    socket.fail(new Error("registered socket failed"));
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(clearSessionCalls, 1);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager logs nickname cleanup failures without retaining WebSocket state", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-clear-session-failure";
  const errorLogs: Array<{ message: string; payload: unknown }> = [];

  t.mock.method(logger, "error", (message: string, payload: unknown) => {
    errorLogs.push({ message, payload });
  });

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        throw new Error("storage unavailable");
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);

    socket.close();
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
    assert.equal(errorLogs.length, 1);
    assert.equal(errorLogs[0].message, "Failed to clear nickname session after WebSocket cleanup");
    assert.deepEqual(errorLogs[0].payload, {
      activityId,
      operation: "clearCollectionNicknameSessionByActivity",
      reason: "socket-close",
      error: {
        name: "Error",
      },
    });
  } finally {
    wss.emit("close");
  }
});

test("runtime manager registers the replacement socket before closing the previous connection", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const previousSocket = new FakeWebSocket();
  const replacementSocket = new FakeWebSocket();
  const activityId = "activity-reconnect";

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
    wss.emit("connection", previousSocket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();
    assert.equal(providedMap.get(activityId), previousSocket as unknown as WebSocket);

    wss.emit("connection", replacementSocket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    assert.equal(previousSocket.closeCalls, 1);
    assert.equal(providedMap.get(activityId), replacementSocket as unknown as WebSocket);
    assert.equal(providedMap.has(activityId), true);
    assert.equal(previousSocket.listenerCount("close"), 0);
    assert.equal(previousSocket.listenerCount("error"), 0);
    assert.equal(previousSocket.listenerCount("pong"), 0);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager detaches stale listeners from a replaced closed socket", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const previousSocket = new FakeWebSocket();
  const replacementSocket = new FakeWebSocket();
  const activityId = "activity-reconnect-stale-closed";

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
    wss.emit("connection", previousSocket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    previousSocket.readyState = WebSocket.CLOSED;

    wss.emit(
      "connection",
      replacementSocket as unknown as WebSocket,
      createConnectionRequest(createWsToken(activityId)),
    );
    await flushAsyncWork();

    assert.equal(previousSocket.closeCalls, 0);
    assert.equal(previousSocket.listenerCount("close"), 0);
    assert.equal(previousSocket.listenerCount("error"), 0);
    assert.equal(previousSocket.listenerCount("pong"), 0);
    assert.equal(providedMap.get(activityId), replacementSocket as unknown as WebSocket);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager enforces a per-user connection limit", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const sockets = Array.from({ length: 6 }, () => new FakeWebSocket());
  const originalLoggerWarn = logger.warn;
  const warnings: Array<{ message: string; payload: unknown }> = [];

  logger.warn = ((message: string, payload: unknown) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async (activityId: string) => ({
        ...createActiveSession(activityId),
        userId: "user-shared",
        username: "same.user",
      }),
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    for (let index = 0; index < sockets.length; index += 1) {
      const activityId = `activity-user-limit-${index}`;
      wss.emit(
        "connection",
        sockets[index] as unknown as WebSocket,
        createConnectionRequest(createWsToken(activityId)),
      );
      await flushAsyncWork();
    }

    assert.equal(providedMap.size, 5);
    assert.equal(providedMap.has("activity-user-limit-5"), false);
    assert.equal(sockets[5].closeCalls, 1);
    assert.deepEqual(sockets[5].closeCodes, [
      { code: 1008, reason: "connection limit reached" },
    ]);
    assert.equal(
      warnings.some(
        (entry) =>
          entry.message === "WebSocket rejected because the user connection limit was reached"
          && typeof entry.payload === "object"
          && entry.payload !== null
          && (entry.payload as { maxConnectionsPerUser?: unknown }).maxConnectionsPerUser === 5,
      ),
      true,
    );
  } finally {
    logger.warn = originalLoggerWarn;
    wss.emit("close");
  }
});

test("runtime manager enforces the global connection limit across in-flight handshakes", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const firstSocket = new FakeWebSocket();
  const secondSocket = new FakeWebSocket();
  const firstActivityId = "activity-global-limit-first";
  const secondActivityId = "activity-global-limit-second";
  const firstSession = createDeferred<UserActivity>();

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async (activityId: string) => {
        if (activityId === firstActivityId) {
          return firstSession.promise;
        }
        return createActiveSession(activityId);
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    maxConnections: 1,
  });

  try {
    wss.emit(
      "connection",
      firstSocket as unknown as WebSocket,
      createConnectionRequest(createWsToken(firstActivityId)),
    );
    await flushAsyncWork();

    assert.equal(firstSocket.closeCalls, 0);
    assert.equal(providedMap.size, 0);

    wss.emit(
      "connection",
      secondSocket as unknown as WebSocket,
      createConnectionRequest(createWsToken(secondActivityId)),
    );
    await flushAsyncWork();

    assert.equal(providedMap.has(secondActivityId), false);
    assert.deepEqual(secondSocket.closeCodes, [
      { code: 1013, reason: "server connection limit reached" },
    ]);

    firstSession.resolve(createActiveSession(firstActivityId));
    await flushAsyncWork();

    assert.equal(providedMap.get(firstActivityId), firstSocket as unknown as WebSocket);
  } finally {
    firstSession.resolve(createActiveSession(firstActivityId));
    wss.emit("close");
  }
});

test("runtime manager enforces active per-IP connection limits and releases counts on close", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const firstSocket = new FakeWebSocket();
  const secondSocket = new FakeWebSocket();
  const thirdSocket = new FakeWebSocket();
  const fourthSocket = new FakeWebSocket();
  const clientIp = "198.51.100.77";
  const firstActivityId = "activity-ip-limit-first";
  const secondActivityId = "activity-ip-limit-second";
  const thirdActivityId = "activity-ip-limit-third";
  const fourthActivityId = "activity-ip-limit-fourth";

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async (activityId: string) => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    maxConnectionsPerIp: 2,
  });

  try {
    wss.emit(
      "connection",
      firstSocket as unknown as WebSocket,
      createConnectionRequest(createWsToken(firstActivityId), { remoteAddress: clientIp }),
    );
    wss.emit(
      "connection",
      secondSocket as unknown as WebSocket,
      createConnectionRequest(createWsToken(secondActivityId), { remoteAddress: clientIp }),
    );
    await flushAsyncWork();

    assert.equal(providedMap.get(firstActivityId), firstSocket as unknown as WebSocket);
    assert.equal(providedMap.get(secondActivityId), secondSocket as unknown as WebSocket);

    wss.emit(
      "connection",
      thirdSocket as unknown as WebSocket,
      createConnectionRequest(createWsToken(thirdActivityId), { remoteAddress: clientIp }),
    );
    await flushAsyncWork();

    assert.equal(providedMap.has(thirdActivityId), false);
    assert.deepEqual(thirdSocket.closeCodes, [
      { code: 1013, reason: "ip connection limit reached" },
    ]);

    firstSocket.close();
    await flushAsyncWork();

    wss.emit(
      "connection",
      fourthSocket as unknown as WebSocket,
      createConnectionRequest(createWsToken(fourthActivityId), { remoteAddress: clientIp }),
    );
    await flushAsyncWork();

    assert.equal(providedMap.has(firstActivityId), false);
    assert.equal(providedMap.get(fourthActivityId), fourthSocket as unknown as WebSocket);
    assert.equal(fourthSocket.closeCalls, 0);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager closes clients that exceed the inbound message rate limit", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-message-rate-limit";
  let clearSessionCalls = 0;

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    messageRateLimiterFactory: () =>
      createRuntimeWsMessageRateLimiter({
        maxMessages: 2,
        windowMs: 60_000,
      }),
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);

    socket.emit("message", "one");
    socket.emit("message", "two");
    socket.emit("message", "three");
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(clearSessionCalls, 1);
    assert.deepEqual(socket.closeCodes[0], {
      code: 1008,
      reason: "message rate limited",
    });
    assert.equal(socket.listenerCount("message"), 0);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager logs large inbound WebSocket frames without payload contents", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-large-frame";
  const warnings: Array<{ message: string; payload: Record<string, unknown> }> = [];
  t.mock.method(logger, "warn", (message: string, payload: Record<string, unknown>) => {
    warnings.push({ message, payload });
  });

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    largeMessageWarnBytes: 4,
    messageRateLimiterFactory: () =>
      createRuntimeWsMessageRateLimiter({
        maxMessages: 10,
        windowMs: 60_000,
      }),
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    socket.emit("message", Buffer.from("12345"));
    await flushAsyncWork();

    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);
    assert.equal(warnings[0]?.message, "Large WebSocket inbound frame observed");
    assert.deepEqual(warnings[0]?.payload, {
      activityId,
      messageBytes: 5,
      thresholdBytes: 4,
    });
  } finally {
    wss.emit("close");
  }
});

test("runtime manager closes clients that exceed the inbound WebSocket message size limit", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-message-too-big";
  const warnings: Array<{ message: string; payload: Record<string, unknown> }> = [];
  let clearSessionCalls = 0;
  t.mock.method(logger, "warn", (message: string, payload: Record<string, unknown>) => {
    warnings.push({ message, payload });
  });

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    maxMessageBytes: 4,
    messageRateLimiterFactory: () =>
      createRuntimeWsMessageRateLimiter({
        maxMessages: 10,
        windowMs: 60_000,
      }),
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    socket.emit("message", Buffer.from("12345"));
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(clearSessionCalls, 1);
    assert.deepEqual(socket.closeCodes[0], {
      code: 1009,
      reason: "message too big",
    });
    assert.equal(socket.listenerCount("message"), 0);
    assert.equal(warnings[0]?.message, "WebSocket inbound message exceeded size limit");
    assert.deepEqual(warnings[0]?.payload, {
      activityId,
      clientIp: "203.0.113.10",
      maxBytes: 4,
      messageBytes: 5,
    });
  } finally {
    wss.emit("close");
  }
});

test("runtime manager accepts exactly the default WebSocket message limit and closes one byte over", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-default-message-limit";
  let clearSessionCalls = 0;

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    maxPayloadWindowBytes: DEFAULT_RUNTIME_WS_MAX_MESSAGE_BYTES * 3,
    messageRateLimiterFactory: () =>
      createRuntimeWsMessageRateLimiter({
        maxMessages: 10,
        windowMs: 60_000,
      }),
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    socket.emit("message", Buffer.alloc(DEFAULT_RUNTIME_WS_MAX_MESSAGE_BYTES));
    await flushAsyncWork();

    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);
    assert.equal(socket.closeCalls, 0);

    socket.emit("message", Buffer.alloc(DEFAULT_RUNTIME_WS_MAX_MESSAGE_BYTES + 1));
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(clearSessionCalls, 1);
    assert.deepEqual(socket.closeCodes[0], {
      code: RUNTIME_WS_CLOSE_MESSAGE_TOO_BIG,
      reason: "message too big",
    });
  } finally {
    wss.emit("close");
  }
});

test("runtime manager closes clients that exceed the inbound payload byte window", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-payload-window";
  const warnings: Array<{ message: string; payload: Record<string, unknown> }> = [];
  const metricCalls: string[] = [];
  let clearSessionCalls = 0;
  t.mock.method(logger, "warn", (message: string, payload: Record<string, unknown>) => {
    warnings.push({ message, payload });
  });

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    maxMessageBytes: 10,
    maxPayloadWindowBytes: 20,
    payloadWindowMs: 60_000,
    metrics: {
      increment(name) {
        metricCalls.push(name);
      },
    },
    messageRateLimiterFactory: () =>
      createRuntimeWsMessageRateLimiter({
        maxMessages: 100,
        windowMs: 60_000,
      }),
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    socket.emit("message", Buffer.from("123456"));
    socket.emit("message", Buffer.from("123456"));
    socket.emit("message", Buffer.from("123456"));
    socket.emit("message", Buffer.from("123456"));
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(clearSessionCalls, 1);
    assert.deepEqual(socket.closeCodes[0], {
      code: RUNTIME_WS_CLOSE_MESSAGE_TOO_BIG,
      reason: "payload window exceeded",
    });
    assert.deepEqual(metricCalls, ["webSocketPayloadWindowExceededTotal"]);
    assert.equal(warnings[0]?.message, "WebSocket inbound payload window exceeded size limit");
    assert.deepEqual(warnings[0]?.payload, {
      activityId,
      clientIp: "203.0.113.10",
      maxBytes: 20,
      messageBytes: 6,
      windowMs: 60_000,
    });
    assert.equal(socket.listenerCount("message"), 0);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager uses terminate fallback when oversized close frame fails", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-close-throws";

  socket.close = ((code?: number, reason?: string) => {
    socket.closeCalls += 1;
    const closeInfo: { code?: number; reason?: string } = {};
    if (code !== undefined) {
      closeInfo.code = code;
    }
    if (reason !== undefined) {
      closeInfo.reason = reason;
    }
    socket.closeCodes.push(closeInfo);
    throw new Error("close failed");
  }) as FakeWebSocket["close"];

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    maxMessageBytes: 4,
    messageRateLimiterFactory: () =>
      createRuntimeWsMessageRateLimiter({
        maxMessages: 10,
        windowMs: 60_000,
      }),
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    socket.emit("message", Buffer.from("12345"));
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(socket.closeCalls, 1);
    assert.equal(socket.terminateCalls, 1);
    assert.deepEqual(socket.closeCodes[0], {
      code: RUNTIME_WS_CLOSE_MESSAGE_TOO_BIG,
      reason: "message too big",
    });
  } finally {
    wss.emit("close");
  }
});

test("runtime manager resets payload byte tracking when a socket disconnects", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const firstSocket = new FakeWebSocket();
  const secondSocket = new FakeWebSocket();
  const activityId = "activity-payload-window-reset";

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    maxMessageBytes: 16,
    maxPayloadWindowBytes: 20,
    payloadWindowMs: 60_000,
    messageRateLimiterFactory: () =>
      createRuntimeWsMessageRateLimiter({
        maxMessages: 10,
        windowMs: 60_000,
      }),
  });

  try {
    wss.emit("connection", firstSocket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    firstSocket.emit("message", Buffer.from("123456789012345"));
    await flushAsyncWork();
    assert.equal(providedMap.get(activityId), firstSocket as unknown as WebSocket);

    firstSocket.close();
    await flushAsyncWork();
    assert.equal(providedMap.has(activityId), false);

    wss.emit("connection", secondSocket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    secondSocket.emit("message", Buffer.from("123456789012345"));
    await flushAsyncWork();

    assert.equal(providedMap.get(activityId), secondSocket as unknown as WebSocket);
    assert.equal(secondSocket.closeCalls, 0);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager tolerates repeated terminal lifecycle signals without duplicate tracked state", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-repeat-cleanup";
  let clearSessionCalls = 0;

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
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
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(clearSessionCalls, 1);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
    assert.deepEqual(manager.getLifecycleSnapshot(), {
      cleanupCallbacks: 0,
      connectedClients: 0,
      socketEntriesByActivity: 0,
      socketEntriesByInstance: 0,
      trackedSockets: 0,
    });
  } finally {
    wss.emit("close");
  }
});

test("runtime manager clears tracked client state when the WebSocket server closes", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-server-close";
  let clearSessionCalls = 0;

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
  await flushAsyncWork();

  assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);

  wss.emit("close");
  await flushAsyncWork();

  assert.equal(providedMap.size, 0);
  assert.equal(clearSessionCalls, 1);
  assert.equal(socket.closeCalls, 1);
  assert.equal(socket.listenerCount("close"), 0);
  assert.equal(socket.listenerCount("error"), 0);
  assert.equal(socket.listenerCount("pong"), 0);
  assert.deepEqual(manager.getLifecycleSnapshot(), {
    cleanupCallbacks: 0,
    connectedClients: 0,
    socketEntriesByActivity: 0,
    socketEntriesByInstance: 0,
    trackedSockets: 0,
  });
});

test("runtime manager heartbeat cleans sockets removed externally from the shared client map", async () => {
  const heartbeat = interceptHeartbeatRegistration();
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-external-map-delete";
  let clearSessionCalls = 0;

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);

    providedMap.delete(activityId);
    heartbeat.getHeartbeatCallback()();
    await flushAsyncWork();

    assert.equal(providedMap.has(activityId), false);
    assert.equal(socket.closeCalls, 1);
    assert.equal(clearSessionCalls, 0);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
  } finally {
    heartbeat.restore();
    wss.emit("close");
  }
});

test("runtime manager heartbeat does not terminate sockets that are still connecting", async () => {
  const heartbeat = interceptHeartbeatRegistration();
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-heartbeat-connecting";

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

    socket.readyState = WebSocket.CONNECTING;
    heartbeat.getHeartbeatCallback()();

    assert.equal(socket.terminateCalls, 0);
    assert.equal(socket.pingCalls, 0);
    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);
  } finally {
    heartbeat.restore();
    wss.emit("close");
  }
});

test("runtime manager heartbeat terminates stale sockets and clears tracked state", async () => {
  const heartbeat = interceptHeartbeatRegistration();
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-heartbeat-stale";
  let clearSessionCalls = 0;

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    heartbeat.getHeartbeatCallback()();
    assert.equal(socket.pingCalls, 1);
    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);

    heartbeat.getHeartbeatCallback()();
    await flushAsyncWork();

    assert.equal(socket.terminateCalls, 1);
    assert.equal(providedMap.has(activityId), false);
    assert.equal(clearSessionCalls, 1);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
  } finally {
    heartbeat.restore();
    wss.emit("close");
  }
});

test("runtime manager heartbeat removes sockets when ping fails", async (t) => {
  const heartbeat = interceptHeartbeatRegistration();
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-heartbeat-ping-failed";
  const warnings: Array<{ message: string; payload: Record<string, unknown> }> = [];
  let clearSessionCalls = 0;

  socket.ping = () => {
    socket.pingCalls += 1;
    throw Object.assign(new Error("raw socket payload must not leak"), {
      code: "EPIPE",
    });
  };
  t.mock.method(logger, "warn", (message: string, payload: Record<string, unknown>) => {
    warnings.push({ message, payload });
  });

  const manager = createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => {
        clearSessionCalls += 1;
      },
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    heartbeat.getHeartbeatCallback()();
    await flushAsyncWork();

    assert.equal(socket.pingCalls, 1);
    assert.equal(socket.terminateCalls, 1);
    assert.equal(providedMap.has(activityId), false);
    assert.equal(clearSessionCalls, 1);
    assert.equal(socket.listenerCount("close"), 0);
    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("pong"), 0);
    assert.deepEqual(manager.getLifecycleSnapshot(), {
      cleanupCallbacks: 0,
      connectedClients: 0,
      socketEntriesByActivity: 0,
      socketEntriesByInstance: 0,
      trackedSockets: 0,
    });

    const pingWarning = warnings.find(
      (warning) => warning.message === "WebSocket heartbeat ping failed; client removed",
    );
    assert.deepEqual(pingWarning?.payload, {
      activityId,
      error: {
        code: "EPIPE",
        name: "Error",
      },
    });
    assert.doesNotMatch(JSON.stringify(warnings), /raw socket payload/);
    assert.deepEqual(
      warnings.find((warning) => warning.message === "WebSocket heartbeat stale sweep removed clients")?.payload,
      {
        closedTrackedSockets: 0,
        desyncedEntries: 0,
        failedPings: 1,
        heartbeatTimeouts: 0,
        mismatchedEntries: 0,
        staleClientMapEntries: 0,
        staleTotal: 1,
      },
    );
  } finally {
    heartbeat.restore();
    wss.emit("close");
  }
});
