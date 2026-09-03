import assert from "node:assert/strict";
import test from "node:test";
import {
  createBillingPrincipalSavedTarget,
  createBillingPrincipalReconciliation,
  deleteBillingPrincipalSavedTarget,
  downloadBillingPrincipalExport,
  getBillingPrincipalVisualExportDataset,
  getBillingPrincipalReconciliationHistory,
  listBillingPrincipalReconciliationCandidates,
  listBillingPrincipalSavedTargets,
} from "@/lib/api/collection-billing-principal";
import { createBillingPrincipalVisualExportFixture } from "./billing-principal-v7-test-fixture";

const savedTarget = {
  id: "target-a",
  name: "September governed target",
  description: null,
  status: "ACTIVE",
  version: 1,
  activeRevision: {
    id: "revision-a",
    revisionNumber: 1,
    from: "2026-09-01",
    to: "2026-09-30",
    trackingStartDate: "2026-09-01",
    trackingEndDate: "2026-09-30",
    sourceImportIds: ["source-a"],
    sourceSnapshots: [{ sourceImportId: "source-a", name: "Saved source", filename: "source.xlsx" }],
    nicknameScope: [],
    agingScope: ["D3", "D4", "D5", "D6"],
    createdAt: "2026-09-01T00:00:00.000Z",
  },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
} as const;

test("Billing Principal V7 Saved Target wrappers use the governed nested route", async () => {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: String(init?.method || "GET"),
      body: typeof init?.body === "string" ? init.body : "",
    });
    const list = String(init?.method || "GET") === "GET";
    return new Response(JSON.stringify(list
      ? { ok: true, targets: [savedTarget] }
      : { ok: true, target: savedTarget }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const listed = await listBillingPrincipalSavedTargets({ signal: controller.signal });
    assert.equal(listed.targets[0]?.activeRevision.id, "revision-a");
    await createBillingPrincipalSavedTarget({
      name: "September governed target",
      sourceImportIds: ["source-a"],
      from: "2026-09-01",
      to: "2026-09-30",
      trackingStartDate: "2026-09-01",
      trackingEndDate: "2026-09-30",
      nicknameScope: [],
      agingScope: ["D3"],
      targets: [{ agingBucket: "D3", totalOspBaseline: "1000.00", targetPercentage: "50.0000" }],
    });
    await deleteBillingPrincipalSavedTarget("target/a", 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls[0]?.url, "/api/collection/report/billing-principal/saved-targets");
  assert.equal(calls[0]?.method, "GET");
  assert.equal(calls[1]?.method, "POST");
  assert.equal(JSON.parse(calls[1]?.body || "{}").trackingStartDate, "2026-09-01");
  assert.equal(calls[2]?.url, "/api/collection/report/billing-principal/saved-targets/target%2Fa?version=1");
  assert.equal(calls[2]?.method, "DELETE");
});

test("Billing Principal V7 candidates and history remain revision-aware and abortable", async () => {
  const calls: Array<{ url: string; signal: AbortSignal | null }> = [];
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, signal: init?.signal || null });
    const payload = url.endsWith("/history")
      ? {
          ok: true,
          history: [{
            id: "audit-a",
            operation: "CREATE",
            fromVersion: null,
            toVersion: 1,
            before: null,
            after: { manualPriorAmount: "200.00", status: "ACTIVE" },
            actor: "superuser",
            createdAt: "2026-09-01T01:00:00.000Z",
          }],
        }
      : {
          ok: true,
          candidates: [{
            sourceImportId: "source-a",
            sourceRecordId: "record-a",
            sourceName: "Saved source",
            sourceFilename: "source.xlsx",
            maskedAccountNumber: "•••• 4321",
            cardNumberLast4: "4321",
            maskedCustomerName: "A*** B***",
            aging: "D3",
            callingDate: "2026-09-01",
            totalDue: "1000.00",
            billingPrincipalOsp: "800.00",
            systemEligibleCumulative: "300.00",
            rawSystemClassification: "CP",
            activeReconciliationId: null,
          }],
          pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
        };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const candidates = await listBillingPrincipalReconciliationCandidates(
      "target/a",
      "revision/a",
      { asOf: "2026-09-15", page: 2, pageSize: 10, search: "4321", aging: "D3" },
      { signal: controller.signal },
    );
    assert.equal(candidates.candidates[0]?.maskedAccountNumber, "•••• 4321");
    const history = await getBillingPrincipalReconciliationHistory(
      "target/a",
      "revision/a",
      "entry/a",
      { signal: controller.signal },
    );
    assert.equal(history.history[0]?.after?.status, "ACTIVE");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(
    calls[0]?.url || "",
    /\/saved-targets\/target%2Fa\/revisions\/revision%2Fa\/reconciliation-candidates\?asOf=2026-09-15&page=2&pageSize=10&search=4321&aging=D3$/,
  );
  assert.match(calls[1]?.url || "", /\/reconciliations\/entry%2Fa\/history$/);
  assert.equal(calls[0]?.signal, controller.signal);
  assert.equal(calls[1]?.signal, controller.signal);
});

test("Billing Principal V7 accepts the server reconciliation view after creation", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: true,
    reconciliation: {
      id: "reconciliation-a",
      version: 1,
      status: "ACTIVE",
      sourceImportId: "source-a",
      sourceRecordId: "record-a",
      sourceName: "Saved source",
      sourceFilename: "source.xlsx",
      maskedAccountNumber: "•••• 4321",
      cardNumberLast4: "4321",
      maskedCustomerName: "A*** B***",
      aging: "D3",
      callingDate: "2026-09-01",
      totalDue: "1000.00",
      billingPrincipalOsp: "800.00",
      systemEligibleCumulative: "300.00",
      rawSystemClassification: "CP",
      manualPriorAmount: "700.00",
      asOfDate: "2026-09-15",
      actualPaymentDate: "2026-08-31",
      reconciledCumulative: "1000.00",
      reconciledRemaining: "0.00",
      reconciledStatus: "RECONCILED_CLOSED",
      reconciledClosedEffectiveDate: "2026-09-15",
      reason: "PRIOR_PAYMENT_NOT_IN_SYSTEM",
      note: "Verified against client evidence.",
      reference: "CLIENT-REF-1",
      createdBy: "superuser",
      createdAt: "2026-09-15T01:00:00.000Z",
      updatedBy: "superuser",
      updatedAt: "2026-09-15T01:00:00.000Z",
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;

  try {
    const response = await createBillingPrincipalReconciliation(
      "target-a",
      "revision-a",
      {
        sourceImportId: "source-a",
        sourceRecordId: "record-a",
        manualPriorAmount: "700.00",
        asOfDate: "2026-09-15",
        actualPaymentDate: "2026-08-31",
        reason: "PRIOR_PAYMENT_NOT_IN_SYSTEM",
        note: "Verified against client evidence.",
        reference: "CLIENT-REF-1",
      },
    );
    assert.equal(response.reconciliation.id, "reconciliation-a");
    assert.equal(response.reconciliation.reconciledStatus, "RECONCILED_CLOSED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Billing Principal V7 export preserves attachment metadata", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response("aging,result\nD3,50.00", {
      status: 200,
      headers: {
        "content-type": "text/csv",
        "content-disposition": "attachment; filename=\"billing-principal.csv\"",
      },
    });
  }) as typeof fetch;

  try {
    const result = await downloadBillingPrincipalExport(
      "target-a",
      "revision-a",
      { asOf: "2026-09-15", format: "csv" },
    );
    assert.equal(result.fileName, "billing-principal.csv");
    assert.equal(result.mimeType, "text/csv");
    assert.equal(await result.blob.text(), "aging,result\nD3,50.00");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requestedUrl, /\/export\?asOf=2026-09-15&format=csv$/);
});

test("Billing Principal visual export uses governed JSON and validates the full dataset", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(createBillingPrincipalVisualExportFixture()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const dataset = await getBillingPrincipalVisualExportDataset(
      "target-a",
      "revision-a",
      {
        asOf: "2026-09-20",
        from: "2026-09-01",
        to: "2026-09-20",
        date: "2026-09-10",
        aging: "D3",
      },
    );
    assert.equal(dataset.reconciliations[0]?.manualPriorAmount, "300.00");
    assert.equal(dataset.drilldown[0]?.billingPrincipalOsp, "8000.00");
    assert.equal(dataset.generatedBy, "superuser");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requestedUrl, /format=json$/);
  assert.match(requestedUrl, /date=2026-09-10/);
  assert.match(requestedUrl, /aging=D3/);
});

test("Billing Principal visual export rejects a combined detail payload above the backend cap", async () => {
  const originalFetch = globalThis.fetch;
  const fixture = createBillingPrincipalVisualExportFixture();
  const oversized = {
    ...fixture,
    reconciliations: Array.from({ length: 5_001 }, () => fixture.reconciliations[0]),
    reconciliationTotal: 5_001,
    drilldown: Array.from({ length: 5_000 }, () => fixture.drilldown[0]),
    drilldownTotal: 5_000,
  };
  globalThis.fetch = (async () => new Response(JSON.stringify(oversized), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;

  try {
    await assert.rejects(
      getBillingPrincipalVisualExportDataset("target-a", "revision-a", {
        asOf: "2026-09-20",
        from: "2026-09-01",
        to: "2026-09-20",
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
