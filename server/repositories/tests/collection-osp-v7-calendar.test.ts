import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionOspReconciliationAccountResult } from "../../lib/collection-osp-reconciliation";
import {
  buildCollectionOspCalendarDays,
  deriveCollectionOspClientAllView,
  resolveCollectionOspDrilldownContribution,
} from "../collection-osp-v7-repository-utils";

function reconciliation(
  overrides: Partial<CollectionOspReconciliationAccountResult>,
): CollectionOspReconciliationAccountResult {
  return {
    targetRevisionId: "11111111-1111-4111-8111-111111111111",
    cycleKey: "cycle-a",
    aging: "D3",
    totalDue: "1000.00",
    billingPrincipalOsp: "500.00",
    systemCumulative: "700.00",
    manualPriorAmount: "300.00",
    reconciledCumulative: "1000.00",
    remainingAmount: "0.00",
    systemClosed: false,
    reconciledClosed: true,
    systemAbortDate: null,
    effectiveClosureDate: "2026-09-10",
    manualEffectiveDate: "2026-09-10",
    contributionSource: "MANUAL_RECONCILIATION",
    manualSuperseded: false,
    ...overrides,
  };
}

test("V7 calendar reports exact daily/cumulative movement, target achievement, and same-day Client result", () => {
  const clientSnapshots = new Map([
    ["2026-09-10", new Map([
      ["D3", { ospClosed: "450.00", resultPercentage: "45.00" }],
    ])],
  ]);
  const days = buildCollectionOspCalendarDays({
    from: "2026-09-09",
    to: "2026-09-11",
    aging: "D3",
    totalBaseline: 100_000n,
    targetOsp: 50_000n,
    targetAgingScope: ["D3"],
    results: [
      reconciliation({}),
      reconciliation({
        cycleKey: "cycle-b",
        billingPrincipalOsp: "250.00",
        systemCumulative: "1000.00",
        manualPriorAmount: "0.00",
        reconciledCumulative: "1000.00",
        systemClosed: true,
        systemAbortDate: "2026-09-11",
        effectiveClosureDate: "2026-09-11",
        manualEffectiveDate: null,
        contributionSource: "SYSTEM_ABORT_CP",
      }),
    ],
    activeManualCycleKeys: new Set(["cycle-a"]),
    clientSnapshots,
  });

  assert.equal(days.length, 3);
  assert.deepEqual(days[0], {
    date: "2026-09-09",
    aging: "D3",
    totalOsp: "1000.00",
    targetOsp: "500.00",
    systemOspClosedToday: "0.00",
    manualReconciliationOspClosedToday: "0.00",
    reconciledOspClosedToday: "0.00",
    systemCumulativeOspClosed: "0.00",
    manualReconciliationCumulativeOsp: "0.00",
    reconciledCumulativeOspClosed: "0.00",
    systemResultPercentage: "0.0000",
    reconciledResultPercentage: "0.0000",
    clientResultPercentage: null,
    systemPreviousResultPercentage: "0.0000",
    reconciledPreviousResultPercentage: "0.0000",
    systemDailyMovementPercentagePoints: "0.0000",
    reconciledDailyMovementPercentagePoints: "0.0000",
    systemAchievementVsTargetPercentage: "0.0000",
    reconciledAchievementVsTargetPercentage: "0.0000",
    systemDailyAccounts: 0,
    manualDailyAccounts: 0,
    reconciledDailyAccounts: 0,
  });
  assert.equal(days[1]?.manualReconciliationOspClosedToday, "500.00");
  assert.equal(days[1]?.reconciledResultPercentage, "50.0000");
  assert.equal(days[1]?.reconciledAchievementVsTargetPercentage, "100.0000");
  assert.equal(days[1]?.clientResultPercentage, "45.00");
  assert.equal(days[2]?.reconciledPreviousResultPercentage, "50.0000");
  assert.equal(days[2]?.reconciledDailyMovementPercentagePoints, "25.0000");
  assert.equal(days[2]?.reconciledAchievementVsTargetPercentage, "150.0000");
});

test("V7 ALL calendar does not invent a Client aggregate from an incomplete aging snapshot", () => {
  const days = buildCollectionOspCalendarDays({
    from: "2026-09-10",
    to: "2026-09-10",
    totalBaseline: 200_000n,
    targetOsp: 100_000n,
    targetAgingScope: ["D3", "D4"],
    results: [],
    activeManualCycleKeys: new Set(),
    clientSnapshots: new Map([
      ["2026-09-10", new Map([
        ["D3", { ospClosed: "500.00", resultPercentage: "50.00" }],
      ])],
    ]),
  });

  assert.equal(days[0]?.aging, "ALL");
  assert.equal(days[0]?.clientResultPercentage, null);
});

test("V7 drilldown retains an earlier manual event while current contribution uses later System ABORT", () => {
  const result = reconciliation({
    systemClosed: true,
    systemAbortDate: "2026-09-20",
    effectiveClosureDate: "2026-09-10",
    contributionSource: "SYSTEM_ABORT_CP",
    manualSuperseded: true,
  });

  assert.deepEqual(
    resolveCollectionOspDrilldownContribution(result, true, true, undefined),
    { source: "MANUAL_RECONCILIATION", effectiveDate: "2026-09-10" },
  );
  assert.deepEqual(
    resolveCollectionOspDrilldownContribution(result, true, false, undefined),
    { source: "SYSTEM_ABORT_CP", effectiveDate: "2026-09-20" },
  );
  assert.deepEqual(
    resolveCollectionOspDrilldownContribution(result, true, true, "MANUAL_RECONCILIATION"),
    { source: "MANUAL_RECONCILIATION", effectiveDate: "2026-09-10" },
  );
  assert.equal(
    resolveCollectionOspDrilldownContribution(result, true, false, "MANUAL_RECONCILIATION"),
    null,
    "current manual drilldown must equal the RM0 manual summary after System precedence",
  );
  assert.deepEqual(
    resolveCollectionOspDrilldownContribution(result, true, true, "SYSTEM_ABORT_CP"),
    { source: "SYSTEM_ABORT_CP", effectiveDate: "2026-09-20" },
  );
});

test("V7 drilldown does not attribute a System-only closure to an insufficient manual payment", () => {
  const result = reconciliation({
    manualPriorAmount: "50.00",
    systemClosed: true,
    systemAbortDate: "2026-09-20",
    effectiveClosureDate: "2026-09-20",
    contributionSource: "SYSTEM_ABORT_CP",
    manualSuperseded: true,
  });

  assert.equal(
    resolveCollectionOspDrilldownContribution(result, true, true, "MANUAL_RECONCILIATION"),
    null,
  );
});

test("V7 Client ALL is derived only from a complete exact-date aging snapshot", () => {
  const complete = deriveCollectionOspClientAllView({
    rows: [
      { aging: "D3", resultPercentage: "40.0000", ospClosed: "400.00", note: null, reference: null, effectiveDate: "2026-09-10", version: 1 },
      { aging: "D4", resultPercentage: "30.0000", ospClosed: "300.00", note: null, reference: null, effectiveDate: "2026-09-10", version: 1 },
    ],
    scopedAgings: ["D3", "D4"],
    asOfDate: "2026-09-10",
    baselineByAging: new Map([["D3", "1000.00"], ["D4", "1000.00"]]),
    explicitAll: null,
  });
  assert.equal(complete.ospClosed, "700.00");
  assert.equal(complete.resultPercentage, "35.0000");
  assert.equal(complete.effectiveDate, "2026-09-10");

  const incomplete = deriveCollectionOspClientAllView({
    rows: [
      { aging: "D3", resultPercentage: "40.0000", ospClosed: "400.00", note: null, reference: null, effectiveDate: "2026-09-10", version: 1 },
      { aging: "D4", resultPercentage: "0.0000", ospClosed: "0.00", note: null, reference: null, effectiveDate: null, version: null },
    ],
    scopedAgings: ["D3", "D4"],
    asOfDate: "2026-09-10",
    baselineByAging: new Map([["D3", "1000.00"], ["D4", "1000.00"]]),
    explicitAll: null,
  });
  assert.equal(incomplete.ospClosed, "0.00");
  assert.equal(incomplete.resultPercentage, "0.0000");
  assert.equal(incomplete.effectiveDate, null);
});
