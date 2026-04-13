import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import type { UserActivity } from "../../../shared/schema-postgres";
import { logger } from "../../lib/logger";
import { createRuntimeWebSocketManager } from "../runtime-manager";

class FakeWebSocketServer extends EventEmitter {}
class FakeWebSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  closeCalls = 0;
  terminateCalls = 0;
  pingCalls = 0;
  bufferedAmount = 0;
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

type RuntimeConnectionRequest = Pick<IncomingMessage, "url" | "headers" | "socket">;

function createConnectionRequest(
  token?: string,
  options?: {
    host?: string;
    origin?: string;
    forwardedHost?: string;
    forwardedProto?: string;
    encrypted?: boolean;
  },
): RuntimeConnectionRequest {
  const headers: Record<string, string> = {
    host: options?.host ?? "example.test",
    origin: options?.origin ?? "http://example.test",
  };
  if (options?.forwardedHost) {
    headers["x-forwarded-host"] = options.forwardedHost;
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
    } as unknown) as IncomingMessage["socket"],
  };
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

test("broadcastWsMessage drops sockets whose send buffer exceeds the runtime limit", () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const slowSocket = new FakeWebSocket();
  const originalLoggerWarn = logger.warn;
  const warnings: Array<{ message: string; payload: unknown }> = [];
  let clearSessionCalls = 0;

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
  });

  try {
    manager.broadcastWsMessage({ type: "ping" });
    assert.equal(slowSocket.sentMessages.length, 1);
    assert.equal(slowSocket.terminateCalls, 1);
    assert.equal(providedMap.has("activity-backpressure"), false);
    assert.equal(clearSessionCalls, 1);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "WebSocket client dropped because the send buffer exceeded the runtime limit");
  } finally {
    logger.warn = originalLoggerWarn;
    wss.emit("close");
  }
});

test("broadcastWsMessage drops sockets before send when the next payload would exceed the buffer limit", () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const slowSocket = new FakeWebSocket();
  let clearSessionCalls = 0;

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
  });

  try {
    manager.broadcastWsMessage({ type: "ping", payload: "x".repeat(10 * 1024) });

    assert.equal(slowSocket.sentMessages.length, 0);
    assert.equal(slowSocket.terminateCalls, 1);
    assert.equal(providedMap.has("activity-pre-send-backpressure"), false);
    assert.equal(clearSessionCalls, 1);
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

test("runtime manager ignores forwarded host and proto headers unless explicitly trusted", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  let lookupCalls = 0;

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

test("runtime manager clears tracked client state when the WebSocket server closes", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-server-close";

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
  await flushAsyncWork();

  assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);

  wss.emit("close");

  assert.equal(providedMap.size, 0);
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
