import assert from "node:assert/strict";
import test from "node:test";
import {
  createBillingPrincipalSavedTarget,
  deleteBillingPrincipalSavedTarget,
  downloadBillingPrincipalExport,
  getBillingPrincipalVisualExportDataset,
  getBillingPrincipalSavedTarget,
  listBillingPrincipalSavedTargets,
  upsertBillingPrincipalClientResults,
} from "@/lib/api/collection-billing-principal";
import { createBillingPrincipalVisualExportFixture } from "./billing-principal-v7-test-fixture";

const savedTarget = {
  id: "target-a", name: "September governed target", description: null, status: "ACTIVE", version: 1,
  assignedAdminUserId: "admin-a", assignedAdmin: { id: "admin-a", username: "admin", fullName: null },
  activeRevision: {
    id: "revision-a", revisionNumber: 1, from: "2026-09-01", to: "2026-09-30",
    trackingStartDate: "2026-09-01", trackingEndDate: "2026-09-30", sourceImportIds: ["source-a"],
    sourceSnapshots: [{ sourceImportId: "source-a", name: "Saved source", filename: "source.xlsx" }],
    nicknameScope: [], agingScope: ["D3", "D4", "D5", "D6"], createdAt: "2026-09-01T00:00:00.000Z",
  },
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
} as const;

test("target read requires a server-authenticated stable viewer ID rather than deriving it from assignment", async () => {
  const originalFetch = globalThis.fetch;
  let viewer: string | undefined = "manager-owner";
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, target: savedTarget,
    ...(viewer ? { viewerUserId: viewer } : {}) }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const response = await getBillingPrincipalSavedTarget("target-a");
    assert.equal(response.viewerUserId, "manager-owner");
    assert.notEqual(response.viewerUserId, response.target.assignedAdminUserId);
    viewer = undefined;
    await assert.rejects(getBillingPrincipalSavedTarget("target-a"));
  } finally { globalThis.fetch = originalFetch; }
});

test("target read retains authoritative source validity and rejects impossible or inverted DATE bounds", async () => {
  const originalFetch = globalThis.fetch;
  const window = { from: "2026-08-12", to: "2026-09-10", version: "current-sources-v2", sourceValidityVerified: true,
    sources: [{ sourceImportId: "source-a", validFrom: "2026-08-12", validTo: "2026-09-10", configured: true }] };
  const target = { ...savedTarget, activeRevision: { ...savedTarget.activeRevision, reportingWindow: window } };
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, viewerUserId: "admin-a", target }),
    { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    assert.deepEqual((await getBillingPrincipalSavedTarget("target-a")).target.activeRevision.reportingWindow, window);
    window.from = "2026-02-30";
    await assert.rejects(getBillingPrincipalSavedTarget("target-a"));
    window.from = "2026-09-11";
    await assert.rejects(getBillingPrincipalSavedTarget("target-a"));
    window.from = "2026-08-12";
    window.sources[0]!.validFrom = "2026-09-11";
    await assert.rejects(getBillingPrincipalSavedTarget("target-a"));
  } finally { globalThis.fetch = originalFetch; }
});

test("visual export refuses legacy data without a stable authenticated owner", async () => {
  const originalFetch = globalThis.fetch;
  const fixture = createBillingPrincipalVisualExportFixture();
  let owner: string | undefined = fixture.generatedByUserId;
  globalThis.fetch = (async () => new Response(JSON.stringify({ ...fixture, generatedByUserId: owner }),
    { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const filters = { asOf: "2026-09-20", from: "2026-09-01", to: "2026-09-20" };
    assert.equal((await getBillingPrincipalVisualExportDataset("target-a", "revision-a", filters)).generatedByUserId, owner);
    owner = undefined;
    await assert.rejects(getBillingPrincipalVisualExportDataset("target-a", "revision-a", filters));
  } finally { globalThis.fetch = originalFetch; }
});

test("Billing Principal Saved Target wrappers use the governed nested route", async () => {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: String(init?.method || "GET"), body: typeof init?.body === "string" ? init.body : "" });
    const payload = String(init?.method || "GET") === "GET" ? { ok: true, targets: [savedTarget], page: 1, pageSize: 50, hasMore: false } : { ok: true, target: savedTarget };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    assert.equal((await listBillingPrincipalSavedTargets()).targets[0]?.activeRevision.id, "revision-a");
    await createBillingPrincipalSavedTarget({
      name: "September governed target", sourceImportIds: ["source-a"], from: "2026-09-01", to: "2026-09-30",
      assignedAdminUserId: "admin-a",
      trackingStartDate: "2026-09-01", trackingEndDate: "2026-09-30", nicknameScope: [], agingScope: ["D3"],
      targets: [{ agingBucket: "D3", totalOspBaseline: "1000.00", targetPercentage: "50.0000" }],
    });
    await deleteBillingPrincipalSavedTarget("target/a", 1);
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(calls[0]?.url, "/api/collection/report/billing-principal/saved-targets");
  assert.equal(calls[1]?.method, "POST");
  assert.equal(calls[2]?.url, "/api/collection/report/billing-principal/saved-targets/target%2Fa?version=1");
});

test("Table B submits only D3-D6 percentages and evidence; OSP is server-derived", async () => {
  const originalFetch = globalThis.fetch;
  let body = "";
  const fixture = createBillingPrincipalVisualExportFixture();
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    body = typeof init?.body === "string" ? init.body : "";
    return new Response(JSON.stringify({ ok: true, clientResult: fixture.overview.clientResult, latestComparison: fixture.overview.latestComparison }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const response = await upsertBillingPrincipalClientResults("target-a", "revision-a", {
      rows: [{ aging: "D3", targetPercentage: "50.0000", resultPercentage: "75.0000", note: "Client checkpoint", reference: "CLIENT-REF-1", version: 1 }],
    });
    assert.equal(response.clientResult.rows[0]?.ospClosed, "7500.00");
  } finally { globalThis.fetch = originalFetch; }
  const submitted = JSON.parse(body) as { rows: Array<Record<string, unknown>> };
  assert.equal(submitted.rows[0]?.resultPercentage, "75.0000");
  assert.equal("ospClosed" in (submitted.rows[0] || {}), false);
  assert.equal("asOf" in submitted, false);
});

test("Billing Principal export preserves attachment metadata", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response("aging,result\nD3,50.00", { status: 200, headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=\"billing-principal.csv\"", "X-Billing-Export-Owner-Id": "export-owner" } });
  }) as typeof fetch;
  try {
    const result = await downloadBillingPrincipalExport("target-a", "revision-a", { asOf: "2026-09-15", format: "csv" });
    assert.equal(result.fileName, "billing-principal.csv");
    assert.equal(result.generatedByUserId, "export-owner");
    assert.equal(await result.blob.text(), "aging,result\nD3,50.00");
  } finally { globalThis.fetch = originalFetch; }
  assert.match(requestedUrl, /\/export\?asOf=2026-09-15&format=csv$/);
});

test("private save sends an actor freshness header without treating it as submitted owner data", async () => {
  const originalFetch = globalThis.fetch;
  const fixture = createBillingPrincipalVisualExportFixture();
  let headers = new Headers();
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    headers = new Headers(init?.headers);
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ok: true, clientResult: fixture.overview.clientResult, latestComparison: fixture.overview.latestComparison }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await upsertBillingPrincipalClientResults("target-a", "revision-a", { rows: [] }, { expectedViewerUserId: "owner-a" });
    assert.equal(headers.get("X-Billing-Viewer-Id"), "owner-a");
    assert.deepEqual(Object.keys(body), ["rows"]);
  } finally { globalThis.fetch = originalFetch; }
});

test("binary export without a server-bound owner fails closed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("PKsynthetic", { status: 200 })) as typeof fetch;
  try {
    await assert.rejects(downloadBillingPrincipalExport("target-a", "revision-a", { asOf: "2026-09-15", format: "xlsx" }));
  } finally { globalThis.fetch = originalFetch; }
});

test("visual export accepts the V9 two-table dataset and full authorized card", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(createBillingPrincipalVisualExportFixture()), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const dataset = await getBillingPrincipalVisualExportDataset("target-a", "revision-a", { asOf: "2026-09-20", from: "2026-09-01", to: "2026-09-20", date: "2026-09-10", aging: "D3" });
    assert.equal(dataset.drilldown[0]?.poolAmount, "350.00");
    assert.equal(dataset.drilldown[0]?.cardNumber, "4111111111119876");
    assert.equal(dataset.overview.latestComparison.differencePercentagePoints, "5.0000");
  } finally { globalThis.fetch = originalFetch; }
  assert.match(requestedUrl, /format=json$/);
});

test("visual export rejects drilldown payloads above its bounded schema cap", async () => {
  const originalFetch = globalThis.fetch;
  const fixture = createBillingPrincipalVisualExportFixture();
  globalThis.fetch = (async () => new Response(JSON.stringify({ ...fixture, drilldown: Array.from({ length: 10_001 }, () => fixture.drilldown[0]), drilldownTotal: 10_001 }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    await assert.rejects(getBillingPrincipalVisualExportDataset("target-a", "revision-a", { asOf: "2026-09-20", from: "2026-09-01", to: "2026-09-20" }));
  } finally { globalThis.fetch = originalFetch; }
});
