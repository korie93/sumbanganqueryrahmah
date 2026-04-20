import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import {
  RUNTIME_WS_CLOSE_REASON_SESSION_EXPIRED,
  RUNTIME_WS_CLOSE_REASON_SESSION_INVALID,
  RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE,
} from "../../../shared/websocket-close-reasons";
import type { UserActivity } from "../../../shared/schema-postgres";
import {
  clearSessionRevocationsForTests,
  revokeSession,
} from "../../auth/session-revocation-registry";
import { logger } from "../../lib/logger";
import { createRuntimeWebSocketManager } from "../runtime-manager";
import {
  HEARTBEAT_INTERVAL_MS,
  RUNTIME_WS_PENDING_AUTH_TTL_MS,
  RUNTIME_WS_TRACKED_SOCKET_SWEEP_INTERVAL_MS,
} from "../ws-runtime-types";

class FakeWebSocketServer extends EventEmitter {}
class FakeWebSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  closeCalls = 0;
  closeCode: number | undefined = undefined;
  closeReason = "";
  terminateCalls = 0;
  pingCalls = 0;
  bufferedAmount = 0;
  sentMessages: string[] = [];

  send(payload: string) {
    this.sentMessages.push(String(payload));
  }

  close(code?: number, reason?: Buffer | string) {
    this.closeCalls += 1;
    this.closeCode = code;
    this.closeReason = typeof reason === "string" ? reason : reason ? String(reason) : "";
    if (this.readyState === WebSocket.CLOSED) {
      return;
    }

    this.readyState = WebSocket.CLOSED;
    this.emit("close", {
      code: code ?? 1005,
      reason: this.closeReason,
      wasClean: true,
    });
  }

  terminate() {
    this.terminateCalls += 1;
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }

  ping() {
    this.pingCalls += 1;
  }

  sendMessage(payload = "ping", isBinary = false) {
    this.emit("message", payload, isBinary);
  }

  fail(error = new Error("socket failed")) {
    this.readyState = WebSocket.CLOSED;
    this.emit("error", error);
  }
}

const TEST_SECRET = "runtime-manager-test-secret";

test.beforeEach(() => {
  clearSessionRevocationsForTests();
});

test.afterEach(() => {
  clearSessionRevocationsForTests();
});

function createWsToken(activityId: string) {
  return jwt.sign({ activityId }, TEST_SECRET, { algorithm: "HS256" });
}

type RuntimeConnectionRequest = Pick<IncomingMessage, "url" | "headers" | "socket">;

function createConnectionRequest(
  token?: string,
  options?: {
    host?: string;
    origin?: string | null;
    forwardedHost?: string;
    forwardedProto?: string;
    encrypted?: boolean;
    remoteAddress?: string;
  },
): RuntimeConnectionRequest {
  const headers: Record<string, string> = {
    host: options?.host ?? "example.test",
  };
  if (options?.origin !== null) {
    headers.origin = options?.origin ?? "http://example.test";
  }
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
      remoteAddress: options?.remoteAddress ?? "127.0.0.1",
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

function assertNoRuntimeSocketListeners(socket: FakeWebSocket) {
  assert.equal(socket.listenerCount("close"), 0);
  assert.equal(socket.listenerCount("error"), 0);
  assert.equal(socket.listenerCount("pong"), 0);
  assert.equal(socket.listenerCount("message"), 0);
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

function interceptRuntimeIntervalRegistrations() {
  const originalSetInterval = global.setInterval;
  const callbacksByDelay = new Map<number, () => void>();

  global.setInterval = (((
    callback: TimerHandler,
    delay?: number,
    ...args: unknown[]
  ) => {
    const normalizedDelay = Math.max(0, Number(delay ?? 0));
    callbacksByDelay.set(normalizedDelay, () => {
      if (typeof callback === "function") {
        callback(...args);
        return;
      }
      throw new Error(`Unexpected string timer callback: ${String(callback)} with delay ${String(delay)}`);
    });

    const handle = originalSetInterval(() => undefined, 60_000);
    handle.unref();
    return handle;
  }) as unknown as typeof global.setInterval);

  return {
    getCallback(delayMs: number) {
      const callback = callbacksByDelay.get(delayMs);
      if (!callback) {
        throw new Error(`Expected interval with delay ${delayMs}ms to be registered.`);
      }
      return callback;
    },
    getHeartbeatCallback() {
      return this.getCallback(HEARTBEAT_INTERVAL_MS);
    },
    getTrackedSocketSweepCallback() {
      return this.getCallback(RUNTIME_WS_TRACKED_SOCKET_SWEEP_INTERVAL_MS);
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

test("broadcastWsMessage respects an explicit runtime send-buffer limit override", () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const slowSocket = new FakeWebSocket();
  let clearSessionCalls = 0;

  slowSocket.bufferedAmount = 900;
  providedMap.set("activity-custom-buffer-limit", slowSocket as unknown as WebSocket);

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
    maxBufferedBytes: 1_024,
  });

  try {
    manager.broadcastWsMessage({ type: "ping", payload: "x".repeat(300) });

    assert.equal(slowSocket.sentMessages.length, 0);
    assert.equal(slowSocket.terminateCalls, 1);
    assert.equal(providedMap.has("activity-custom-buffer-limit"), false);
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
    assertNoRuntimeSocketListeners(socket);
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
    assertNoRuntimeSocketListeners(socket);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager rejects revoked session tokens before activity lookup", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  let lookupCalls = 0;

  revokeSession("activity-revoked-socket");

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
      createConnectionRequest(createWsToken("activity-revoked-socket")),
    );
    await flushAsyncWork();

    assert.equal(lookupCalls, 0);
    assert.equal(socket.closeCalls, 1);
    assert.equal(socket.closeCode, RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE);
    assert.equal(socket.closeReason, RUNTIME_WS_CLOSE_REASON_SESSION_INVALID);
    assert.equal(providedMap.size, 0);
    assertNoRuntimeSocketListeners(socket);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager does not re-close sockets that are already closed during early rejection", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  socket.readyState = WebSocket.CLOSED;

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
    wss.emit(
      "connection",
      socket as unknown as WebSocket,
      createQueryTokenConnectionRequest(createWsToken("activity-query-token-closed")),
    );
    await flushAsyncWork();

    assert.equal(socket.closeCalls, 0);
    assert.equal(providedMap.size, 0);
    assertNoRuntimeSocketListeners(socket);
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

test("runtime manager rejects browser handshakes when the origin header is missing", async () => {
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
      createConnectionRequest(createWsToken("activity-missing-origin"), {
        origin: null,
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

test("runtime manager rejects browser handshakes when the origin header is malformed", async () => {
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
      createConnectionRequest(createWsToken("activity-malformed-origin"), {
        origin: "not a valid origin",
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
    trustedForwardedProxies: ["loopback"],
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
        remoteAddress: "127.0.0.1",
      }),
    );
    await flushAsyncWork();

    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);
    assert.equal(socket.closeCalls, 0);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager rejects forwarded host and proto headers when the remote peer is not in the trusted proxy allowlist", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  let lookupCalls = 0;

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => {
        lookupCalls += 1;
        return createActiveSession("activity-forwarded-unallowlisted");
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    trustForwardedHeaders: true,
    trustedForwardedProxies: ["loopback"],
  });

  try {
    wss.emit(
      "connection",
      socket as unknown as WebSocket,
      createConnectionRequest(createWsToken("activity-forwarded-unallowlisted"), {
        host: "internal.gateway",
        origin: "https://public.example",
        forwardedHost: "public.example",
        forwardedProto: "https",
        encrypted: false,
        remoteAddress: "203.0.113.8",
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
    assertNoRuntimeSocketListeners(socket);
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
    assertNoRuntimeSocketListeners(socket);
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
    assertNoRuntimeSocketListeners(socket);
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
    assertNoRuntimeSocketListeners(previousSocket);
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
    assertNoRuntimeSocketListeners(previousSocket);
    assert.equal(providedMap.get(activityId), replacementSocket as unknown as WebSocket);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager drops sockets that send malformed inbound payloads", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-inbound-invalid-payload";
  const warnings: Array<{ message: string; payload: unknown }> = [];

  const warnMock = t.mock.method(logger, "warn", (message: string, payload: unknown) => {
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
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    for (let index = 0; index < 10; index += 1) {
      socket.sendMessage("ping");
    }

    socket.sendMessage("{not-json");

    assert.equal(providedMap.has(activityId), false);
    assert.equal(socket.closeCalls, 1);
    assert.ok(warnMock.mock.callCount() >= 1);
    assert.equal(
      warnings.some(
        (entry) =>
          entry.message === "WebSocket client dropped because the inbound message payload was invalid"
          && typeof entry.payload === "object"
          && entry.payload !== null
          && (entry.payload as { reason?: unknown }).reason === "invalid-json",
      ),
      true,
    );
    assertNoRuntimeSocketListeners(socket);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager drops sockets that exceed the inbound message rate limit", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-inbound-rate-limit";
  const warnings: Array<{ message: string; payload: unknown }> = [];

  const warnMock = t.mock.method(logger, "warn", (message: string, payload: unknown) => {
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
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    for (let index = 0; index < 101; index += 1) {
      socket.sendMessage("ping");
    }

    assert.equal(providedMap.has(activityId), false);
    assert.equal(socket.closeCalls, 1);
    assert.ok(warnMock.mock.callCount() >= 1);
    assert.equal(
      warnings.some(
        (entry) =>
          entry.message === "WebSocket client dropped because the inbound message rate exceeded the runtime limit"
          && typeof entry.payload === "object"
          && entry.payload !== null
          && (entry.payload as { maxMessagesPerMinute?: unknown }).maxMessagesPerMinute === 100,
      ),
      true,
    );
    assertNoRuntimeSocketListeners(socket);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager refills inbound message tokens over time", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-inbound-token-refill";
  let now = 1_000;
  const dateNowMock = t.mock.method(Date, "now", () => now);

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

    for (let index = 0; index < 100; index += 1) {
      socket.sendMessage("ping");
    }

    now += 30_000;
    socket.sendMessage("ping");

    assert.equal(socket.closeCalls, 0);
    assert.equal(providedMap.has(activityId), true);
  } finally {
    dateNowMock.mock.restore();
    wss.emit("close");
  }
});

test("runtime manager logs connected client growth when monitored thresholds are crossed", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const sockets = Array.from({ length: 10 }, () => new FakeWebSocket());
  const infoLogs: Array<{ message: string; payload: unknown }> = [];

  const infoMock = t.mock.method(logger, "info", (message: string, payload: unknown) => {
    infoLogs.push({ message, payload });
  });

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async (activityId: string) => ({
        ...createActiveSession(activityId),
        userId: activityId,
        username: `${activityId}.user`,
      }),
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
  });

  try {
    for (let index = 0; index < sockets.length; index += 1) {
      const activityId = `activity-threshold-${index}`;
      wss.emit(
        "connection",
        sockets[index] as unknown as WebSocket,
        createConnectionRequest(createWsToken(activityId)),
      );
      await flushAsyncWork();
    }

    assert.equal(providedMap.size, 10);
    assert.ok(infoMock.mock.callCount() >= 1);
    assert.equal(
      infoLogs.some(
        (entry) =>
          entry.message === "WebSocket connectedClients map reached a monitored size threshold"
          && typeof entry.payload === "object"
          && entry.payload !== null
          && (entry.payload as { threshold?: unknown }).threshold === 10
          && (entry.payload as { peakConnectedClients?: unknown }).peakConnectedClients === 10,
      ),
      true,
    );
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

test("runtime manager enforces a per-instance connection limit", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const sockets = [new FakeWebSocket(), new FakeWebSocket()];
  const warnings: Array<{ message: string; payload: unknown }> = [];

  const warnMock = t.mock.method(logger, "warn", (message: string, payload: unknown) => {
    warnings.push({ message, payload });
  });

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async (activityId: string) => createActiveSession(activityId),
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    maxConnectionsPerInstance: 1,
  });

  try {
    wss.emit(
      "connection",
      sockets[0] as unknown as WebSocket,
      createConnectionRequest(createWsToken("activity-instance-limit-1")),
    );
    await flushAsyncWork();

    wss.emit(
      "connection",
      sockets[1] as unknown as WebSocket,
      createConnectionRequest(createWsToken("activity-instance-limit-2")),
    );
    await flushAsyncWork();

    assert.equal(providedMap.size, 1);
    assert.equal(providedMap.has("activity-instance-limit-1"), true);
    assert.equal(providedMap.has("activity-instance-limit-2"), false);
    assert.equal(sockets[1].closeCalls, 1);
    assert.ok(warnMock.mock.callCount() >= 1);
    assert.equal(
      warnings.some(
        (entry) =>
          entry.message === "WebSocket rejected because the instance connection limit was reached"
          && typeof entry.payload === "object"
          && entry.payload !== null
          && (entry.payload as { maxConnectionsPerInstance?: unknown }).maxConnectionsPerInstance === 1,
      ),
      true,
    );
    assertNoRuntimeSocketListeners(sockets[1]);
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
    assertNoRuntimeSocketListeners(socket);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager still detaches socket listeners when tracked map cleanup throws", async (t) => {
  class ThrowingDeleteMap<K, V> extends Map<K, V> {
    override delete(key: K): boolean {
      super.delete(key);
      throw new Error(`delete failed for ${String(key)}`);
    }
  }

  const wss = new FakeWebSocketServer();
  const providedMap = new ThrowingDeleteMap<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-cleanup-throws";
  const warnings: Array<{ message: string; payload: unknown }> = [];

  const warnMock = t.mock.method(logger, "warn", (message: string, payload: unknown) => {
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
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    assert.doesNotThrow(() => {
      socket.fail(new Error("cleanup should not leak listeners"));
    });

    assert.ok(warnMock.mock.callCount() >= 1);
    assert.equal(
      warnings.some(
        (entry) =>
          entry.message === "WebSocket cleanup failed"
          && typeof entry.payload === "object"
          && entry.payload !== null
          && (entry.payload as { activityId?: unknown }).activityId === activityId
          && (entry.payload as { category?: unknown }).category === "terminal-socket-state"
          && (entry.payload as { phase?: unknown }).phase === "error"
          && (entry.payload as { hadCleanupCallback?: unknown }).hadCleanupCallback === true
          && (entry.payload as { hadSocketEntry?: unknown }).hadSocketEntry === true
          && (entry.payload as { hadTrackedSocketState?: unknown }).hadTrackedSocketState === true
          && (entry.payload as { closeRequested?: unknown }).closeRequested === false
          && (entry.payload as { cleanedUp?: unknown }).cleanedUp === true
          && (entry.payload as { hasToken?: unknown }).hasToken === true
          && (entry.payload as { wsReadyState?: unknown }).wsReadyState === WebSocket.CLOSED,
      ),
      true,
    );
    assertNoRuntimeSocketListeners(socket);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager logs contextual metadata when session revalidation storage lookup fails", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-session-revalidation-error";
  let now = 10_000;
  let lookupCalls = 0;
  const warnings: Array<{ message: string; payload: unknown }> = [];

  t.mock.method(Date, "now", () => now);
  const warnMock = t.mock.method(logger, "warn", (message: string, payload: unknown) => {
    warnings.push({ message, payload });
  });

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async (requestedActivityId: string) => {
        lookupCalls += 1;
        if (requestedActivityId === activityId && lookupCalls >= 2) {
          throw new Error("lookup exploded");
        }
        return createActiveSession(requestedActivityId);
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    sessionRevalidationIntervalMs: 1_000,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    now += 1_001;
    socket.sendMessage("ping");
    await flushAsyncWork();

    assert.equal(lookupCalls, 2);
    assert.equal(providedMap.has(activityId), true);
    assert.equal(socket.closeCalls, 0);
    assert.ok(warnMock.mock.callCount() >= 1);
    assert.equal(
      warnings.some(
        (entry) =>
          entry.message === "WebSocket session revalidation failed"
          && typeof entry.payload === "object"
          && entry.payload !== null
          && (entry.payload as { activityId?: unknown }).activityId === activityId
          && (entry.payload as { phase?: unknown }).phase === "inbound-message"
          && (entry.payload as { closeRequested?: unknown }).closeRequested === false
          && (entry.payload as { cleanedUp?: unknown }).cleanedUp === false
          && (entry.payload as { hasToken?: unknown }).hasToken === true
          && (entry.payload as { sessionRevalidationIntervalMs?: unknown }).sessionRevalidationIntervalMs === 1_000,
      ),
      true,
    );
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
  assert.equal(socket.closeCalls, 1);
  assertNoRuntimeSocketListeners(socket);
});

test("runtime manager closes expired session tokens with a terminal auth reason", async () => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const expiredToken = jwt.sign(
    {
      activityId: "activity-expired-token",
      exp: Math.floor(Date.now() / 1000) - 31,
    },
    TEST_SECRET,
    { algorithm: "HS256" },
  );

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
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(expiredToken));
    await flushAsyncWork();

    assert.equal(socket.closeCalls, 1);
    assert.equal(socket.closeCode, RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE);
    assert.equal(socket.closeReason, RUNTIME_WS_CLOSE_REASON_SESSION_EXPIRED);
    assert.equal(providedMap.size, 0);
    assertNoRuntimeSocketListeners(socket);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager revalidates long-lived sessions on inbound messages and closes invalidated sessions", async (t) => {
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-session-revalidation";
  let now = 1_000_000;
  let lookupCalls = 0;

  t.mock.method(Date, "now", () => now);

  createRuntimeWebSocketManager({
    wss: wss as unknown as import("ws").WebSocketServer,
    storage: {
      getActivityById: async () => {
        lookupCalls += 1;
        return lookupCalls >= 2
          ? {
              ...createActiveSession(activityId),
              isActive: false,
              logoutTime: new Date("2026-04-20T00:00:00.000Z"),
            }
          : createActiveSession(activityId);
      },
      clearCollectionNicknameSessionByActivity: async () => undefined,
    },
    secret: TEST_SECRET,
    connectedClients: providedMap,
    sessionRevalidationIntervalMs: 1_000,
  });

  try {
    wss.emit("connection", socket as unknown as WebSocket, createConnectionRequest(createWsToken(activityId)));
    await flushAsyncWork();

    now += 1_001;
    socket.sendMessage("ping");
    await flushAsyncWork();

    assert.equal(lookupCalls, 2);
    assert.equal(socket.closeCalls, 1);
    assert.equal(socket.closeCode, RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE);
    assert.equal(socket.closeReason, RUNTIME_WS_CLOSE_REASON_SESSION_INVALID);
    assert.equal(providedMap.has(activityId), false);
    assertNoRuntimeSocketListeners(socket);
  } finally {
    wss.emit("close");
  }
});

test("runtime manager expires stale pending-auth sockets from the tracked registry", async (t) => {
  const intervals = interceptRuntimeIntervalRegistrations();
  const wss = new FakeWebSocketServer();
  const providedMap = new Map<string, WebSocket>();
  const socket = new FakeWebSocket();
  const activityId = "activity-pending-auth-expiry";
  const activityLookup = createDeferred<ReturnType<typeof createActiveSession> | undefined>();
  let now = 1_000_000;

  t.mock.method(Date, "now", () => now);

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

    now += RUNTIME_WS_PENDING_AUTH_TTL_MS + 1;
    intervals.getTrackedSocketSweepCallback()();
    await flushAsyncWork();

    activityLookup.resolve(createActiveSession(activityId));
    await flushAsyncWork();

    assert.equal(socket.closeCalls, 1);
    assert.equal(socket.closeCode, RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE);
    assert.equal(socket.closeReason, RUNTIME_WS_CLOSE_REASON_SESSION_INVALID);
    assert.equal(providedMap.has(activityId), false);
    assertNoRuntimeSocketListeners(socket);
  } finally {
    intervals.restore();
    wss.emit("close");
  }
});

test("runtime manager heartbeat does not terminate sockets that are still connecting", async () => {
  const intervals = interceptRuntimeIntervalRegistrations();
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
    intervals.getHeartbeatCallback()();

    assert.equal(socket.terminateCalls, 0);
    assert.equal(socket.pingCalls, 0);
    assert.equal(providedMap.get(activityId), socket as unknown as WebSocket);
  } finally {
    intervals.restore();
    wss.emit("close");
  }
});
