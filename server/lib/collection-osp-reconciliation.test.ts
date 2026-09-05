import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateCollectionOspReconciliation,
  buildCollectionOspReconciliationCalendar,
  formatCollectionOspPercentage,
  parseCollectionOspMoneyCents,
  reconcileCollectionOspAccount,
  type CollectionOspReconciliationAccountInput,
} from "./collection-osp-reconciliation";

function account(overrides: Partial<CollectionOspReconciliationAccountInput> = {}) {
  return reconcileCollectionOspAccount({
    targetRevisionId: "revision-a",
    cycleKey: "2026-09-01:account-a",
    aging: "D3",
    totalDue: "1000.00",
    billingPrincipalOsp: "8000.00",
    systemPayments: [{ id: "system-1", date: "2026-09-10", amount: "700.00" }],
    systemAbortDate: null,
    manual: {
      amount: "300.00",
      asOfDate: "2026-09-10",
      actualPaymentDate: null,
      active: true,
    },
    asOfDate: "2026-09-30",
    ...overrides,
  });
}

test("V7 closes 700 + 300 exactly without mutating raw System state", () => {
  const result = account();
  assert.equal(result.systemCumulative, "700.00");
  assert.equal(result.systemClosed, false);
  assert.equal(result.reconciledCumulative, "1000.00");
  assert.equal(result.remainingAmount, "0.00");
  assert.equal(result.reconciledClosed, true);
  assert.equal(result.contributionSource, "MANUAL_VERIFIED_ABORT");
  assert.equal(result.effectiveClosureDate, "2026-09-10");
});

test("below threshold remains open and over threshold closes", () => {
  assert.equal(account({ manual: { amount: "299.99", asOfDate: "2026-09-10", active: true } }).reconciledClosed, false);
  const over = account({ manual: { amount: "500.00", asOfDate: "2026-09-10", active: true } });
  assert.equal(over.reconciledClosed, true);
  assert.equal(over.remainingAmount, "0.00");
});

test("a later System payment cannot retroactively validate an insufficient manual settlement", () => {
  const result = account({
    systemPayments: [
      { id: "system-before", date: "2026-09-05", amount: "600.00" },
      { id: "system-after", date: "2026-09-10", amount: "100.00" },
    ],
    manual: {
      amount: "300.00",
      asOfDate: "2026-09-05",
      actualPaymentDate: null,
      active: true,
    },
  });

  assert.equal(result.systemCumulative, "700.00", "current System position still includes the later CP");
  assert.equal(result.reconciledCumulative, "1000.00", "POOL remains separately visible for audit");
  assert.equal(result.reconciledClosed, false);
  assert.equal(result.effectiveClosureDate, null);
  assert.equal(result.contributionSource, "OPEN");
});

test("System ABORT takes current contribution precedence without double counting", () => {
  const result = account({
    systemPayments: [
      { id: "system-1", date: "2026-09-10", amount: "700.00" },
      { id: "system-2", date: "2026-09-20", amount: "300.00" },
    ],
    systemAbortDate: "2026-09-20",
  });
  assert.equal(result.contributionSource, "SYSTEM_ABORT_CP");
  assert.equal(result.manualSuperseded, true);
  // The manual fact made the combined position sufficient on the first System
  // payment date; a later raw ABORT must not create another reconciled event.
  assert.equal(result.effectiveClosureDate, "2026-09-10");
  const aggregates = aggregateCollectionOspReconciliation(
    [result, { ...result }],
    { D3: "10000.00" },
    "reconciled",
  );
  assert.deepEqual(aggregates[0], {
    aging: "D3",
    ospClosed: "8000.00",
    closedAccountCount: 1,
    resultPercentage: "80.0000",
  });
});

test("Reconciled union never manufactures closure from CP-only cumulative amounts", () => {
  const legacyCpOnly = account({
    systemPayments: [{ id: "system-1", date: "2026-09-10", amount: "1000.00" }],
    systemAbortDate: null,
    manual: null,
  });
  assert.equal(legacyCpOnly.systemClosed, false);
  assert.equal(legacyCpOnly.reconciledClosed, false);
  assert.equal(legacyCpOnly.contributionSource, "OPEN");

  const factualAbortWithIncompleteHistory = account({
    systemPayments: [{ id: "system-1", date: "2026-09-10", amount: "200.00" }],
    systemAbortDate: "2026-09-20",
    manual: null,
  });
  assert.equal(factualAbortWithIncompleteHistory.systemClosed, true);
  assert.equal(factualAbortWithIncompleteHistory.reconciledClosed, true);
  assert.equal(factualAbortWithIncompleteHistory.effectiveClosureDate, "2026-09-20");
  assert.equal(factualAbortWithIncompleteHistory.contributionSource, "SYSTEM_ABORT_CP");

  const abortAfterAnUnclassifiedThreshold = account({
    systemPayments: [{ id: "system-1", date: "2026-09-10", amount: "1000.00" }],
    systemAbortDate: "2026-09-20",
    manual: null,
  });
  assert.equal(abortAfterAnUnclassifiedThreshold.effectiveClosureDate, "2026-09-20");
});

test("same customer can retain two independent cycle/account contributions", () => {
  const first = account();
  const second = account({ cycleKey: "2026-09-01:account-b", billingPrincipalOsp: "5000.00" });
  const row = aggregateCollectionOspReconciliation(
    [first, second],
    { D3: "20000.00" },
    "reconciled",
  )[0];
  assert.equal(row?.closedAccountCount, 2);
  assert.equal(row?.ospClosed, "13000.00");
});

test("editing down and voiding the manual state removes qualification", () => {
  assert.equal(account({ manual: { amount: "250.00", asOfDate: "2026-09-10", active: true } }).reconciledClosed, false);
  const voided = account({ manual: { amount: "300.00", asOfDate: "2026-09-10", active: false } });
  assert.equal(voided.manualPriorAmount, "0.00");
  assert.equal(voided.reconciledClosed, false);
});

test("calendar uses one reconciled event and keeps raw System movement separate", () => {
  const result = account({
    systemPayments: [
      { id: "system-1", date: "2026-09-10", amount: "700.00" },
      { id: "system-2", date: "2026-09-20", amount: "300.00" },
    ],
    systemAbortDate: "2026-09-20",
  });
  const days = buildCollectionOspReconciliationCalendar([result], "2026-09");
  assert.equal(days[9]?.manualDailyOsp, "8000.00");
  assert.equal(days[9]?.reconciledDailyOsp, "8000.00");
  assert.equal(days[19]?.systemDailyOsp, "8000.00");
  assert.equal(days[19]?.manualDailyOsp, "0.00");
  assert.equal(days[19]?.reconciledDailyOsp, "0.00");
  assert.equal(days[29]?.manualCumulativeOsp, "8000.00");
  assert.equal(days[29]?.reconciledCumulativeOsp, "8000.00");
});

test("ALL percentage is weighted from totals and target revisions isolate keys", () => {
  const a = account();
  const b = account({ targetRevisionId: "revision-b" });
  const aggregates = aggregateCollectionOspReconciliation(
    [a, b],
    { D3: "20000.00", D4: "10000.00" },
    "reconciled",
  );
  const all = aggregates[aggregates.length - 1];
  assert.equal(all?.ospClosed, "16000.00");
  assert.equal(all?.resultPercentage, formatCollectionOspPercentage(1_600_000n, 3_000_000n));
});

test("money parsing preserves exact sen and rejects malformed thousands separators", () => {
  assert.equal(parseCollectionOspMoneyCents("1,234,567.89"), 123_456_789n);
  assert.equal(parseCollectionOspMoneyCents("0001.01"), 101n);
  assert.throws(() => parseCollectionOspMoneyCents("1,2,3.00"), /exact non-negative decimal/i);
  assert.throws(() => parseCollectionOspMoneyCents("1,00.00"), /exact non-negative decimal/i);
});

test("explicit invalid business dates fail closed instead of changing event provenance", () => {
  assert.throws(
    () => account({ systemAbortDate: "2026-02-30" }),
    /System ABORT date is invalid/i,
  );
  assert.throws(
    () => account({
      manual: {
        amount: "300.00",
        asOfDate: "2026-09-05",
        actualPaymentDate: "2026-02-30",
        active: true,
      },
    }),
    /actual payment date is invalid/i,
  );
});

test("a future manual fact is validated but cannot close an earlier as-of position", () => {
  const result = account({
    manual: { amount: "300.00", asOfDate: "2026-10-01", active: true },
    asOfDate: "2026-09-30",
  });
  assert.equal(result.manualPriorAmount, "0.00");
  assert.equal(result.reconciledClosed, false);
  assert.throws(
    () => account({
      manual: { amount: "not-money", asOfDate: "2026-10-01", active: true },
      asOfDate: "2026-09-30",
    }),
    /exact non-negative decimal/i,
  );
});
