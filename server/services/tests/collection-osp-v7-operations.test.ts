import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { unzipSync, strFromU8 } from "fflate";
import type { AuthenticatedUser } from "../../auth/guards";
import { HttpError } from "../../http/errors";
import { CollectionOspV7RepositoryError } from "../../repositories/collection-osp-v7-repository-utils";
import { resolveCollectionOspReportingWindow } from "../../lib/collection-osp-reporting-window";
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
  return { userId: `${role}-id`, username: `${role}.test`, role, activityId: `${role}-activity` };
}

function visibleTarget() {
  return {
    id: TARGET_ID,
    assignedAdminUserId: "admin-id",
    assignedAdmin: { id: "admin-id", username: "admin.test", fullName: null },
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
    balanceOsp: "-2500.00",
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
    balanceOsp: "-3000.00",
  };
  const clientRow = {
    aging: "D3", totalOsp: "10000.00", targetPercentage: "50.0000",
    targetOsp: "5000.00", ospClosed: "7500.00", resultPercentage: "75.0000",
    receivedDate: "2026-09-10", updatedAt: "2026-09-10T08:00:00.000Z",
    reference: "CLIENT-REF", note: "=UNSAFE()", balanceOsp: "-2500.00",
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
      balanceOsp: "-3000.00",
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
    service.upsertClientResults(user("user"), TARGET_ID, REVISION_ID, { rows: [] }),
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
      assignedAdminUserId: "admin-id",
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
      assignedAdminUserId: "admin-id",
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
      assignedAdminUserId: "admin-id",
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
      targetPercentage: "50.0000",
      resultPercentage: "75.0000",
    }],
  });
  assert.deepEqual(received?.rows, [{
    aging: "D3",
    targetPercentage: "50.0000",
    resultPercentage: "75.0000",
    note: null,
    reference: null,
  }]);
  assert.equal(response.clientResult.rows[0]?.ospClosed, "7500.00");
  assert.equal(response.clientResult.rows[0]?.totalOsp, "10000.00");
  assert.deepEqual(response.latestComparison, comparison);
});

test("V3 private saves derive stable owner from session and reject ownership/derived-field forgery", async () => {
  const received: Array<Parameters<CollectionStoragePort["upsertCollectionOspClientResults"]>[0]> = [];
  const service = operations({
    getCollectionOspSavedTarget: async (_target, _revision, viewer) => {
      assert.ok(viewer?.userId);
      return visibleTarget();
    },
    upsertCollectionOspClientResults: async (input) => { received.push(input); return clientResult(); },
    getCollectionOspTargetOverview: async () => ({ latestComparison: {} }) as never,
  });
  const row = { aging: "D3", targetPercentage: "40", resultPercentage: "30" };
  for (const role of ["superuser", "manager", "admin"]) {
    await service.upsertClientResults(user(role), TARGET_ID, REVISION_ID, { rows: [row] });
    assert.deepEqual(received[received.length - 1]?.viewer, { userId: `${role}-id`, role });
    assert.equal(received[received.length - 1]?.rows[0]?.targetPercentage, "40.0000");
  }
  const count = received.length;
  for (const forged of [
    { rows: [row], ownerUserId: "admin-id" },
    { rows: [row], owner_user_id: "admin-id" },
    { rows: [{ ...row, ownerUserId: "admin-id" }] },
    { rows: [{ ...row, ospClosed: "999999.99" }] },
    { rows: [{ ...row, totalOsp: "1.00" }] },
    { rows: [{ ...row, targetOsp: "1.00" }] },
    { rows: [{ ...row, targetPercentage: "100.0001" }] },
    { rows: [{ ...row, note: "<script>alert(1)</script>" }] },
  ]) {
    await assert.rejects(service.upsertClientResults(user("manager"), TARGET_ID, REVISION_ID, forged), (error) => assertHttpError(error, 400));
  }
  await assert.rejects(service.upsertClientResults({ username: "manager.test", role: "manager", activityId: "test-activity" }, TARGET_ID, REVISION_ID, { rows: [row] }), (error) => assertHttpError(error, 403));
  await assert.rejects(service.upsertClientResults(user("user"), TARGET_ID, REVISION_ID, { rows: [row] }), (error) => assertHttpError(error, 403));
  await assert.rejects(service.upsertClientResults({ ...user("admin"), userId: "another-admin" }, TARGET_ID, REVISION_ID, { rows: [row] }), (error) => assertHttpError(error, 404));
  assert.equal(received.length, count);
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
        overview: { target: visibleTarget() },
        calendar: [],
        drilldown: [],
        drilldownTotal: 0,
      } as never;
    },
  });
  const exported = await service.exportReport(user("manager"), TARGET_ID, REVISION_ID, {
    format: "json",
    asOf: "2026-09-10",
    from: "2026-09-01",
    to: "2026-09-10",
    contributionSource: "MANUAL_RECONCILIATION",
    reconciliations: true,
    generatedByUserId: "forged-owner",
  });
  assert.equal(JSON.parse(exported!.buffer.toString("utf8")).generatedByUserId, "manager-id");
  assert.deepEqual(received, {
    viewer: { userId: "manager-id", role: "manager" },
    targetId: TARGET_ID,
    revisionId: REVISION_ID,
    asOfDate: "2026-09-10",
    from: "2026-09-01",
    to: "2026-09-10",
  });
});

test("target read exposes only its authenticated viewer ID for owner-bound download authorization", async () => {
  const service = operations({ getCollectionOspSavedTarget: async () => visibleTarget() });
  for (const role of ["superuser", "manager", "admin"]) {
    const response = await service.getTarget(user(role), TARGET_ID);
    assert.equal(response.viewerUserId, role + "-id");
    assert.equal(response.target.id, TARGET_ID);
  }
  await assert.rejects(service.getTarget({ ...user("manager"), userId: undefined }, TARGET_ID),
    (error) => assertHttpError(error, 403));
});

test("V3 Excel export has A/B numeric balances, private owner metadata, no account section and formula protection", async () => {
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
    "Summary", "Table A System", "Table B Client", "Latest Comparison", "Daily Movement",
  ]);
  assert.equal(workbook.SheetNames.some((name) => /table c|reconcil/i.test(name)), false);
  const systemRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Table A System"]!);
  const clientHeaders = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Table B Client"]!, { header: 1 })[0] ?? [];
  const clientRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Table B Client"]!);
  const metadata = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Summary!);
  const calendarRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Daily Movement"]!);
  assert.equal(systemRows[0]?.["TT OSP"], 10000);
  assert.equal(systemRows[0]?.["Result Percentage"], 80);
  assert.equal(clientHeaders.includes("Pool Amount"), false);
  assert.deepEqual(clientHeaders, ["Aging", "TT OSP", "Target Percentage", "Target OSP", "Client Result Percentage", "Client OSP Closed", "Balance OSP"]);
  assert.deepEqual(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Table A System"]!, { header: 1 })[0],
    ["Aging", "TT OSP", "Target Percentage", "Target OSP", "Result Percentage", "OSP Closed", "Closed Account Count", "Balance OSP"]);
  assert.equal(systemRows[0]?.["Balance OSP"], -3000);
  assert.equal(clientRows[0]?.["Balance OSP"], -2500);
  assert.equal(clientRows[0]?.Note, undefined);
  assert.equal(metadata.find((row) => row.Field === "Assigned Admin")?.Value, "admin.test");
  assert.equal(metadata.find((row) => row.Field === "Private Client Owner")?.Value, "manager.test");
  assert.doesNotMatch(JSON.stringify(workbook), /4111111111119876|ending-1234|POOL-REF/);
  assert.ok(calendarRows[0]?.Date instanceof Date);
});

test("Excel stores exact large signed decimals as numeric XML cells with a declared application precision limit", async () => {
  const dataset = completeExportDataset();
  dataset.overview.systemResult.rows[0]!.totalOsp = "99999999999999.99";
  dataset.overview.systemResult.rows[0]!.balanceOsp = "-99999999999999.99";
  dataset.overview.target.name = "=HYPERLINK(unsafe)";
  const service = operations({ getCollectionOspSavedTarget: async () => dataset.overview.target,
    getCollectionOspExportDataset: async () => dataset as never });
  const result = await service.exportReport(user("manager"), TARGET_ID, REVISION_ID, { format: "xlsx", asOf: "2026-09-10", from: "2026-09-10", to: "2026-09-10" });
  const files = unzipSync(result.buffer);
  const system = strFromU8(files["xl/worksheets/sheet2.xml"]!);
  assert.match(system, /<c r="B2"[^>]*><v>99999999999999\.99<\/v><\/c>/);
  assert.match(system, /<c r="H2"[^>]*><v>-99999999999999\.99<\/v><\/c>/);
  assert.doesNotMatch(system, /<c r="(?:B2|H2)"[^>]*t="(?:s|str)"/);
  const summary = XLSX.utils.sheet_to_json<Record<string, unknown>>(XLSX.read(result.buffer, { type: "buffer" }).Sheets.Summary!);
  assert.equal(summary.find((row) => row.Field === "Target Name")?.Value, "'=HYPERLINK(unsafe)");
  assert.match(String(summary.find((row) => row.Field === "Spreadsheet Precision")?.Value), /15 significant digits/);
});

test("all report export formats reauthorize assignment and version after expensive generation", async () => {
  for (const format of ["csv", "xlsx", "json"]) {
    for (const failure of ["reassignment", "version", "disabled"]) {
      let generated = false;
      const service = operations({
        getCollectionOspSavedTarget: async () => !generated ? visibleTarget()
          : failure === "disabled" ? undefined : { ...visibleTarget(),
            ...(failure === "version" ? { version: 2 } : { assignedAdminUserId: "another-admin" }) },
        getCollectionOspExportDataset: async () => { generated = true; return completeExportDataset() as never; },
      });
      await assert.rejects(service.exportReport(user("admin"), TARGET_ID, REVISION_ID,
        { format, asOf: "2026-09-10", from: "2026-09-10", to: "2026-09-10" }),
      (error) => assertHttpError(error, failure === "version" ? 409 : 404));
      assert.equal(generated, true, "rejection happens after data generation, not merely at initial permission checking");
    }
  }
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

function liveValidityTarget(from = "2026-08-12", to = "2026-09-10") {
  const target = visibleTarget();
  return { ...target, activeRevision: { ...target.activeRevision,
    reportingWindow: resolveCollectionOspReportingWindow(target.activeRevision,
      [{ sourceImportId: "source-a", validFrom: from, validTo: to }]),
  } };
}

test("report API rejects out-of-live-source dates before aggregate storage access", async () => {
  let aggregateCalls = 0;
  const unexpected = async (): Promise<never> => { aggregateCalls++; throw new Error("must not aggregate an invalid range"); };
  const service = operations({ getCollectionOspSavedTarget: async () => liveValidityTarget(),
    getCollectionOspTargetOverview: unexpected, getCollectionOspCalendar: unexpected,
    getCollectionOspDrilldown: unexpected, getCollectionOspExportDataset: unexpected });
  for (const date of ["2026-08-11", "2026-09-11", "2026-09-30", "2026-02-29", "2026-08-27T00:00:00Z"]) {
    for (const method of ["overview", "calendar", "drilldown"] as const) {
      await assert.rejects(service[method](user("admin"), TARGET_ID, REVISION_ID, { asOf: date }),
        (error) => assertHttpError(error, 400));
    }
    await assert.rejects(service.drilldown(user("admin"), TARGET_ID, REVISION_ID, { asOf: "2026-08-27", date }),
      (error) => assertHttpError(error, 400));
    for (const key of ["from", "to", "asOf", "date"]) {
      await assert.rejects(service.exportReport(user("admin"), TARGET_ID, REVISION_ID, { format: "json", asOf: "2026-08-27", [key]: date }),
        (error) => assertHttpError(error, 400));
    }
  }
  assert.equal(aggregateCalls, 0);
});

test("report API accepts both live bounds and calendar/drilldown retain full validity for historical As Of", async () => {
  const overviewDates: string[] = [];
  const calendars: Array<{ from: string; to: string; asOfDate: string }> = [];
  const details: Array<{ date?: string; asOfDate: string }> = [];
  const service = operations({ getCollectionOspSavedTarget: async () => liveValidityTarget(),
    getCollectionOspTargetOverview: async (input) => { overviewDates.push(input.asOfDate); return {} as never; },
    getCollectionOspCalendar: async (input) => { calendars.push(input); return {} as never; },
    getCollectionOspDrilldown: async (input) => { details.push(input); return {} as never; },
  });
  for (const asOf of ["2026-08-12", "2026-08-26", "2026-08-27", "2026-09-01", "2026-09-06", "2026-09-10"])
    await service.overview(user("admin"), TARGET_ID, REVISION_ID, { asOf });
  assert.deepEqual(overviewDates, ["2026-08-12", "2026-08-26", "2026-08-27", "2026-09-01", "2026-09-06", "2026-09-10"]);
  await service.calendar(user("admin"), TARGET_ID, REVISION_ID, { asOf: "2026-08-26" });
  assert.deepEqual([calendars[0]?.from, calendars[0]?.to, calendars[0]?.asOfDate], ["2026-08-12", "2026-09-10", "2026-09-10"]);
  await service.drilldown(user("admin"), TARGET_ID, REVISION_ID, { date: "2026-08-27", asOf: "2026-08-26" });
  assert.equal(details[0]?.date, "2026-08-27");
  assert.equal(details[0]?.asOfDate, "2026-09-10", "daily movement detail is independent of historical Table A cutoff");
});

test("all export formats reject same-target-version validity changes after generation", async () => {
  for (const format of ["csv", "xlsx", "json"]) {
    const original = liveValidityTarget();
    const changed = liveValidityTarget("2026-08-15", "2026-09-05");
    assert.equal(original.version, changed.version);
    let generated = false;
    const service = operations({
      getCollectionOspSavedTarget: async () => generated ? changed : original,
      getCollectionOspExportDataset: async () => {
        generated = true;
        const dataset = completeExportDataset();
        return { ...dataset, overview: { ...dataset.overview, target: original, revision: original.activeRevision } } as never;
      },
    });
    await assert.rejects(service.exportReport(user("admin"), TARGET_ID, REVISION_ID, { format, asOf: "2026-09-06" }),
      (error) => assertHttpError(error, 409));
    assert.equal(generated, true);
  }
});

test("Excel metadata exports live validity separately from unchanged snapshot provenance", async () => {
  const target = liveValidityTarget();
  const dataset = completeExportDataset();
  const service = operations({ getCollectionOspSavedTarget: async () => target,
    getCollectionOspExportDataset: async () => ({ ...dataset, overview: { ...dataset.overview, target, revision: target.activeRevision } }) as never });
  const result = await service.exportReport(user("admin"), TARGET_ID, REVISION_ID, { format: "xlsx", asOf: "2026-09-06" });
  const workbook = XLSX.read(result.buffer, { type: "buffer" });
  const metadata = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Summary!);
  const field = (name: string) => metadata.find((row) => row.Field === name)?.Value;
  assert.equal(field("Period From"), "2026-08-12");
  assert.equal(field("Period To"), "2026-09-10");
  assert.equal(field("Snapshot Period From"), "2026-09-01");
  assert.equal(field("Snapshot Period To"), "2026-09-30");
  assert.equal(field("Period provenance"), "Verified Configure Collection Source validity");
});

test("private save comparison reloads source validity changed during the committed private write", async () => {
  let saved = false;
  let asOf = "";
  const service = operations({
    getCollectionOspSavedTarget: async () => saved ? liveValidityTarget("2026-08-15", "2026-08-27") : liveValidityTarget(),
    upsertCollectionOspClientResults: async () => { saved = true; return clientResult(); },
    getCollectionOspTargetOverview: async (input) => { asOf = input.asOfDate; return { latestComparison: {} } as never; },
  });
  const response = await service.upsertClientResults(user("admin"), TARGET_ID, REVISION_ID, {
    rows: [{ aging: "D3", targetPercentage: "50", resultPercentage: "75" }],
  });
  assert.equal(saved, true);
  assert.equal(response.clientResult.rows[0]?.ospClosed, "7500.00");
  assert.ok(asOf >= "2026-08-15" && asOf <= "2026-08-27", "comparison uses new bounds, not the stale pre-save target");
});

test("oversized configured Billing periods remain explicit controlled errors, never truncated calendars", async () => {
  let queried = false;
  const service = operations({ getCollectionOspSavedTarget: async () => liveValidityTarget("2025-01-01", "2026-09-10"),
    getCollectionOspCalendar: async () => { queried = true; return {} as never; },
    getCollectionOspExportDataset: async () => { queried = true; return {} as never; },
  });
  await assert.rejects(service.calendar(user("admin"), TARGET_ID, REVISION_ID, {}),
    (error) => assertHttpError(error, 400));
  await assert.rejects(service.exportReport(user("admin"), TARGET_ID, REVISION_ID, { format: "json", asOf: "2026-09-06" }),
    (error) => assertHttpError(error, 400));
  assert.equal(queried, false);
});
