import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import type { AuthenticatedUser } from "../../auth/guards";
import { HttpError } from "../../http/errors";
import { CollectionOspV7RepositoryError } from "../../repositories/collection-osp-v7-repository-utils";
import {
  CollectionOspV7Operations,
  assertCollectionOspV7ExportWithinLimits,
  MAX_COLLECTION_OSP_V7_EXPORT_ESTIMATED_BYTES,
  MAX_COLLECTION_OSP_V7_EXPORT_DETAIL_ROWS,
} from "../collection/collection-osp-v7-operations";
import type { CollectionStoragePort } from "../collection/collection-service-support";

const TARGET_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";
const COMPLETE_AGING_SCOPE = ["D3", "D4", "D5", "D6"] as const;

function completeTargetRows(d3Baseline: string) {
  return COMPLETE_AGING_SCOPE.map((agingBucket) => ({
    agingBucket,
    totalOspBaseline: agingBucket === "D3" ? d3Baseline : "0.00",
    targetPercentage: "50",
  }));
}

function user(role: string): AuthenticatedUser {
  return { username: `${role}.test`, role, activityId: `${role}-activity` };
}

function visibleTarget() {
  return {
    id: TARGET_ID,
    name: "September",
    description: null,
    status: "ACTIVE" as const,
    version: 1,
    activeRevision: {
      id: REVISION_ID,
      revisionNumber: 1,
      from: "2026-09-01",
      to: "2026-09-30",
      trackingStartDate: "2026-09-01",
      trackingEndDate: "2026-09-30",
      sourceImportIds: ["source-a"],
      sourceSnapshots: [],
      nicknameScope: [],
      agingScope: ["D3" as const],
      createdAt: "2026-09-01T00:00:00.000Z",
    },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function clientResult() {
  const row = {
    aging: "D3" as const,
    totalOsp: "10000.00",
    targetPercentage: "50.0000",
    targetOsp: "5000.00",
    resultPercentage: "75.0000",
    ospClosed: "7500.00",
    note: null,
    reference: null,
    receivedDate: "2026-09-04",
    updatedAt: "2026-09-04T08:00:00.000Z",
    version: 1,
  };
  return { rows: [row], all: { ...row, aging: "ALL" as const, version: null } };
}

function completeExportDataset() {
  const systemRow = {
    aging: "D3", totalOsp: "10000.00", targetPercentage: "50.0000",
    targetOsp: "5000.00", ospClosed: "8000.00", resultPercentage: "80.0000",
    closedAccountCount: 1,
  };
  const clientRow = {
    aging: "D3", totalOsp: "10000.00", targetPercentage: "50.0000",
    targetOsp: "5000.00", ospClosed: "7500.00", resultPercentage: "75.0000",
    receivedDate: "2026-09-10", updatedAt: "2026-09-10T08:00:00.000Z",
    reference: "CLIENT-REF", note: "Client result",
  };
  return {
    generatedAt: "2026-09-10T09:00:00.000Z",
    filters: { asOf: "2026-09-10", from: "2026-09-10", to: "2026-09-10", date: null, aging: null },
    overview: {
      target: visibleTarget(),
      revision: visibleTarget().activeRevision,
      asOf: "2026-09-10",
      systemResult: { rows: [systemRow], all: { ...systemRow, aging: "ALL" } },
      clientResult: { rows: [clientRow], all: { ...clientRow, aging: "ALL" } },
      latestComparison: {
        system: { asOf: "2026-09-10", totalOsp: "10000.00", ospClosed: "8000.00", resultPercentage: "80.0000" },
        client: { lastUpdatedAt: "2026-09-10T08:00:00.000Z", totalOsp: "10000.00", ospClosed: "7500.00", resultPercentage: "75.0000" },
        differencePercentagePoints: "5.0000",
      },
    },
    calendar: [{
      date: "2026-09-10", aging: "ALL", totalOsp: "10000.00", targetOsp: "5000.00",
      systemOspClosedToday: "8000.00", systemCumulativeOspClosed: "8000.00",
      systemResultPercentage: "80.0000", systemPreviousResultPercentage: "0.0000",
      systemDailyMovementPercentagePoints: "80.0000", systemAchievementVsTargetPercentage: "160.0000",
      systemDailyAccounts: 1,
    }],
    drilldown: [{
      contributionSource: "MANUAL_VERIFIED_ABORT", maskedAccountNumber: "ending-1234",
      cardNumber: "4111111111119876", cardNumberLast4: "9876", maskedCustomerName: "A*** Z***",
      sourceName: "=UNSAFE()", sourceFilename: "source.xlsx", callingDate: "2026-09-01", aging: "D3",
      totalDue: "500.00", systemEligibleCumulative: "150.00", systemClosureCollectionAmount: "0.00",
      systemClosureStaffNickname: null, poolAmount: "350.00", effectiveCumulative: "500.00",
      billingPrincipalOsp: "8000.00", effectiveClosedDate: "2026-09-10", reason: "PRIOR_PAYMENT",
      reference: "POOL-REF", verifiedBy: "root", verifiedAt: "2026-09-10T07:00:00.000Z",
      updatedBy: "root", updatedAt: "2026-09-10T07:00:00.000Z",
    }],
    drilldownTotal: 1,
  };
}

function operations(storage: Partial<CollectionStoragePort>) {
  return new CollectionOspV7Operations(
    storage as CollectionStoragePort,
    (authenticatedUser) => {
      if (!authenticatedUser) throw new Error("Unauthenticated test request");
      return authenticatedUser;
    },
  );
}

function assertHttpError(error: unknown, statusCode: number, code?: string) {
  assert.ok(error instanceof HttpError);
  assert.equal(error.statusCode, statusCode);
  if (code !== undefined) assert.equal(error.code, code);
  return true;
}

test("V9 Billing mutations deny non-superuser before storage is called", async () => {
  let called = false;
  const service = operations({
    createCollectionOspSavedTarget: async () => {
      called = true;
      throw new Error("must not be called");
    },
    upsertCollectionOspClientResults: async () => {
      called = true;
      throw new Error("must not be called");
    },
  });
  await assert.rejects(service.createTarget(user("admin"), {}), (error) => assertHttpError(error, 403));
  await assert.rejects(
    service.upsertClientResults(user("manager"), TARGET_ID, REVISION_ID, { rows: [] }),
    (error) => assertHttpError(error, 403),
  );
  assert.equal(called, false);
});

test("V9 target/revision mismatch is concealed as not found before overview access", async () => {
  let overviewCalled = false;
  const service = operations({
    getCollectionOspSavedTarget: async () => undefined,
    getCollectionOspTargetOverview: async () => {
      overviewCalled = true;
      throw new Error("must not be called");
    },
  });
  await assert.rejects(
    service.overview(user("manager"), TARGET_ID, REVISION_ID, { asOf: "2026-09-10" }),
    (error) => assertHttpError(error, 404, "COLLECTION_OSP_TARGET_NOT_FOUND"),
  );
  assert.equal(overviewCalled, false);
});

test("V9 target creation validates exact money before storage", async () => {
  let called = false;
  const service = operations({
    createCollectionOspSavedTarget: async () => {
      called = true;
      throw new Error("must not be called");
    },
  });
  await assert.rejects(
    service.createTarget(user("superuser"), {
      name: "September",
      sourceImportIds: ["source-a"],
      from: "2026-09-01",
      to: "2026-09-30",
      agingScope: COMPLETE_AGING_SCOPE,
      nicknameScope: [],
      targets: completeTargetRows("1000.001"),
    }),
    (error) => assertHttpError(error, 400),
  );
  assert.equal(called, false);
});

test("V9 Saved Target rejects a partial aging scope before storage", async () => {
  let called = false;
  const service = operations({
    createCollectionOspSavedTarget: async () => {
      called = true;
      throw new Error("must not be called");
    },
  });
  await assert.rejects(
    service.createTarget(user("superuser"), {
      name: "Partial September",
      sourceImportIds: ["source-a"],
      from: "2026-09-01",
      to: "2026-09-30",
      agingScope: ["D3"],
      nicknameScope: [],
      targets: [{ agingBucket: "D3", totalOspBaseline: "1000.00", targetPercentage: "50" }],
    }),
    (error) => assertHttpError(error, 400),
  );
  assert.equal(called, false);
});

test("V9 missing or stale Saved TT OSP remains a controlled rebuild conflict", async () => {
  const service = operations({
    createCollectionOspSavedTarget: async () => {
      throw new CollectionOspV7RepositoryError(
        "BASELINE_MISMATCH",
        "D3 TT OSP baseline is stale. Rebuild this Saved Target.",
      );
    },
  });
  await assert.rejects(
    service.createTarget(user("superuser"), {
      name: "September",
      sourceImportIds: ["source-a"],
      from: "2026-09-01",
      to: "2026-09-30",
      agingScope: COMPLETE_AGING_SCOPE,
      nicknameScope: [],
      targets: completeTargetRows("1000.00"),
    }),
    (error) => assertHttpError(error, 409),
  );
});

test("V9 Client save accepts percentages only and returns server-derived Table B", async () => {
  let received: Parameters<CollectionStoragePort["upsertCollectionOspClientResults"]>[0] | undefined;
  const canonicalClient = clientResult();
  const comparison = {
    system: { asOf: "2026-09-04", totalOsp: "10000.00", ospClosed: "8000.00", resultPercentage: "80.0000" },
    client: { lastUpdatedAt: "2026-09-04T08:00:00.000Z", receivedDate: "2026-09-04", totalOsp: "10000.00", ospClosed: "7500.00", resultPercentage: "75.0000" },
    differencePercentagePoints: "5.0000",
  };
  const service = operations({
    getCollectionOspSavedTarget: async () => visibleTarget(),
    upsertCollectionOspClientResults: async (input) => {
      received = input;
      return canonicalClient;
    },
    getCollectionOspTargetOverview: async () => ({ latestComparison: comparison }) as never,
  });
  const response = await service.upsertClientResults(user("superuser"), TARGET_ID, REVISION_ID, {
    rows: [{
      aging: "D3",
      resultPercentage: "75.0000",
      ospClosed: "999999.99",
      totalOsp: "1.00",
      targetOsp: "1.00",
    }],
  });
  assert.deepEqual(received?.rows, [{
    aging: "D3",
    resultPercentage: "75.0000",
    note: null,
    reference: null,
  }]);
  assert.equal(response.clientResult.rows[0]?.ospClosed, "7500.00");
  assert.equal(response.clientResult.rows[0]?.totalOsp, "10000.00");
  assert.deepEqual(response.latestComparison, comparison);
});

test("V9 oversized drilldown scopes retain a controlled 413 response", async () => {
  const service = operations({
    getCollectionOspSavedTarget: async () => visibleTarget(),
    getCollectionOspDrilldown: async () => {
      throw new CollectionOspV7RepositoryError("DATASET_TOO_LARGE", "Drilldown exceeds the source-row limit.");
    },
  });
  await assert.rejects(
    service.drilldown(user("manager"), TARGET_ID, REVISION_ID, { asOf: "2026-09-10" }),
    (error) => assertHttpError(error, 413),
  );
});

test("V9 export forwards only two-table filters and ignores removed Table C input", async () => {
  let received: Record<string, unknown> | undefined;
  const service = operations({
    getCollectionOspSavedTarget: async () => visibleTarget(),
    getCollectionOspExportDataset: async (input) => {
      received = input;
      return {
        generatedAt: "2026-09-10T00:00:00.000Z",
        filters: { asOf: "2026-09-10", from: "2026-09-01", to: "2026-09-10", date: null, aging: null },
        overview: {},
        calendar: [],
        drilldown: [],
        drilldownTotal: 0,
      } as never;
    },
  });
  await service.exportReport(user("manager"), TARGET_ID, REVISION_ID, {
    format: "json",
    asOf: "2026-09-10",
    from: "2026-09-01",
    to: "2026-09-10",
    contributionSource: "MANUAL_RECONCILIATION",
    reconciliations: true,
  });
  assert.deepEqual(received, {
    targetId: TARGET_ID,
    revisionId: REVISION_ID,
    asOfDate: "2026-09-10",
    from: "2026-09-01",
    to: "2026-09-10",
  });
});

test("V9 Excel export contains governed Table A/B sheets, real cells, full authorized Card No, and formula protection", async () => {
  const service = operations({
    getCollectionOspSavedTarget: async () => visibleTarget(),
    getCollectionOspExportDataset: async () => completeExportDataset() as never,
  });
  const result = await service.exportReport(user("manager"), TARGET_ID, REVISION_ID, {
    format: "xlsx", asOf: "2026-09-10", from: "2026-09-10", to: "2026-09-10",
  });
  assert.equal(result.contentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.ok(result.buffer.subarray(0, 2).equals(Buffer.from("PK")));
  const workbook = XLSX.read(result.buffer, { type: "buffer", cellDates: true });
  assert.deepEqual(workbook.SheetNames, [
    "Summary", "Table A System", "Table B Client", "Latest Comparison", "Daily Movement", "OSP Closed Detail",
  ]);
  assert.equal(workbook.SheetNames.some((name) => /table c|reconcil/i.test(name)), false);
  const systemRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Table A System"]!);
  const clientHeaders = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Table B Client"]!, { header: 1 })[0] ?? [];
  const detailRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["OSP Closed Detail"]!);
  const calendarRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Daily Movement"]!);
  assert.equal(systemRows[0]?.["TT OSP"], 10000);
  assert.equal(systemRows[0]?.["Result Percentage"], 80);
  assert.equal(clientHeaders.includes("Pool Amount"), false);
  assert.equal(detailRows[0]?.["Card No"], "4111111111119876");
  assert.equal(detailRows[0]?.["Source Name"], "'=UNSAFE()");
  assert.ok(calendarRows[0]?.Date instanceof Date);
});

test("V9 export fails closed on detail rows and estimated serialized bytes", () => {
  assert.throws(
    () => assertCollectionOspV7ExportWithinLimits({
      drilldown: Array.from(
        { length: MAX_COLLECTION_OSP_V7_EXPORT_DETAIL_ROWS + 1 },
        () => ({ account: "safe" }),
      ),
    }),
    (error) => assertHttpError(error, 413),
  );
  assert.throws(
    () => assertCollectionOspV7ExportWithinLimits({
      drilldown: [],
      overview: { oversized: "x".repeat(MAX_COLLECTION_OSP_V7_EXPORT_ESTIMATED_BYTES) },
    }),
    (error) => assertHttpError(error, 413),
  );
});
