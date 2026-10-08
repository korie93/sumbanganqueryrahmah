import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createClient } from "redis";

const redisUrl = process.env.SQR_SESSION_REVOCATION_TEST_REDIS_URL;
const required = process.env.SQR_SESSION_REVOCATION_TEST_REDIS_REQUIRED === "1";

async function within<T>(operation: Promise<T>, description: string, timeoutMs = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitFor(predicate: () => boolean, description: string) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail(`Timed out: ${description}`);
}

test("live Redis session readiness recovers while idle and stays degraded when GET is denied", {
  skip: !redisUrl && !required ? "Set SQR_SESSION_REVOCATION_TEST_REDIS_URL to an isolated test Redis instance." : false,
  timeout: 45_000,
}, async (t) => {
  assert.ok(redisUrl, "Live session revocation verification is required; SQR_SESSION_REVOCATION_TEST_REDIS_URL must be set.");
  // This test needs administrative ACL/CLIENT commands. Only an explicitly
  // supplied disposable loopback service is allowed, never application REDIS_URL.
  assert.ok(/^redis:\/\/(?:127\.0\.0\.1|\[::1\]):\d+\/0$/.test(redisUrl), "Use an isolated, unauthenticated loopback Redis test service on database 0.");
  // Test controls are not part of the strict application SQR_* environment schema.
  delete process.env.SQR_SESSION_REVOCATION_TEST_REDIS_URL;
  delete process.env.SQR_SESSION_REVOCATION_TEST_REDIS_REQUIRED;
  const [{ RedisSessionRevocationStore, RedisSessionRevocationUnavailableError }, { clearStartupServiceDegraded, getStartupHealthSnapshot }] = await Promise.all([
    import("../redis-session-revocation-store"),
    import("../../internal/startup-health"),
  ]);
  const service = "session-revocation-store";
  const degraded = () => getStartupHealthSnapshot().degradedServices.some((entry) => entry.service === service);
  const fixtureId = randomUUID();
  const prefix = `sqr:test:revocation:${fixtureId}`;
  const username = `sqr-revocation-test-${fixtureId}`;
  const password = randomBytes(24).toString("base64url");
  const knownKeys = new Set<string>();
  const clients: Array<ReturnType<typeof createClient>> = [];
  let readyEvents = 0;
  let errorEvents = 0;
  let deniedReads = 0;
  let successfulReads = 0;
  let userCreated = false;
  let aclWitness: ReturnType<typeof createClient> | undefined;
  let store: InstanceType<typeof RedisSessionRevocationStore> | null = null;
  const control = createClient({
    url: redisUrl, disableOfflineQueue: true,
    socket: { reconnectStrategy: false, connectTimeout: 3_000 },
  });
  control.on("error", () => undefined);
  const recordKey = (key: string) => {
    assert.ok(key.startsWith(`${prefix}:`), "Live revocation tests must touch only their isolated prefix.");
    knownKeys.add(key);
    assert.ok(knownKeys.size <= 100, "Live fixture key count must stay bounded.");
  };

  t.after(async () => {
    try {
      await within(store?.close() ?? Promise.resolve(), "session store cleanup");
    } finally {
      for (const client of clients) if (client.isOpen) client.destroy();
      if (aclWitness?.isOpen) aclWitness.destroy();
      try {
        if (control.isReady) {
          assert.ok(knownKeys.size <= 100);
          for (const key of knownKeys) assert.ok(key.startsWith(`${prefix}:`));
          // Delete exact recorded keys and this unique ACL user, never scan/flush
          // a database, restart Redis, or disconnect other test connections.
          try {
            if (knownKeys.size > 0) await within(control.del([...knownKeys]), "fixture key cleanup");
          } finally {
            if (userCreated) await within(control.aclDelUser(username), "fixture ACL cleanup");
          }
        }
      } finally {
        if (control.isOpen) control.destroy();
        clearStartupServiceDegraded(service);
      }
    }
  });
  try {
    await within(control.connect(), "test Redis connection");
  } catch {
    assert.fail("The required isolated Redis service is unavailable (connection details withheld).");
  }
  // ACL GETUSER returns null for an absent user; node-redis's RESP2 aclGetUser
  // transformer dereferences that null. Preserve the raw reply and still reject
  // existing identities or command errors before claiming fixture ownership.
  assert.equal(await within(control.sendCommand(["ACL", "GETUSER", username]), "check fixture ACL identity"), null);
  userCreated = true;
  await within(control.aclSetUser(username, [
    "reset", "on", `>${password}`, `~${prefix}:*`,
    "+ping", "+get", "+set", "+eval", "+quit", "+select", "+client|id",
  ]), "create restricted fixture ACL user");

  store = new RedisSessionRevocationStore({
    config: { provider: "redis", redisUrl, distributedStoreConfigured: true },
    prefix,
    recoveryTimeoutMs: 1_000,
    recoveryRetryMs: 100,
    logger: { warn: () => undefined, error: () => undefined },
    createRedisClient: (options) => {
      const client = createClient({
        ...options, username, password, disableClientInfo: true,
        socket: { ...options.socket, connectTimeout: 3_000, tls: false },
      });
      clients.push(client);
      client.on("ready", () => { readyEvents += 1; });
      client.on("error", () => { errorEvents += 1; });
      return {
        connect: () => client.connect(),
        on: (event, listener) => client.on(event, listener),
        get: async (key) => {
          recordKey(key);
          try {
            const value = await client.get(key);
            successfulReads += 1;
            return value;
          } catch (error) {
            if (error instanceof Error && error.message.startsWith("NOPERM")) deniedReads += 1;
            throw error;
          }
        },
        eval: (script, options) => {
          for (const key of options.keys) recordKey(key);
          return client.eval(script, options);
        },
        set: (key, value, options) => {
          recordKey(key);
          return client.set(key, value, options);
        },
        quit: async () => { if (client.isOpen) await client.quit(); },
        destroy: () => { if (client.isOpen) client.destroy(); },
      };
    },
  });

  await within(store.revoke({ jwtId: "persistently-revoked", expiresAtMs: Date.now() + 60_000 }), "initial revocation");
  assert.equal(await within(store.isRevoked("persistently-revoked"), "initial revoked check"), true);
  assert.equal(await within(store.isRevoked("ordinary-session"), "initial allowed check"), false);
  assert.equal(degraded(), false);
  assert.equal(clients.length, 1);
  const client = clients[0];

  await t.test("a real disconnected idle connection recovers readiness without application traffic", async () => {
    const initialReadyEvents = readyEvents;
    const initialErrors = errorEvents;
    const initialReads = successfulReads;
    const clientId = await within(client.clientId(), "identify fixture connection");
    assert.equal(await within(control.clientKill({ filter: "ID", id: clientId }), "disconnect only fixture client"), 1);
    await waitFor(() => errorEvents > initialErrors && degraded(), "disconnect marks session readiness degraded");
    // Do not call store.isRevoked/revoke here: only the recovery probe may clear
    // degradation, including while there is no logged-in application traffic.
    await waitFor(() => readyEvents > initialReadyEvents && !degraded(), "idle session readiness recovery");
    assert.ok(successfulReads > initialReads, "recovery must confirm GET access, not only socket readiness");
    assert.equal(clients.length, 1, "node-redis should recover its original connection");
  });

  await t.test("ready and PING cannot clear GET-denied health; restoring GET recovers without a request", async () => {
    const initialReadyEvents = readyEvents;
    const initialDeniedReads = deniedReads;
    await within(control.aclSetUser(username, ["-get"]), "deny GET for only fixture user");
    const clientId = await within(client.clientId(), "identify fixture connection before ACL probe");
    assert.equal(await within(control.clientKill({ filter: "ID", id: clientId }), "reconnect GET-denied fixture client"), 1);
    await waitFor(() => readyEvents > initialReadyEvents && deniedReads > initialDeniedReads, "reconnected recovery probe receives real NOPERM");
    // The store may retire a connection after a failed GET and create another.
    // A separate witness with the same ACL proves the transport itself is ready
    // and PING succeeds, without racing that intentional connection retirement.
    aclWitness = createClient({
      url: redisUrl, username, password, disableClientInfo: true, disableOfflineQueue: true,
      socket: { reconnectStrategy: false, connectTimeout: 3_000 },
    });
    aclWitness.on("error", () => undefined);
    await within(aclWitness.connect(), "GET-denied witness handshake");
    assert.equal(aclWitness.isReady, true);
    assert.equal(await within(aclWitness.ping(), "GET-denied fixture still answers PING"), "PONG");
    assert.equal(degraded(), true, "successful handshake and PING cannot claim session GET readiness");
    const failuresBeforeRetry = deniedReads;
    await waitFor(() => deniedReads > failuresBeforeRetry, "idle bounded recovery retry while GET remains denied");
    assert.equal(degraded(), true);

    const initialReads = successfulReads;
    await within(control.aclSetUser(username, ["+get"]), "restore GET for only fixture user");
    // No forced reconnect or application request: scheduled recovery must
    // notice restored command permissions, whether it reuses or replaces a client.
    await waitFor(() => successfulReads > initialReads && !degraded(), "idle recovery after restoring GET");
  });

  await t.test("successful GET probes cannot hide an EVAL-denied revocation", async () => {
    assert.ok(store);
    await within(control.aclSetUser(username, ["-eval"]), "deny EVAL for only fixture user");
    await assert.rejects(within(store.revoke({
      jwtId: "write-permission-test", expiresAtMs: Date.now() + 60_000,
    }), "denied revocation"), RedisSessionRevocationUnavailableError);
    assert.equal(degraded(), true);
    const initialReads = successfulReads;
    await waitFor(() => successfulReads > initialReads, "GET probe succeeds despite denied EVAL");
    assert.equal(degraded(), true, "read-only recovery must preserve the write failure");
    await within(control.aclSetUser(username, ["+eval"]), "restore EVAL for only fixture user");
    await within(store.revoke({
      jwtId: "write-permission-test", expiresAtMs: Date.now() + 60_000,
    }), "successful revocation after restoring EVAL");
    assert.equal(degraded(), false);
    assert.equal(await within(store.isRevoked("write-permission-test"), "restored revocation persists"), true);
  });

  assert.equal(await within(store.isRevoked("persistently-revoked"), "revocation survives reconnects"), true);
  assert.equal(await within(store.isRevoked("ordinary-session"), "ordinary session after recovery"), false);
});
