import assert from "node:assert/strict";
import test from "node:test";
import {
  clearIdempotencyFingerprintValidationCacheForTests,
  createCollectionJsonMutationRouteHandler,
  normalizeIdempotencyFingerprintHeaderValue,
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

  assert.equal(pruned, 29);
  assert.equal(cache.size, 231);
  assert.equal(cache.has("fingerprint-0"), false);
  assert.equal(cache.has("fingerprint-28"), false);
  assert.equal(cache.has("fingerprint-29"), true);
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

  assert.equal(pruned, 3);
  assert.equal(cache.has("fingerprint-0"), true);
  assert.equal(cache.has("fingerprint-1"), false);
  assert.equal(cache.has("fingerprint-2"), false);
});
