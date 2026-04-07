import assert from "node:assert/strict";
import test from "node:test";
import { createCollectionJsonMutationRouteHandler } from "../collection/collection-route-handler-factories";
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
