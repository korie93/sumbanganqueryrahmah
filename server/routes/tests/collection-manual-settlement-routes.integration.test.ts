import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import type { AuthenticatedUser } from "../../auth/guards";
import { CollectionService } from "../../services/collection.service";
import type { PostgresStorage } from "../../storage-postgres";
import { registerCollectionManualSettlementRoutes } from "../collection/collection-manual-settlement-routes";
import {
  createCollectionJsonMutationRouteHandler,
  createCollectionJsonRouteHandler,
} from "../collection/collection-route-handler-factories";
import {
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  createTestRequireTabAccess,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

const RECORD_ID = "record-1";

function harness() {
  const app = createJsonTestApp();
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const scopes: string[] = [];
  const record = (name: string, ...args: unknown[]) => {
    calls.push({ name, args });
    return { endpoint: name };
  };
  const collectionService = {
    upsertManualSettlement: async (...args: unknown[]) => record("upsert", ...args),
    revokeManualSettlement: async (...args: unknown[]) => record("revoke", ...args),
    getManualSettlementHistory: async (...args: unknown[]) => record("history", ...args),
  } as unknown as CollectionService;
  const storage = {
    acquireMutationIdempotency: async (input: { scope: string }) => {
      scopes.push(input.scope);
      return { status: "acquired" as const };
    },
    completeMutationIdempotency: async () => undefined,
    releaseMutationIdempotency: async () => undefined,
  } as unknown as PostgresStorage;
  const authenticate = createTestAuthenticateToken();
  const requireRole = createTestRequireRole();
  const tab = createTestRequireTabAccess();
  const reportAccess: RequestHandler[] = [
    authenticate,
    requireRole("user", "admin", "manager", "superuser"),
    tab("collection-report"),
  ];
  const superuserReportAccess: RequestHandler[] = [
    authenticate,
    requireRole("superuser"),
    tab("collection-report"),
  ];
  registerCollectionManualSettlementRoutes({
    app,
    collectionService,
    storage,
    reportAccess,
    superuserReportAccess,
    teamReportAccess: [],
    adminSummaryAccess: [],
    recordMutationAccess: [],
    sourceMatchAccess: [],
    staffSummaryAccess: [],
    jsonRoute: (fallbackMessage, handler) => createCollectionJsonRouteHandler({ fallbackMessage, handler }),
    jsonMutationRoute: (fallbackMessage, scopeResolver, handler) => createCollectionJsonMutationRouteHandler({
      fallbackMessage,
      handler,
      scopeResolver,
      storage,
    }),
  });
  return { app, calls, scopes };
}

function headers(role: string) {
  return {
    "content-type": "application/json",
    "x-test-role": role,
    "x-test-username": `${role}.actor`,
  };
}

test("Manual settlement HTTP mutation matrix allows only superuser", async () => {
  const { app, calls, scopes } = harness();
  const { server, baseUrl } = await startTestServer(app);
  try {
    for (const role of ["manager", "admin", "user"]) {
      for (const method of ["POST", "PUT", "DELETE"]) {
        const response = await fetch(`${baseUrl}/api/collection/${RECORD_ID}/manual-settlement`, {
          method,
          headers: headers(role),
          body: JSON.stringify({ confirmed: true }),
        });
        assert.equal(response.status, 403, `${role} ${method}`);
      }
    }
    assert.equal(calls.length, 0);

    for (const method of ["POST", "PUT"] as const) {
      const response = await fetch(`${baseUrl}/api/collection/${RECORD_ID}/manual-settlement`, {
        method,
        headers: {
          ...headers("superuser"),
          "x-idempotency-key": `manual-${method.toLowerCase()}`,
        },
        body: JSON.stringify({ confirmed: true, poolAmount: "350.00" }),
      });
      assert.equal(response.status, 200, method);
      assert.equal((await response.json() as { endpoint: string }).endpoint, "upsert");
    }
    const revoke = await fetch(`${baseUrl}/api/collection/${RECORD_ID}/manual-settlement`, {
      method: "DELETE",
      headers: {
        ...headers("superuser"),
        "x-idempotency-key": "manual-delete",
      },
      body: JSON.stringify({ confirmed: true, expectedVersion: 1 }),
    });
    assert.equal(revoke.status, 200);
    assert.equal((await revoke.json() as { endpoint: string }).endpoint, "revoke");
    assert.deepEqual(scopes, [
      `collection-record:manual-settlement:${RECORD_ID}`,
      `collection-record:manual-settlement:${RECORD_ID}`,
      `collection-record:manual-settlement:revoke:${RECORD_ID}`,
    ]);
    assert.equal((calls[0]?.args[0] as AuthenticatedUser).role, "superuser");
  } finally {
    await stopTestServer(server);
  }
});

test("Manual settlement history preserves report RBAC without granting mutation", async () => {
  const { app, calls } = harness();
  const { server, baseUrl } = await startTestServer(app);
  try {
    const manager = await fetch(
      `${baseUrl}/api/collection/${RECORD_ID}/manual-settlement/history?limit=25`,
      { headers: headers("manager") },
    );
    assert.equal(manager.status, 200);
    assert.equal((await manager.json() as { endpoint: string }).endpoint, "history");
    assert.deepEqual(calls[0]?.args.slice(1), [RECORD_ID, "25"]);

    const deniedTab = await fetch(
      `${baseUrl}/api/collection/${RECORD_ID}/manual-settlement/history`,
      { headers: { ...headers("manager"), "x-test-deny-tabs": "collection-report" } },
    );
    assert.equal(deniedTab.status, 403);
    const unauthenticated = await fetch(
      `${baseUrl}/api/collection/${RECORD_ID}/manual-settlement/history`,
    );
    assert.equal(unauthenticated.status, 401);
    assert.equal(calls.length, 1);
  } finally {
    await stopTestServer(server);
  }
});
