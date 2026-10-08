import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { type TestContext } from "node:test";
import { setImmediate as waitForImmediate } from "node:timers/promises";
import {
  RedisSessionRevocationStore,
  RedisSessionRevocationUnavailableError,
} from "../redis-session-revocation-store";
import {
  clearStartupServiceDegraded,
  getStartupHealthSnapshot,
} from "../../internal/startup-health";

const SERVICE = "session-revocation-store";
const PREFIX = "sqr:test-recovery-revoked";
const DEADLINE_MS = 100;
const RETRY_MS = 200;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function failure(code = "ECONNRESET") {
  return Object.assign(new Error("Synthetic Redis failure"), { code });
}

function degraded() {
  return getStartupHealthSnapshot().degradedServices.some((entry) => entry.service === SERVICE);
}

function jwtKey(jwtId: string) {
  return `${PREFIX}:${crypto.createHash("sha256").update(jwtId).digest("hex")}`;
}

// One event-loop turn drains the promise continuations without advancing fake time.
async function settle() {
  await waitForImmediate();
}

class RedisClientDouble {
  readonly listeners = new Map<string, Array<(error: unknown) => void>>();
  readonly reads: string[] = [];
  readonly writes: string[] = [];
  readonly values = new Map<string, string>();
  connectCalls = 0;
  destroyCalls = 0;
  quitCalls = 0;
  connectResult: () => Promise<unknown> = async () => undefined;
  readResult: (key: string) => Promise<unknown> = async (key) => this.values.get(key) ?? null;
  writeResult: (key: string) => Promise<unknown> = async (key) => {
    if (this.values.has(key)) return 0;
    this.values.set(key, "1");
    return 1;
  };

  on(event: string, listener: (error: unknown) => void) {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  emit(event: string, error?: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(error);
  }

  async connect() {
    this.connectCalls += 1;
    await this.connectResult();
    this.emit("ready");
  }

  async get(key: string) {
    this.reads.push(key);
    return this.readResult(key);
  }

  async eval(_script: string, options: { arguments: string[]; keys: string[] }) {
    this.writes.push(options.keys[0]);
    return this.writeResult(options.keys[0]);
  }

  async set(key: string, _value: string, _options: { NX?: boolean; PX: number }) {
    this.writes.push(key);
    return this.writeResult(key);
  }

  destroy() {
    this.destroyCalls += 1;
    // Deliberately leave fake pending promises unresolved. The store must bound
    // its own waits and ignore late callbacks, not rely on a cooperative fake.
    this.emit("end");
  }

  async quit() {
    this.quitCalls += 1;
    return new Promise<never>(() => undefined);
  }
}

function harness(t: TestContext, clients: RedisClientDouble[] = [new RedisClientDouble()]) {
  clearStartupServiceDegraded(SERVICE);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const created: RedisClientDouble[] = [];
  const store = new RedisSessionRevocationStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    prefix: PREFIX,
    recoveryTimeoutMs: DEADLINE_MS,
    recoveryRetryMs: RETRY_MS,
    createRedisClient: () => {
      const client = clients[created.length] ?? new RedisClientDouble();
      created.push(client);
      return client;
    },
    logger: { warn() {}, error() {} },
  });
  t.after(async () => {
    await store.close();
    clearStartupServiceDegraded(SERVICE);
  });
  return { store, created, first: clients[0] };
}

test("revocation recovery verifies a read after an idle reconnect without user traffic", async (t) => {
  const { store, first } = harness(t);
  assert.equal(await store.isRevoked("active-session"), false);
  const probe = deferred<unknown>();
  first.readResult = async () => probe.promise;
  first.emit("error", failure());
  assert.equal(degraded(), true);
  first.emit("ready");
  await settle();
  assert.equal(first.reads.length, 2);
  assert.equal(degraded(), true, "ready alone must not clear health");
  const probeKey = first.reads[1];
  assert.match(probeKey, /^sqr:test-recovery-revoked:[a-f0-9]{64}$/);
  assert.notEqual(probeKey, jwtKey("active-session"));
  assert.equal(first.writes.length, 0, "recovery must not write synthetic revocations");
  probe.resolve(null);
  await settle();
  assert.equal(degraded(), false);
});

test("revocation ready cannot clear degradation when the namespace GET is denied", async (t) => {
  const { store, first } = harness(t);
  await store.isRevoked("active-session");
  first.readResult = async () => { throw failure("NOPERM"); };
  first.emit("error", failure());
  first.emit("ready");
  await settle();
  assert.equal(first.reads.length, 2);
  assert.equal(degraded(), true);
  assert.equal(first.writes.length, 0);
});

test("revocation retries an initial connection failure while idle without another session request", async (t) => {
  const first = new RedisClientDouble();
  const second = new RedisClientDouble();
  first.connectResult = async () => { throw failure("ECONNREFUSED"); };
  const { store, created } = harness(t, [first, second]);
  assert.equal(await store.isRevoked("active-session"), true);
  assert.equal(degraded(), true);
  t.mock.timers.tick(RETRY_MS);
  await settle();
  assert.equal(created.length, 2);
  assert.equal(second.reads.length, 1);
  assert.equal(second.writes.length, 0);
  assert.equal(degraded(), false);
});

test("revocation close cancels the idle retry after a failed connection", async (t) => {
  const first = new RedisClientDouble();
  first.connectResult = async () => { throw failure("ECONNREFUSED"); };
  const { store, created } = harness(t, [first]);
  assert.equal(await store.isRevoked("active-session"), true);
  await store.close();
  t.mock.timers.tick(RETRY_MS * 4);
  await settle();
  assert.equal(created.length, 1);
  assert.equal(await store.isRevoked("after-close"), true);
  assert.equal(first.destroyCalls, 1);
});

test("revocation GET recovery preserves a failed write until an actual revoke succeeds", async (t) => {
  const first = new RedisClientDouble();
  const second = new RedisClientDouble();
  first.writeResult = async () => { throw failure("NOPERM"); };
  const { store } = harness(t, [first, second]);
  await store.isRevoked("active-session");
  await assert.rejects(
    store.revoke({ jwtId: "failed-revoke", expiresAtMs: Date.now() + 60_000 }),
    RedisSessionRevocationUnavailableError,
  );
  assert.equal(degraded(), true);
  assert.equal(await store.isRevoked("another-session"), false);
  await settle();
  assert.equal(degraded(), true, "connection and GET success cannot prove EVAL permission");
  await store.revoke({ jwtId: "successful-revoke", expiresAtMs: Date.now() + 60_000 });
  assert.equal(degraded(), false);
  assert.equal(await store.isRevoked("successful-revoke"), true);
});

test("revocation recovery bounds a hung GET, destroys its client and retries once", async (t) => {
  const first = new RedisClientDouble();
  const second = new RedisClientDouble();
  const { store, created } = harness(t, [first, second]);
  await store.isRevoked("active-session");
  first.readResult = async () => new Promise<never>(() => undefined);
  first.emit("error", failure());
  first.emit("ready");
  await settle();
  t.mock.timers.tick(DEADLINE_MS);
  await settle();
  assert.equal(first.destroyCalls, 1);
  assert.equal(degraded(), true);
  t.mock.timers.tick(RETRY_MS);
  await settle();
  assert.equal(created.length, 2);
  assert.equal(second.reads.length, 1);
  assert.equal(degraded(), false);
  assert.equal(first.quitCalls, 0, "cleanup cannot await a dead connection's QUIT reply");
});

test("revocation recovery cannot hide a write aborted by a concurrent read failure", async (t) => {
  const first = new RedisClientDouble();
  const second = new RedisClientDouble();
  const { store } = harness(t, [first, second]);
  await store.isRevoked("active-session");
  const pendingWrite = deferred<unknown>();
  first.writeResult = async () => pendingWrite.promise;
  const rejectedWrite = assert.rejects(
    store.revoke({ jwtId: "interrupted-revoke", expiresAtMs: Date.now() + 60_000 }),
    RedisSessionRevocationUnavailableError,
  );
  await settle();
  first.readResult = async () => { throw failure(); };
  assert.equal(await store.isRevoked("another-session"), true);
  await rejectedWrite;
  assert.equal(first.destroyCalls, 1);
  t.mock.timers.tick(RETRY_MS);
  await settle();
  assert.equal(second.reads.length, 1);
  assert.equal(degraded(), true, "a successful probe must not hide an aborted write");
  await store.revoke({ jwtId: "successful-revoke", expiresAtMs: Date.now() + 60_000 });
  assert.equal(degraded(), false);
  pendingWrite.reject(failure("NOPERM"));
  await settle();
  assert.equal(degraded(), false, "late failure on the retired client cannot damage recovered health");
});

test("revocation keeps a shared key pending until every concurrent revoke has settled", async (t) => {
  const { store, first } = harness(t);
  await store.isRevoked("active-session");
  const firstWrite = deferred<unknown>();
  const secondWrite = deferred<unknown>();
  let writes = 0;
  first.writeResult = async () => (++writes === 1 ? firstWrite.promise : secondWrite.promise);
  const record = { jwtId: "shared-session", expiresAtMs: Date.now() + 60_000 };
  const firstRevoke = store.revoke(record);
  const secondRevoke = store.revoke(record);
  await settle();
  firstWrite.resolve(1);
  await firstRevoke;
  const reads = first.reads.length;
  assert.equal(await store.isRevoked("shared-session"), true);
  assert.equal(first.reads.length, reads, "the remaining write must keep the local key fail-closed");
  secondWrite.resolve(1);
  await secondRevoke;
});

test("revocation close aborts an unresolved connect without awaiting QUIT", async (t) => {
  const first = new RedisClientDouble();
  const connect = deferred<unknown>();
  first.connectResult = async () => connect.promise;
  const { store } = harness(t, [first]);
  const pendingCheck = store.isRevoked("active-session");
  await settle();
  let closed = false;
  const closing = store.close().then(() => { closed = true; });
  await settle();
  assert.equal(closed, true, "close must not wait for the reconnecting client promise");
  await closing;
  assert.equal(await pendingCheck, true);
  assert.equal(first.destroyCalls, 1);
  assert.equal(first.quitCalls, 0);
  connect.resolve(undefined);
  await settle();
  assert.equal(first.reads.length, 0);
});

test("revocation recovery coalesces ready-event storms into one in-flight GET", async (t) => {
  const { store, first } = harness(t);
  await store.isRevoked("active-session");
  const probe = deferred<unknown>();
  first.readResult = async () => probe.promise;
  first.emit("error", failure());
  for (let index = 0; index < 100; index += 1) first.emit("ready");
  await settle();
  assert.equal(first.reads.length, 2);
  probe.resolve(null);
  await settle();
  assert.equal(degraded(), false);
  t.mock.timers.tick(RETRY_MS * 4);
  await settle();
  assert.equal(first.reads.length, 2, "recovered stores must not retain a retry loop");
});

test("revocation recovery ignores errors and ready callbacks from a replaced client", async (t) => {
  const first = new RedisClientDouble();
  const second = new RedisClientDouble();
  const { store } = harness(t, [first, second]);
  await store.isRevoked("active-session");
  first.readResult = async () => { throw failure(); };
  assert.equal(await store.isRevoked("during-outage"), true);
  assert.equal(await store.isRevoked("after-outage"), false);
  assert.equal(degraded(), false);
  const oldReads = first.reads.length;
  first.emit("error", failure());
  first.emit("ready");
  await settle();
  assert.equal(first.reads.length, oldReads);
  assert.equal(degraded(), false);
});

test("revocation recovery cannot erase a newer failure with an older probe result", async (t) => {
  const { store, first } = harness(t);
  await store.isRevoked("active-session");
  const probe = deferred<unknown>();
  first.readResult = async () => probe.promise;
  first.emit("error", failure());
  first.emit("ready");
  await settle();
  first.emit("error", failure());
  probe.resolve(null);
  await settle();
  assert.equal(degraded(), true);
  first.readResult = async () => null;
  first.emit("ready");
  await settle();
  assert.equal(degraded(), false);
});

test("revocation close prevents late probe completion and callbacks from restarting recovery", async (t) => {
  const { store, first, created } = harness(t);
  await store.isRevoked("active-session");
  const probe = deferred<unknown>();
  first.readResult = async () => probe.promise;
  first.emit("error", failure());
  first.emit("ready");
  await settle();
  await store.close();
  const healthAfterClose = degraded();
  const readsAfterClose = first.reads.length;
  first.emit("error", failure());
  first.emit("ready");
  probe.resolve(null);
  t.mock.timers.tick(RETRY_MS * 4);
  await settle();
  assert.equal(created.length, 1);
  assert.equal(first.reads.length, readsAfterClose);
  assert.equal(degraded(), healthAfterClose);
  assert.equal(first.destroyCalls, 1);
});

test("revocation recovery does not un-revoke an existing session or write its probe key", async (t) => {
  const { store, first } = harness(t);
  await store.revoke({ jwtId: "revoked-session", expiresAtMs: Date.now() + 60_000 });
  assert.equal(await store.isRevoked("revoked-session"), true);
  const writesBeforeRecovery = first.writes.length;
  first.emit("error", failure());
  first.emit("ready");
  await settle();
  assert.equal(degraded(), false);
  assert.equal(await store.isRevoked("revoked-session"), true);
  assert.equal(first.writes.length, writesBeforeRecovery);
  assert.deepEqual(first.writes, [jwtKey("revoked-session")]);
});

test("revocation ordinary GET and EVAL are deadline-bounded and fail closed", async (t) => {
  const first = new RedisClientDouble();
  const second = new RedisClientDouble();
  const { store } = harness(t, [first, second]);
  await store.isRevoked("active-session");
  first.readResult = async () => new Promise<never>(() => undefined);
  const check = store.isRevoked("hung-read");
  await settle();
  t.mock.timers.tick(DEADLINE_MS);
  await settle();
  assert.equal(await check, true);
  assert.equal(first.destroyCalls, 1);
  second.writeResult = async () => new Promise<never>(() => undefined);
  const write = assert.rejects(
    store.revoke({ jwtId: "hung-write", expiresAtMs: Date.now() + 60_000 }),
    RedisSessionRevocationUnavailableError,
  );
  await settle();
  t.mock.timers.tick(DEADLINE_MS);
  await settle();
  await write;
  assert.equal(second.destroyCalls, 1);
  assert.equal(degraded(), true);
});

test("revocation connect deadline releases waiters and destroys the connecting client", async (t) => {
  const first = new RedisClientDouble();
  first.connectResult = async () => new Promise<never>(() => undefined);
  const { store } = harness(t, [first]);
  const check = store.isRevoked("hung-connect");
  await settle();
  t.mock.timers.tick(DEADLINE_MS);
  await settle();
  assert.equal(await check, true);
  assert.equal(first.destroyCalls, 1);
  assert.equal(degraded(), true);
});
