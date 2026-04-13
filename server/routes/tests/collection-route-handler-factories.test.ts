import assert from "node:assert/strict";
import test from "node:test";
import {
  createIdempotencyFingerprintValidationCacheController,
  clearIdempotencyFingerprintValidationCacheForTests,
  createCollectionJsonMutationRouteHandler,
  normalizeIdempotencyFingerprintHeaderValue,
  pruneExpiredIdempotencyFingerprintValidationCache,
  pruneIdempotencyFingerprintValidationCache,
} from "../collection/collection-route-handler-factories";
import {
  createJsonTestApp,
  createTestAuthenticateToken,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

type CollectionMutationHandlerStorage =
  Parameters<typeof createCollectionJsonMutationRouteHandler>[0]["storage"];

test("collection mutation handler replays cached idempotent responses without re-running the mutation", async () => {
  let mutationCalls = 0;
  let completeCalls = 0;
  let releaseCalls = 0;

  const storage: CollectionMutationHandlerStorage = {
    acquireMutationIdempotency: async () => ({
      status: "replay" as const,
      responseStatus: 200,
      responseBody: {
        ok: true,
        replayed: true,
      },
    }),
    completeMutationIdempotency: async () => {
      completeCalls += 1;
    },
    releaseMutationIdempotency: async () => {
      releaseCalls += 1;
    },
  };

  const app = createJsonTestApp();
  app.post(
    "/api/test-collection-mutation",
    createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
    }),
    createCollectionJsonMutationRouteHandler({
      fallbackMessage: "Mutation failed.",
      handler: async () => {
        mutationCalls += 1;
        return { ok: true };
      },
      scopeResolver: () => "collection:test:replay",
      storage,
    }),
  );

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/test-collection-mutation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": "collection-test-key",
      },
      body: JSON.stringify({ recordId: "record-1" }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      replayed: true,
    });
    assert.equal(mutationCalls, 0);
    assert.equal(completeCalls, 0);
    assert.equal(releaseCalls, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("collection mutation handler releases idempotency reservations when the mutation fails", async () => {
  let completeCalls = 0;
  let releaseCalls = 0;

  const storage: CollectionMutationHandlerStorage = {
    acquireMutationIdempotency: async () => ({ status: "acquired" as const }),
    completeMutationIdempotency: async () => {
      completeCalls += 1;
    },
    releaseMutationIdempotency: async () => {
      releaseCalls += 1;
    },
  };

  const app = createJsonTestApp();
  app.post(
    "/api/test-collection-mutation",
    createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
    }),
    createCollectionJsonMutationRouteHandler({
      fallbackMessage: "Mutation failed.",
      handler: async () => {
        throw new Error("Unexpected mutation failure");
      },
      scopeResolver: () => "collection:test:failure",
      storage,
    }),
  );

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/test-collection-mutation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": "collection-test-key",
      },
      body: JSON.stringify({ recordId: "record-1" }),
    });

    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.message, "Mutation failed.");
    assert.equal(completeCalls, 0);
    assert.equal(releaseCalls, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("collection mutation handler releases reservations when idempotency persistence fails", async () => {
  let completeCalls = 0;
  let releaseCalls = 0;

  const storage: CollectionMutationHandlerStorage = {
    acquireMutationIdempotency: async () => ({ status: "acquired" as const }),
    completeMutationIdempotency: async () => {
      completeCalls += 1;
      throw new Error("idempotency write failed");
    },
    releaseMutationIdempotency: async () => {
      releaseCalls += 1;
    },
  };

  const app = createJsonTestApp();
  app.post(
    "/api/test-collection-mutation",
    createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
    }),
    createCollectionJsonMutationRouteHandler({
      fallbackMessage: "Mutation failed.",
      handler: async () => ({ ok: true }),
      scopeResolver: () => "collection:test:complete-failure",
      storage,
    }),
  );

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/test-collection-mutation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": "collection-test-key",
      },
      body: JSON.stringify({ recordId: "record-1" }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(completeCalls, 1);
    assert.equal(releaseCalls, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("collection mutation handler rejects malformed idempotency fingerprints", async () => {
  let mutationCalls = 0;

  const storage: CollectionMutationHandlerStorage = {
    acquireMutationIdempotency: async () => ({ status: "acquired" as const }),
    completeMutationIdempotency: async () => undefined,
    releaseMutationIdempotency: async () => undefined,
  };

  const app = createJsonTestApp();
  app.post(
    "/api/test-collection-mutation",
    createTestAuthenticateToken({
      userId: "user-1",
      username: "staff.user",
      role: "user",
    }),
    createCollectionJsonMutationRouteHandler({
      fallbackMessage: "Mutation failed.",
      handler: async () => {
        mutationCalls += 1;
        return { ok: true };
      },
      scopeResolver: () => "collection:test:bad-fingerprint",
      storage,
    }),
  );

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/test-collection-mutation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": "collection-test-key",
        "x-idempotency-fingerprint": "not-json",
      },
      body: JSON.stringify({ recordId: "record-1" }),
    });

    assert.equal(response.status, 400);
    assert.equal(mutationCalls, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("collection mutation handler caches repeated idempotency fingerprint JSON validation", async () => {
  clearIdempotencyFingerprintValidationCacheForTests();
  const originalParse = JSON.parse;
  let parseCalls = 0;

  JSON.parse = ((text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown) => {
    parseCalls += 1;
    return originalParse(text, reviver);
  }) as typeof JSON.parse;

  try {
    const fingerprint = "{\"recordId\":\"collection-1\",\"mode\":\"create\"}";
    assert.equal(normalizeIdempotencyFingerprintHeaderValue(fingerprint), fingerprint);
    assert.equal(normalizeIdempotencyFingerprintHeaderValue(fingerprint), fingerprint);
    assert.equal(parseCalls, 1);
  } finally {
    JSON.parse = originalParse;
    clearIdempotencyFingerprintValidationCacheForTests();
  }
});

test("pruneIdempotencyFingerprintValidationCache evicts the oldest fingerprint validations in batches", () => {
  const cache = new Map();

  for (let index = 0; index < 260; index += 1) {
    cache.set(`fingerprint-${index}`, {
      lastValidatedAt: index,
    });
  }

  const pruned = pruneIdempotencyFingerprintValidationCache(cache, 256);

  assert.equal(pruned, 4);
  assert.equal(cache.size, 256);
  assert.equal(cache.has("fingerprint-0"), false);
  assert.equal(cache.has("fingerprint-3"), false);
  assert.equal(cache.has("fingerprint-4"), true);
});

test("pruneIdempotencyFingerprintValidationCache keeps recently touched fingerprints ahead of older entries", () => {
  const cache = new Map<string, { lastValidatedAt: number }>();

  for (let index = 0; index < 12; index += 1) {
    cache.set(`fingerprint-${index}`, {
      lastValidatedAt: index,
    });
  }

  const refreshedEntry = cache.get("fingerprint-0");
  assert.ok(refreshedEntry);
  cache.delete("fingerprint-0");
  cache.set("fingerprint-0", {
    lastValidatedAt: 99,
  });

  const pruned = pruneIdempotencyFingerprintValidationCache(cache, 10);

  assert.equal(pruned, 2);
  assert.equal(cache.has("fingerprint-0"), true);
  assert.equal(cache.has("fingerprint-1"), false);
  assert.equal(cache.has("fingerprint-2"), false);
});

test("pruneExpiredIdempotencyFingerprintValidationCache removes stale entries by TTL", () => {
  const cache = new Map<string, { lastValidatedAt: number }>();
  cache.set("fresh", { lastValidatedAt: 9_500 });
  cache.set("expired-a", { lastValidatedAt: 1_000 });
  cache.set("expired-b", { lastValidatedAt: 4_000 });

  const pruned = pruneExpiredIdempotencyFingerprintValidationCache(cache, {
    now: 10_000,
    ttlMs: 5_000,
  });

  assert.equal(pruned, 2);
  assert.deepEqual(Array.from(cache.keys()), ["fresh"]);
});

test("idempotency fingerprint cache controller auto-evicts expired entries and stops its sweep timer", () => {
  let now = 1_000;
  let sweep: (() => void) | null = null;
  let clearCalls = 0;
  let unrefCalls = 0;
  const invokeSweep = (handler: unknown) => {
    assert.equal(typeof handler, "function");
    (handler as () => void)();
  };
  const sweepHandle = {
    unref() {
      unrefCalls += 1;
      return sweepHandle;
    },
  } as ReturnType<typeof setInterval>;

  const controller = createIdempotencyFingerprintValidationCacheController({
    limit: 4,
    ttlMs: 50,
    sweepIntervalMs: 10,
    now: () => now,
    setIntervalFn: ((handler: TimerHandler) => {
      sweep = () => {
        if (typeof handler === "function") {
          handler();
        }
      };
      return sweepHandle;
    }) as unknown as typeof setInterval,
    clearIntervalFn: ((handle?: Parameters<typeof clearInterval>[0]) => {
      if (handle === sweepHandle) {
        clearCalls += 1;
      }
    }) as typeof clearInterval,
  });

  controller.set("fingerprint-1", { lastValidatedAt: now });
  assert.equal(unrefCalls, 1);
  assert.equal(controller.cache.size, 1);

  now = 1_100;
  invokeSweep(sweep);

  assert.equal(controller.cache.size, 0);
  assert.equal(clearCalls, 1);
});
