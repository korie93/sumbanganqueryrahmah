import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import type { AuthenticatedUser } from "../../auth/guards";
import { conflict, notFound } from "../../http/errors";
import { CollectionService } from "../../services/collection.service";
import type { PostgresStorage } from "../../storage-postgres";
import {
  createCollectionJsonMutationRouteHandler,
  createCollectionJsonRouteHandler,
} from "../collection/collection-route-handler-factories";
import { registerCollectionBillingPrincipalV7Routes } from "../collection/collection-billing-principal-v7-routes";
import type { CollectionRouteContext } from "../collection/collection-route-shared";
import {
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  createTestRequireTabAccess,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

const PREFIX = "/api/collection/report/billing-principal/saved-targets";
const TARGET_ID = "target-1";
const REVISION_ID = "revision-1";
const RECONCILIATION_ID = "reconciliation-1";

type Call = {
  args: unknown[];
  name: string;
};

function createV7RouteHarness() {
  const calls: Call[] = [];
  const idempotencyScopes: string[] = [];
  const app = createJsonTestApp();
  const authenticateToken = createTestAuthenticateToken();
  const requireRole = createTestRequireRole();
  const requireTabAccess = createTestRequireTabAccess();
  const record = (name: string, ...args: unknown[]) => {
    calls.push({ name, args });
    return { endpoint: name };
  };

  const collectionService = {
    listBillingPrincipalSavedTargets: async (user: AuthenticatedUser | undefined) => record("list", user),
    createBillingPrincipalSavedTarget: async (user: AuthenticatedUser | undefined, body: unknown) => record("createTarget", user, body),
    getBillingPrincipalSavedTarget: async (user: AuthenticatedUser | undefined, targetId: string) => {
      if (targetId === "foreign-target") {
        throw notFound("Saved Target was not found.", "COLLECTION_OSP_TARGET_NOT_FOUND");
      }
      return record("getTarget", user, targetId);
    },
    updateBillingPrincipalSavedTarget: async (user: AuthenticatedUser | undefined, targetId: string, body: unknown) => record("updateTarget", user, targetId, body),
    deleteBillingPrincipalSavedTarget: async (user: AuthenticatedUser | undefined, targetId: string, version: unknown) => record("deleteTarget", user, targetId, version),
    getBillingPrincipalTargetOverview: async (user: AuthenticatedUser | undefined, targetId: string, revisionId: string, query: Record<string, unknown>) => record("overview", user, targetId, revisionId, query),
    upsertBillingPrincipalClientResults: async (user: AuthenticatedUser | undefined, targetId: string, revisionId: string, body: unknown) => record("clientResults", user, targetId, revisionId, body),
    listBillingPrincipalReconciliationCandidates: async (user: AuthenticatedUser | undefined, targetId: string, revisionId: string, query: Record<string, unknown>) => record("candidates", user, targetId, revisionId, query),
    listBillingPrincipalReconciliations: async (user: AuthenticatedUser | undefined, targetId: string, revisionId: string, query: Record<string, unknown>) => record("reconciliations", user, targetId, revisionId, query),
    createBillingPrincipalReconciliation: async (user: AuthenticatedUser | undefined, targetId: string, revisionId: string, body: unknown, requestId: unknown) => record("createReconciliation", user, targetId, revisionId, body, requestId),
    updateBillingPrincipalReconciliation: async (user: AuthenticatedUser | undefined, targetId: string, revisionId: string, reconciliationId: string, body: { version?: number }, requestId: unknown) => {
      if (reconciliationId === "foreign-reconciliation") {
        throw notFound("Manual reconciliation was not found.", "COLLECTION_OSP_TARGET_NOT_FOUND");
      }
      if (body.version === 0) {
        throw conflict("Manual reconciliation changed in another session.", "COLLECTION_RECONCILIATION_VERSION_CONFLICT");
      }
      return record("updateReconciliation", user, targetId, revisionId, reconciliationId, body, requestId);
    },
    voidBillingPrincipalReconciliation: async (user: AuthenticatedUser | undefined, targetId: string, revisionId: string, reconciliationId: string, body: unknown, requestId: unknown) => record("voidReconciliation", user, targetId, revisionId, reconciliationId, body, requestId),
    listBillingPrincipalReconciliationHistory: async (user: AuthenticatedUser | undefined, targetId: string, revisionId: string, reconciliationId: string) => record("history", user, targetId, revisionId, reconciliationId),
    getBillingPrincipalCalendar: async (user: AuthenticatedUser | undefined, targetId: string, revisionId: string, query: Record<string, unknown>) => record("calendar", user, targetId, revisionId, query),
    getBillingPrincipalDrilldown: async (user: AuthenticatedUser | undefined, targetId: string, revisionId: string, query: Record<string, unknown>) => record("drilldown", user, targetId, revisionId, query),
    exportBillingPrincipalTarget: async (user: AuthenticatedUser | undefined, targetId: string, revisionId: string, query: Record<string, unknown>) => {
      record("export", user, targetId, revisionId, query);
      return {
        buffer: Buffer.from("v7-export"),
        contentType: "application/json; charset=utf-8",
        filename: "billing-principal.json",
      };
    },
  } as unknown as CollectionService;

  const storage = {
    acquireMutationIdempotency: async (input: { scope: string; idempotencyKey: string }) => {
      idempotencyScopes.push(input.scope);
      if (input.idempotencyKey === "v7-replay") {
        return {
          responseBody: { endpoint: "replayed" },
          responseStatus: 200,
          status: "replay" as const,
        };
      }
      return { status: "acquired" as const };
    },
    completeMutationIdempotency: async () => undefined,
    releaseMutationIdempotency: async () => undefined,
  } as unknown as PostgresStorage;
  const reportAccess: RequestHandler[] = [
    authenticateToken,
    requireRole("user", "admin", "manager", "superuser"),
    requireTabAccess("collection-report"),
  ];
  const superuserReportAccess: RequestHandler[] = [
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
  ];
  const context: CollectionRouteContext = {
    adminSummaryAccess: [],
    app,
    collectionService,
    jsonMutationRoute: (fallbackMessage, scopeResolver, handler) => createCollectionJsonMutationRouteHandler({
      fallbackMessage,
      handler,
      scopeResolver,
      storage,
    }),
    jsonRoute: (fallbackMessage, handler) => createCollectionJsonRouteHandler({ fallbackMessage, handler }),
    recordMutationAccess: [],
    reportAccess,
    sourceMatchAccess: [],
    staffSummaryAccess: [],
    storage,
    superuserReportAccess,
  };
  registerCollectionBillingPrincipalV7Routes(context);

  return { app, calls, idempotencyScopes };
}

function authHeaders(role: string, extra: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    "x-test-role": role,
    "x-test-username": `${role}.user`,
    ...extra,
  };
}

test("V7 Billing Principal read endpoints enforce report access and forward every saved-target view", async () => {
  const { app, calls } = createV7RouteHarness();
  const { server, baseUrl } = await startTestServer(app);
  const revisionPrefix = `${PREFIX}/${TARGET_ID}/revisions/${REVISION_ID}`;
  try {
    const readRequests = [
      ["list", `${PREFIX}`],
      ["getTarget", `${PREFIX}/${TARGET_ID}`],
      ["overview", `${revisionPrefix}/overview?asOf=2026-09-10`],
      ["reconciliations", `${revisionPrefix}/reconciliations?status=ACTIVE`],
      ["history", `${revisionPrefix}/reconciliations/${RECONCILIATION_ID}/history`],
      ["calendar", `${revisionPrefix}/calendar?from=2026-09-01&to=2026-09-30`],
      ["drilldown", `${revisionPrefix}/drilldown?aging=D3&page=2`],
      ["export", `${revisionPrefix}/export?format=json`],
    ] as const;

    for (const [name, path] of readRequests) {
      const response = await fetch(`${baseUrl}${path}`, { headers: authHeaders("manager") });
      assert.equal(response.status, 200, name);
      if (name === "export") {
        assert.equal(await response.text(), "v7-export");
        assert.match(String(response.headers.get("content-disposition")), /billing-principal\.json/i);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      } else {
        assert.equal((await response.json() as { endpoint: string }).endpoint, name);
      }
    }

    const candidateResponse = await fetch(`${baseUrl}${revisionPrefix}/reconciliation-candidates`, {
      headers: authHeaders("manager"),
    });
    assert.equal(candidateResponse.status, 403);
    assert.equal(calls.some((call) => call.name === "candidates"), false);

    const deniedResponse = await fetch(`${baseUrl}${PREFIX}/${TARGET_ID}`, {
      headers: authHeaders("manager", { "x-test-deny-tabs": "collection-report" }),
    });
    assert.equal(deniedResponse.status, 403);
    assert.equal(calls.filter((call) => call.name === "getTarget").length, 1);

    const unauthenticatedResponse = await fetch(`${baseUrl}${PREFIX}`);
    assert.equal(unauthenticatedResponse.status, 401);
    assert.deepEqual(calls.map((call) => call.name), readRequests.map(([name]) => name));
    assert.equal((calls[2]?.args[0] as AuthenticatedUser).role, "manager");
    assert.equal(calls[2]?.args[1], TARGET_ID);
    assert.equal(calls[2]?.args[2], REVISION_ID);
    assert.equal((calls[2]?.args[3] as Record<string, unknown>).asOf, "2026-09-10");
  } finally {
    await stopTestServer(server);
  }
});

test("V7 Billing Principal superuser endpoints cover source candidates and every mutation with request idempotency", async () => {
  const { app, calls, idempotencyScopes } = createV7RouteHarness();
  const { server, baseUrl } = await startTestServer(app);
  const revisionPrefix = `${PREFIX}/${TARGET_ID}/revisions/${REVISION_ID}`;
  try {
    const managerMutation = await fetch(`${baseUrl}${PREFIX}`, {
      method: "POST",
      headers: authHeaders("manager"),
      body: JSON.stringify({ name: "September" }),
    });
    assert.equal(managerMutation.status, 403);
    assert.equal(calls.length, 0);

    const candidateResponse = await fetch(`${baseUrl}${revisionPrefix}/reconciliation-candidates?search=1234`, {
      headers: authHeaders("superuser"),
    });
    assert.equal(candidateResponse.status, 200);

    const mutations = [
      ["createTarget", "POST", PREFIX, { name: "September" }, { "x-idempotency-key": "target-create" }],
      ["updateTarget", "PATCH", `${PREFIX}/${TARGET_ID}`, { version: 1, name: "October" }, {}],
      ["deleteTarget", "DELETE", `${PREFIX}/${TARGET_ID}?version=1`, undefined, {}],
      ["clientResults", "PUT", `${revisionPrefix}/client-results`, { version: 1, results: [] }, {}],
      ["createReconciliation", "POST", `${revisionPrefix}/reconciliations`, { amount: "12.00" }, {
        "x-idempotency-key": "reconciliation-create",
        "x-request-id": "request-create",
      }],
      ["updateReconciliation", "PATCH", `${revisionPrefix}/reconciliations/${RECONCILIATION_ID}`, { version: 1 }, { "x-request-id": "request-update" }],
      ["voidReconciliation", "POST", `${revisionPrefix}/reconciliations/${RECONCILIATION_ID}/void`, { version: 2 }, { "x-request-id": "request-void" }],
    ] as const;

    for (const [name, method, path, body, extraHeaders] of mutations) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: authHeaders("superuser", extraHeaders),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.equal(response.status, 200, name);
      assert.equal((await response.json() as { endpoint: string }).endpoint, name);
    }

    const replayResponse = await fetch(`${baseUrl}${PREFIX}`, {
      method: "POST",
      headers: authHeaders("superuser", { "x-idempotency-key": "v7-replay" }),
      body: JSON.stringify({ name: "Ignored replay" }),
    });
    assert.equal(replayResponse.status, 200);
    assert.deepEqual(await replayResponse.json(), { endpoint: "replayed" });

    const reconciliationReplayResponse = await fetch(`${baseUrl}${revisionPrefix}/reconciliations`, {
      method: "POST",
      headers: authHeaders("superuser", { "x-idempotency-key": "v7-replay" }),
      body: JSON.stringify({ amount: "must-not-reach-service" }),
    });
    assert.equal(reconciliationReplayResponse.status, 200);
    assert.deepEqual(await reconciliationReplayResponse.json(), { endpoint: "replayed" });

    assert.deepEqual(calls.map((call) => call.name), [
      "candidates",
      ...mutations.map(([name]) => name),
    ]);
    assert.equal((calls[0]?.args[0] as AuthenticatedUser).role, "superuser");
    assert.equal(calls[0]?.args[1], TARGET_ID);
    assert.equal(calls[0]?.args[2], REVISION_ID);
    assert.equal((calls[0]?.args[3] as Record<string, unknown>).search, "1234");
    assert.deepEqual(calls[3]?.args.slice(1), [TARGET_ID, "1"]);
    assert.equal(calls[5]?.args[4], "request-create");
    assert.equal(calls[6]?.args[5], "request-update");
    assert.equal(calls[7]?.args[5], "request-void");
    assert.deepEqual(idempotencyScopes, [
      "collection:billing-principal:saved-target:create",
      `collection:billing-principal:reconciliation:${TARGET_ID}:${REVISION_ID}:create`,
      "collection:billing-principal:saved-target:create",
      `collection:billing-principal:reconciliation:${TARGET_ID}:${REVISION_ID}:create`,
    ]);
  } finally {
    await stopTestServer(server);
  }
});

test("V7 Billing Principal returns controlled IDOR and stale-version responses", async () => {
  const { app, calls } = createV7RouteHarness();
  const { server, baseUrl } = await startTestServer(app);
  try {
    const foreignTarget = await fetch(`${baseUrl}${PREFIX}/foreign-target`, {
      headers: authHeaders("manager"),
    });
    assert.equal(foreignTarget.status, 404);
    assert.equal((await foreignTarget.json() as { error?: { code?: string } }).error?.code, "COLLECTION_OSP_TARGET_NOT_FOUND");

    const foreignReconciliation = await fetch(
      `${baseUrl}${PREFIX}/${TARGET_ID}/revisions/${REVISION_ID}/reconciliations/foreign-reconciliation`,
      {
        method: "PATCH",
        headers: authHeaders("superuser"),
        body: JSON.stringify({ version: 1 }),
      },
    );
    assert.equal(foreignReconciliation.status, 404);
    assert.equal(
      (await foreignReconciliation.json() as { error?: { code?: string } }).error?.code,
      "COLLECTION_OSP_TARGET_NOT_FOUND",
    );

    const staleUpdate = await fetch(
      `${baseUrl}${PREFIX}/${TARGET_ID}/revisions/${REVISION_ID}/reconciliations/${RECONCILIATION_ID}`,
      {
        method: "PATCH",
        headers: authHeaders("superuser"),
        body: JSON.stringify({ version: 0 }),
      },
    );
    assert.equal(staleUpdate.status, 409);
    assert.equal(
      (await staleUpdate.json() as { error?: { code?: string } }).error?.code,
      "COLLECTION_RECONCILIATION_VERSION_CONFLICT",
    );
    assert.deepEqual(calls.map((call) => call.name), []);
  } finally {
    await stopTestServer(server);
  }
});
