import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionOspReconciliationAccountResult } from "../../lib/collection-osp-reconciliation";
import {
  assertCollectionOspTargetBaselineIntegrity,
  buildCollectionOspCalendarDays,
  CollectionOspV7RepositoryError,
  deriveCollectionOspClientAllView,
  resolveCollectionOspDatasetLimits,
  resolveCollectionOspDrilldownContribution,
} from "../collection-osp-v7-repository-utils";

function result(overrides: Partial<CollectionOspReconciliationAccountResult>): CollectionOspReconciliationAccountResult {
  return {
    targetRevisionId: "11111111-1111-4111-8111-111111111111", cycleKey: "cycle-a", aging: "D3",
    totalDue: "500.00", billingPrincipalOsp: "8000.00", systemCumulative: "150.00", manualPriorAmount: "350.00",
    reconciledCumulative: "500.00", remainingAmount: "0.00", systemClosed: false, reconciledClosed: true,
    systemAbortDate: null, effectiveClosureDate: "2026-09-10", manualEffectiveDate: "2026-09-10",
    contributionSource: "MANUAL_VERIFIED_ABORT", manualSuperseded: false, ...overrides,
  };
}

test("V9 calculation datasets have bounded source and payment rows", () => {
  assert.deepEqual(resolveCollectionOspDatasetLimits(), {
    maxSourceRows: 100_000,
    maxPaymentRows: 250_000,
  });
  assert.deepEqual(resolveCollectionOspDatasetLimits(5_000), {
    maxSourceRows: 5_000,
    maxPaymentRows: 100_000,
  });
});

test("V9 Table A calendar exposes one System-only effective movement series", () => {
  const days = buildCollectionOspCalendarDays({
    from: "2026-09-09", to: "2026-09-11", aging: "D3", totalBaseline: 1_000_000n, targetOsp: 500_000n,
    results: [
      result({}),
      result({ cycleKey: "cycle-b", billingPrincipalOsp: "2000.00", systemCumulative: "500.00", manualPriorAmount: "0.00", reconciledCumulative: "500.00", systemClosed: true, systemAbortDate: "2026-09-11", effectiveClosureDate: "2026-09-11", manualEffectiveDate: null, contributionSource: "SYSTEM_ABORT_CP" }),
    ],
  });
  assert.equal(days.length, 3);
  assert.deepEqual(days[0], {
    date: "2026-09-09", aging: "D3", totalOsp: "10000.00", targetOsp: "5000.00",
    systemOspClosedToday: "0.00", systemCumulativeOspClosed: "0.00", systemResultPercentage: "0.0000",
    systemPreviousResultPercentage: "0.0000", systemDailyMovementPercentagePoints: "0.0000",
    systemAchievementVsTargetPercentage: "0.0000", systemDailyAccounts: 0,
  });
  assert.equal(days[1]?.systemOspClosedToday, "8000.00");
  assert.equal(days[1]?.systemResultPercentage, "80.0000");
  assert.equal(days[1]?.systemAchievementVsTargetPercentage, "160.0000");
  assert.equal(days[2]?.systemOspClosedToday, "2000.00");
  assert.equal(days[2]?.systemPreviousResultPercentage, "80.0000");
  assert.equal(days[2]?.systemDailyMovementPercentagePoints, "20.0000");
});

test("V9 drilldown labels effective manual POOL and automatic closure without a reconciliation surface", () => {
  const superseded = result({ systemClosed: true, systemAbortDate: "2026-09-20", effectiveClosureDate: "2026-09-10", contributionSource: "SYSTEM_ABORT_CP", manualSuperseded: true });
  assert.deepEqual(resolveCollectionOspDrilldownContribution(superseded, true, true, undefined), { source: "MANUAL_VERIFIED_ABORT", effectiveDate: "2026-09-10" });
  assert.deepEqual(resolveCollectionOspDrilldownContribution(superseded, true, false, undefined), { source: "AUTOMATIC_ABORT_CP", effectiveDate: "2026-09-20" });
  assert.deepEqual(resolveCollectionOspDrilldownContribution(superseded, true, true, "MANUAL_VERIFIED_ABORT"), { source: "MANUAL_VERIFIED_ABORT", effectiveDate: "2026-09-10" });
  assert.equal(resolveCollectionOspDrilldownContribution(superseded, true, false, "MANUAL_VERIFIED_ABORT"), null);
});

test("V9 Client ALL is weighted from a complete latest D3-D6 submission", () => {
  const config = new Map([
    ["D3" as const, { aging: "D3" as const, totalOsp: "1000.00", targetPercentage: "50.0000", targetOsp: "500.00" }],
    ["D4" as const, { aging: "D4" as const, totalOsp: "3000.00", targetPercentage: "50.0000", targetOsp: "1500.00" }],
  ]);
  const complete = deriveCollectionOspClientAllView({
    rows: [
      { aging: "D3", totalOsp: "1000.00", targetPercentage: "50.0000", targetOsp: "500.00", resultPercentage: "40.0000", ospClosed: "400.00", note: null, reference: null, receivedDate: "2026-09-10", updatedAt: "2026-09-10T01:00:00.000Z", version: 1 },
      { aging: "D4", totalOsp: "3000.00", targetPercentage: "50.0000", targetOsp: "1500.00", resultPercentage: "20.0000", ospClosed: "600.00", note: null, reference: null, receivedDate: "2026-09-10", updatedAt: "2026-09-10T01:00:00.000Z", version: 1 },
    ],
    scopedAgings: ["D3", "D4"], configByAging: config,
  });
  assert.equal(complete.totalOsp, "4000.00");
  assert.equal(complete.ospClosed, "1000.00");
  assert.equal(complete.resultPercentage, "25.0000");
  assert.equal(complete.receivedDate, "2026-09-10");

  const incomplete = deriveCollectionOspClientAllView({ rows: [{ aging: "D3", totalOsp: "1000.00", targetPercentage: "50.0000", targetOsp: "500.00", resultPercentage: "40.0000", ospClosed: "400.00", note: null, reference: null, receivedDate: "2026-09-10", updatedAt: "2026-09-10T01:00:00.000Z", version: 1 }], scopedAgings: ["D3", "D4"], configByAging: config });
  assert.equal(incomplete.ospClosed, "0.00");
  assert.equal(incomplete.receivedDate, null);
});

test("V9 Saved Target baseline is reconstructed exactly from Billing Principal OSP snapshots", () => {
  assert.doesNotThrow(() => assertCollectionOspTargetBaselineIntegrity({
    agingScope: ["D3", "D4"],
    hasSavedSourceScope: true,
    agingRows: [
      { aging: "D3", totalOsp: "600000.00", targetPercentage: "50.0000", targetOsp: "300000.00" },
      { aging: "D4", totalOsp: "0.00", targetPercentage: "0.0000", targetOsp: "0.00" },
    ],
    sourceRows: [
      { aging: "D3", billingPrincipalOsp: "100000.00" },
      { aging: "D3", billingPrincipalOsp: "200000.00" },
      { aging: "D3", billingPrincipalOsp: "300000.00" },
    ],
  }));
});

test("V9 distinguishes a genuine zero TT OSP from missing or stale baseline data", () => {
  assert.doesNotThrow(() => assertCollectionOspTargetBaselineIntegrity({
    agingScope: ["D3"],
    hasSavedSourceScope: true,
    agingRows: [{ aging: "D3", totalOsp: "0.00", targetPercentage: "0.0000", targetOsp: "0.00" }],
    sourceRows: [{ aging: "D3", billingPrincipalOsp: "0.00" }],
  }));
  for (const invalid of [
    {
      agingRows: [] as Array<{ aging: "D3"; totalOsp: string; targetPercentage: string; targetOsp: string }>,
      sourceRows: [{ aging: "D3" as const, billingPrincipalOsp: "100.00" }],
    },
    {
      agingRows: [{ aging: "D3" as const, totalOsp: "0.00", targetPercentage: "10.0000", targetOsp: "0.00" }],
      sourceRows: [{ aging: "D3" as const, billingPrincipalOsp: "100.00" }],
    },
  ]) {
    assert.throws(
      () => assertCollectionOspTargetBaselineIntegrity({
        agingScope: ["D3"],
        hasSavedSourceScope: true,
        ...invalid,
      }),
      (error) => error instanceof CollectionOspV7RepositoryError && error.reason === "BASELINE_MISMATCH",
    );
  }

  assert.throws(
    () => assertCollectionOspTargetBaselineIntegrity({
      agingScope: ["D3"],
      agingRows: [{
        aging: "D3",
        totalOsp: "0.00",
        targetPercentage: "0.0000",
        targetOsp: "0.00",
      }],
      sourceRows: [],
      hasSavedSourceScope: false,
    }),
    (error) => error instanceof CollectionOspV7RepositoryError && error.reason === "BASELINE_MISMATCH",
  );
});
