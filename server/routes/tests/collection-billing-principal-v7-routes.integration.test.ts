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

type Call = { args: unknown[]; name: string };

function createHarness() {
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
      if (targetId === "foreign-target") throw notFound("Saved Target was not found.", "COLLECTION_OSP_TARGET_NOT_FOUND");
      return { ...record("getTarget", user, targetId), target: { activeRevision: { id: REVISION_ID } } };
    },
    updateBillingPrincipalSavedTarget: async (...args: unknown[]) => record("updateTarget", ...args),
    deleteBillingPrincipalSavedTarget: async (...args: unknown[]) => record("deleteTarget", ...args),
    getBillingPrincipalTargetOverview: async (...args: unknown[]) => record("overview", ...args),
    upsertBillingPrincipalClientResults: async (...args: unknown[]) => {
      const body = args[3] as { stale?: boolean } | undefined;
      if (body?.stale) throw conflict("Client Result changed in another session.", "COLLECTION_OSP_CLIENT_RESULT_VERSION_CONFLICT");
      return record("clientResults", ...args);
    },
    getBillingPrincipalCalendar: async (...args: unknown[]) => record("calendar", ...args),
    getBillingPrincipalDrilldown: async (...args: unknown[]) => record("drilldown", ...args),
    exportBillingPrincipalTarget: async (...args: unknown[]) => {
      record("export", ...args);
      return {
        buffer: Buffer.from("v9-two-table-export"),
        generatedByUserId: (args[0] as AuthenticatedUser).userId,
        contentType: "application/json; charset=utf-8",
        filename: "billing-principal-v9.json",
      };
    },
  } as unknown as CollectionService;
  const storage = {
    acquireMutationIdempotency: async (input: { scope: string; idempotencyKey: string }) => {
      idempotencyScopes.push(input.scope);
      if (input.idempotencyKey === "v9-replay") {
        return { responseBody: { endpoint: "replayed" }, responseStatus: 200, status: "replay" as const };
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
  registerCollectionBillingPrincipalV7Routes({
    adminSummaryAccess: [],
    app,
    collectionService,
    jsonMutationRoute: (fallbackMessage, scopeResolver, handler, authorizeReplay) => createCollectionJsonMutationRouteHandler({
      fallbackMessage,
      handler,
      scopeResolver,
      storage,
      authorizeReplay,
    }),
    jsonRoute: (fallbackMessage, handler) => createCollectionJsonRouteHandler({ fallbackMessage, handler }),
    recordMutationAccess: [],
    reportAccess,
    sourceMatchAccess: [],
    staffSummaryAccess: [authenticateToken, requireRole("admin", "manager", "superuser"), requireTabAccess("collection-report")],
    storage,
    superuserReportAccess,
    teamReportAccess: [],
  } satisfies CollectionRouteContext);
  return { app, calls, idempotencyScopes };
}

function authHeaders(role: string, extra: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-test-role": role,
    "x-test-username": `${role}.user`,
    "x-test-userid": `${role}-id`,
    ...extra,
  };
}

test("V9 Billing read routes expose only Saved Target, Table A/B, Calendar, drilldown, and export", async () => {
  const { app, calls } = createHarness();
  const { server, baseUrl } = await startTestServer(app);
  const revisionPrefix = `${PREFIX}/${TARGET_ID}/revisions/${REVISION_ID}`;
  try {
    const reads = [
      ["list", PREFIX],
      ["getTarget", `${PREFIX}/${TARGET_ID}`],
      ["overview", `${revisionPrefix}/overview?asOf=2026-09-10`],
      ["calendar", `${revisionPrefix}/calendar?from=2026-09-01&to=2026-09-30`],
      ["drilldown", `${revisionPrefix}/drilldown?aging=D3&page=2`],
      ["export", `${revisionPrefix}/export?format=json`],
    ] as const;
    for (const [name, path] of reads) {
      const response = await fetch(`${baseUrl}${path}`, { headers: authHeaders("manager") });
      assert.equal(response.status, 200, name);
      if (name === "export") {
        assert.equal(await response.text(), "v9-two-table-export");
        assert.match(String(response.headers.get("content-disposition")), /billing-principal-v9\.json/i);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("x-billing-export-owner-id"), "manager-id");
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      } else {
        assert.equal((await response.json() as { endpoint: string }).endpoint, name);
      }
    }
    for (const legacyPath of [
      `${revisionPrefix}/reconciliation-candidates`,
      `${revisionPrefix}/reconciliations`,
      `${revisionPrefix}/reconciliations/legacy/history`,
    ]) {
      const response = await fetch(`${baseUrl}${legacyPath}`, { headers: authHeaders("superuser") });
      assert.equal(response.status, 404, legacyPath);
    }
    assert.deepEqual(calls.map((call) => call.name), reads.map(([name]) => name));
  } finally {
    await stopTestServer(server);
  }
});

test("V3 shared mutations are superuser-only and private results are staff-editable and owner-scoped", async () => {
  const { app, calls, idempotencyScopes } = createHarness();
  const { server, baseUrl } = await startTestServer(app);
  const revisionPrefix = `${PREFIX}/${TARGET_ID}/revisions/${REVISION_ID}`;
  try {
    const manager = await fetch(`${baseUrl}${revisionPrefix}/client-results`, {
      method: "PUT",
      headers: authHeaders("manager"),
      body: JSON.stringify({ rows: [] }),
    });
    assert.equal(manager.status, 200);
    assert.equal((await manager.json() as { endpoint: string }).endpoint, "clientResults");
    for (const role of ["admin", "manager", "user"]) {
      const denied = await fetch(`${baseUrl}${PREFIX}`, {
        method: "POST", headers: authHeaders(role), body: JSON.stringify({ name: "Forbidden shared mutation" }),
      });
      assert.equal(denied.status, 403);
    }
    calls.length = 0;
    idempotencyScopes.length = 0;

    const mutations = [
      ["createTarget", "POST", PREFIX, { name: "September" }],
      ["updateTarget", "PATCH", `${PREFIX}/${TARGET_ID}`, { version: 1, name: "October" }],
      ["deleteTarget", "DELETE", `${PREFIX}/${TARGET_ID}?version=1`, undefined],
      ["clientResults", "PUT", `${revisionPrefix}/client-results`, { rows: [{ aging: "D3", resultPercentage: "75" }] }],
    ] as const;
    for (const [name, method, path, body] of mutations) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: authHeaders("superuser", { "x-idempotency-key": `${name}-key` }),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.equal(response.status, 200, name);
      assert.equal((await response.json() as { endpoint: string }).endpoint, name);
    }
    assert.deepEqual(calls.map((call) => call.name), mutations.map(([name]) => name));
    assert.deepEqual(idempotencyScopes, [
      "collection:billing-principal:saved-target:create",
      `collection:billing-principal:saved-target:${TARGET_ID}`,
      `collection:billing-principal:saved-target:${TARGET_ID}`,
      `collection:billing-principal:private-client-result:superuser-id:${TARGET_ID}:${REVISION_ID}`,
    ]);
  } finally {
    await stopTestServer(server);
  }
});

test("V3 private cached replay rechecks current target access and ordinary users cannot reach saved Billing", async () => {
  const { app, calls, idempotencyScopes } = createHarness();
  const { server, baseUrl } = await startTestServer(app);
  try {
    for (const suffix of ["", `/${TARGET_ID}`, `/${TARGET_ID}/revisions/${REVISION_ID}/overview`, `/${TARGET_ID}/revisions/${REVISION_ID}/calendar`, `/${TARGET_ID}/revisions/${REVISION_ID}/drilldown`, `/${TARGET_ID}/revisions/${REVISION_ID}/export`]) {
      const response = await fetch(`${baseUrl}${PREFIX}${suffix}`, { headers: authHeaders("user") });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    const unauthenticated = await fetch(`${baseUrl}${PREFIX}`);
    assert.equal(unauthenticated.status, 401);
    const ordinarySave = await fetch(`${baseUrl}${PREFIX}/${TARGET_ID}/revisions/${REVISION_ID}/client-results`, {
      method: "PUT", headers: authHeaders("user"), body: JSON.stringify({ rows: [] }),
    });
    assert.equal(ordinarySave.status, 403);
    assert.equal(calls.length, 0);
    const replay = await fetch(`${baseUrl}${PREFIX}/${TARGET_ID}/revisions/${REVISION_ID}/client-results`, {
      method: "PUT", headers: authHeaders("manager", { "x-idempotency-key": "v9-replay" }), body: JSON.stringify({ rows: [] }),
    });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as { endpoint: string }).endpoint, "replayed");
    assert.deepEqual(calls.map((call) => call.name), ["getTarget"]);
    assert.equal(idempotencyScopes[0], `collection:billing-principal:private-client-result:manager-id:${TARGET_ID}:${REVISION_ID}`);
    const revoked = await fetch(`${baseUrl}${PREFIX}/foreign-target/revisions/${REVISION_ID}/client-results`, {
      method: "PUT", headers: authHeaders("admin", { "x-idempotency-key": "v9-replay" }), body: JSON.stringify({ rows: [] }),
    });
    assert.equal(revoked.status, 404, "cached private response cannot bypass reassignment/revocation");
    assert.equal((await revoked.text()).includes("replayed"), false);
  } finally { await stopTestServer(server); }
});

test("V9 Billing preserves controlled target IDOR and Client concurrency responses", async () => {
  const { app } = createHarness();
  const { server, baseUrl } = await startTestServer(app);
  try {
    const foreign = await fetch(`${baseUrl}${PREFIX}/foreign-target`, { headers: authHeaders("manager") });
    assert.equal(foreign.status, 404);
    assert.equal((await foreign.json() as { error?: { code?: string } }).error?.code, "COLLECTION_OSP_TARGET_NOT_FOUND");

    const stale = await fetch(`${baseUrl}${PREFIX}/${TARGET_ID}/revisions/${REVISION_ID}/client-results`, {
      method: "PUT",
      headers: authHeaders("superuser"),
      body: JSON.stringify({ stale: true }),
    });
    assert.equal(stale.status, 409);
    assert.equal(
      (await stale.json() as { error?: { code?: string } }).error?.code,
      "COLLECTION_OSP_CLIENT_RESULT_VERSION_CONFLICT",
    );
  } finally {
    await stopTestServer(server);
  }
});
