import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import jwt from "jsonwebtoken";
import { WebSocket, type WebSocketServer } from "ws";
import type { UserActivity } from "../../../shared/schema-postgres";
import { createRuntimeWebSocketManager } from "../runtime-manager";
import {
  DEFAULT_RUNTIME_WS_MAX_CONNECTIONS,
  DEFAULT_RUNTIME_WS_MAX_CONNECTIONS_PER_IP,
  DEFAULT_RUNTIME_WS_MAX_UPGRADE_ATTEMPTS_PER_IP,
  type RuntimeManagerOptions,
} from "../runtime-manager-types";

const SECRET = "ws-shared-nat-regression-secret";
const NAT_IP = "203.0.113.42";

class TestSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  closeCode: number | undefined;
  closeReason: string | undefined;
  send() {}
  ping() {}
  close(code?: number, reason?: string) {
    this.closeCode = code;
    this.closeReason = reason;
    if (this.readyState !== WebSocket.CLOSED) {
      this.readyState = WebSocket.CLOSED;
      this.emit("close");
    }
  }
  terminate() { this.close(); }
}

function token(activityId: string, options: { secret?: string; jwtId?: string; userId?: string } = {}) {
  return jwt.sign(
    { activityId, ...(options.userId ? { userId: options.userId } : {}) },
    options.secret ?? SECRET,
    { algorithm: "HS256", jwtid: options.jwtId ?? `jwt-${activityId}` },
  );
}

function session(activityId: string, userId = activityId): UserActivity {
  return { id: activityId, userId, username: userId, isActive: true, logoutTime: null } as UserActivity;
}

function setup(options: Partial<RuntimeManagerOptions> = {}) {
  const wss = new EventEmitter();
  let activityLookups = 0;
  let revocationChecks = 0;
  const manager = createRuntimeWebSocketManager({
    wss: wss as WebSocketServer,
    storage: { getActivityById: async (id) => { activityLookups += 1; return session(id); } },
    secret: SECRET,
    isSessionJwtRevoked: async () => { revocationChecks += 1; return false; },
    ...options,
  });
  const connect = (authToken?: string, ip = NAT_IP, extraHeaders: Record<string, string> = {}) => {
    const socket = new TestSocket();
    const req = {
      url: "/ws",
      headers: {
        host: "example.test",
        origin: "http://example.test",
        ...(authToken ? { cookie: `sqr_auth=${encodeURIComponent(authToken)}` } : {}),
        ...extraHeaders,
      },
      socket: { remoteAddress: ip },
    } as IncomingMessage;
    wss.emit("connection", socket as unknown as WebSocket, req);
    return socket;
  };
  return {
    manager, connect,
    counts: () => ({ activityLookups, revocationChecks }),
    close: () => wss.emit("close"),
  };
}

async function settle() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

for (const users of [20, 30, 50, 100]) {
  test(`WebSocket admits ${users} simultaneous authenticated users sharing one public IP`, async () => {
    const fixture = setup();
    try {
      const sockets = Array.from({ length: users }, (_, index) => fixture.connect(token(`nat-user-${index}`)));
      await settle();
      assert.equal(fixture.manager.connectedClients.size, users);
      assert.deepEqual(fixture.counts(), { activityLookups: users, revocationChecks: users });
      assert.ok(sockets.every((socket) => socket.readyState === WebSocket.OPEN));
    } finally { fixture.close(); }
  });
}

test("WebSocket supports two distinct sessions for each of 100 NAT users and retains the aggregate connection cap", async () => {
  assert.equal(DEFAULT_RUNTIME_WS_MAX_CONNECTIONS, 1_000);
  assert.equal(DEFAULT_RUNTIME_WS_MAX_CONNECTIONS_PER_IP, 200);
  const fixture = setup({
    storage: { getActivityById: async (id) => session(id, id.split("/tab-")[0]) },
  });
  try {
    const sockets = Array.from({ length: 200 }, (_, index) =>
      fixture.connect(token(`person-${Math.floor(index / 2)}/tab-${index % 2}`)));
    const overflow = fixture.connect(token("overflow"));
    await settle();
    assert.equal(fixture.manager.connectedClients.size, 200);
    assert.ok(sockets.every((socket) => socket.readyState === WebSocket.OPEN));
    assert.equal(overflow.closeReason, "ip connection limit reached");
    sockets[0].close();
    const replacement = fixture.connect(token("replacement"));
    await settle();
    assert.equal(replacement.readyState, WebSocket.OPEN);
    assert.equal(fixture.manager.connectedClients.size, 200);
  } finally { fixture.close(); }
});

test("WebSocket user quota spans signed activities and IP changes without blocking another NAT user", async () => {
  let now = 1_000;
  const fixture = setup({
    now: () => now,
    storage: { getActivityById: async (id) => session(id, id.startsWith("abuser-") ? "same-user" : id) },
  });
  try {
    for (let index = 0; index < 30; index += 1) {
      const socket = fixture.connect(token(`abuser-${index}`, { userId: `claimed-user-${index}` }));
      await settle();
      assert.equal(socket.readyState, WebSocket.OPEN);
      socket.close();
    }
    const limited = fixture.connect(token("abuser-30"), "198.51.100.9");
    const peer = fixture.connect(token("another-user"));
    await settle();
    assert.equal(limited.closeReason, "user rate limited");
    assert.equal(peer.readyState, WebSocket.OPEN);
    now += 60_000;
    const reset = fixture.connect(token("abuser-reset"));
    await settle();
    assert.equal(reset.readyState, WebSocket.OPEN);
  } finally { fixture.close(); }
});

for (const kind of ["anonymous", "forged"] as const) {
  test(`WebSocket retains the 30/IP failed-auth quota for ${kind} requests without charging a valid peer`, async () => {
    const fixture = setup();
    try {
      let rejected: TestSocket | undefined;
      for (let index = 0; index < 31; index += 1) {
        rejected = fixture.connect(kind === "anonymous" ? undefined : token(`victim-${index}`, { secret: "wrong-secret" }), NAT_IP, {
          "x-user-id": `forged-user-${index}`,
          "x-forwarded-for": `198.51.100.${index}`,
        });
      }
      assert.equal(rejected?.closeCode, 1013);
      assert.equal(rejected?.closeReason, "rate limited");
      assert.deepEqual(fixture.counts(), { activityLookups: 0, revocationChecks: 0 });
      assert.equal(fixture.manager.getLifecycleSnapshot().trackedSockets, 0);
      const peer = fixture.connect(token("victim-0"));
      await settle();
      assert.equal(peer.readyState, WebSocket.OPEN);
    } finally { fixture.close(); }
  });
}

test("WebSocket preserves the aggregate network flood guard before authentication work", async () => {
  let now = 0;
  const fixture = setup({ now: () => now });
  try {
    assert.equal(DEFAULT_RUNTIME_WS_MAX_UPGRADE_ATTEMPTS_PER_IP, 600);
    for (let index = 0; index < 600; index += 1) fixture.connect();
    const blocked = fixture.connect(token("valid-network-flood"));
    assert.equal(blocked.closeReason, "rate limited");
    assert.deepEqual(fixture.counts(), { activityLookups: 0, revocationChecks: 0 });
    const otherNetwork = fixture.connect(token("other-network"), "198.51.100.9");
    await settle();
    assert.equal(otherNetwork.readyState, WebSocket.OPEN);
    now += 60_000;
    const reset = fixture.connect(token("valid-network-flood"));
    await settle();
    assert.equal(reset.readyState, WebSocket.OPEN);
  } finally { fixture.close(); }
});

test("WebSocket signed activity quota stops repeated revoked sessions before further revocation or storage work", async () => {
  let revocationChecks = 0;
  const fixture = setup({
    isSessionJwtRevoked: async () => { revocationChecks += 1; return true; },
  });
  try {
    let rejected: TestSocket | undefined;
    for (let index = 0; index < 31; index += 1) {
      rejected = fixture.connect(token("revoked-activity", { jwtId: `different-jwt-${index}` }));
      await settle();
      if (index < 30) assert.equal(rejected.closeReason, "session invalid");
    }
    assert.equal(rejected?.closeReason, "session rate limited");
    assert.equal(revocationChecks, 30);
    assert.equal(fixture.counts().activityLookups, 0);
    assert.equal(fixture.manager.connectedClients.size, 0);
  } finally { fixture.close(); }
});

test("WebSocket bounds concurrent pending sockets per signed activity and releases reservations on close", async () => {
  let release!: (revoked: boolean) => void;
  const pending = new Promise<boolean>((resolve) => { release = resolve; });
  let checks = 0;
  const fixture = setup({
    isSessionJwtRevoked: async (id) => {
      if (id === "jwt-pending") { checks += 1; return pending; }
      return false;
    },
  });
  try {
    const sockets = Array.from({ length: 5 }, () => fixture.connect(token("pending")));
    const overflow = fixture.connect(token("pending"));
    const peer = fixture.connect(token("pending-peer"));
    await settle();
    assert.equal(checks, 5);
    assert.equal(overflow.closeReason, "session connection limit reached");
    assert.equal(peer.readyState, WebSocket.OPEN);
    sockets[0].close();
    const next = fixture.connect(token("pending"));
    assert.equal(checks, 6);
    assert.equal(next.readyState, WebSocket.OPEN);
    release(false);
    await settle();
    assert.equal(fixture.manager.connectedClients.size, 2);
    assert.equal(fixture.manager.getLifecycleSnapshot().trackedSockets, 2);
    fixture.close();
    assert.equal(fixture.manager.getLifecycleSnapshot().trackedSockets, 0);
  } finally { release(false); fixture.close(); }
});

test("WebSocket preserves the five active sockets per user cap under concurrent session authentication", async () => {
  const fixture = setup({ storage: { getActivityById: async (id) => session(id, "same-user") } });
  try {
    const sockets = Array.from({ length: 6 }, (_, index) => fixture.connect(token(`concurrent-${index}`)));
    await settle();
    assert.equal(fixture.manager.connectedClients.size, 5);
    assert.equal(sockets.filter((socket) => socket.closeReason === "connection limit reached").length, 1);
  } finally { fixture.close(); }
});

test("WebSocket rejects active activities without trusted user identity", async () => {
  const fixture = setup({
    storage: { getActivityById: async (id) => ({ ...session(id), userId: null, username: "" }) as unknown as UserActivity },
  });
  try {
    const socket = fixture.connect(token("missing-identity", { userId: "client-claimed-user" }));
    await settle();
    assert.equal(socket.closeReason, "session invalid");
    assert.equal(fixture.manager.connectedClients.size, 0);
  } finally { fixture.close(); }
});
