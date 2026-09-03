import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBillingPrincipalDrilldownFilters,
  getBillingPrincipalCalendarGridDates,
  getBillingPrincipalCalendarMonthRange,
} from "./BillingPrincipalInsights";
import { getBillingPrincipalExactClientSnapshotWarning } from "./BillingPrincipalSavedTargetWorkspace";

test("Billing Principal calendar clips a month to the immutable target tracking range", () => {
  assert.deepEqual(getBillingPrincipalCalendarMonthRange({
    month: "2026-09",
    start: "2026-09-05",
    end: "2026-09-24",
  }), { from: "2026-09-05", to: "2026-09-24" });
  assert.equal(getBillingPrincipalCalendarMonthRange({
    month: "2026-08",
    start: "2026-09-05",
    end: "2026-09-24",
  }), null);
});

test("Billing Principal month grid retains weekday alignment and a stable six-week layout", () => {
  const grid = getBillingPrincipalCalendarGridDates("2026-09");
  assert.equal(grid.length, 42);
  assert.deepEqual(grid.slice(0, 4), [null, null, "2026-09-01", "2026-09-02"]);
  assert.equal(grid.filter(Boolean).length, 30);
});

test("Billing Principal daily and cumulative drilldowns have distinct date semantics", () => {
  assert.deepEqual(buildBillingPrincipalDrilldownFilters({
    reportAsOf: "2026-09-30",
    selectedDate: "2026-09-20",
    scope: "daily",
    page: 2,
    aging: "D3",
    source: "MANUAL_RECONCILIATION",
  }), {
    asOf: "2026-09-30",
    date: "2026-09-20",
    page: 2,
    pageSize: 20,
    aging: "D3",
    contributionSource: "MANUAL_RECONCILIATION",
  });
  assert.deepEqual(buildBillingPrincipalDrilldownFilters({
    reportAsOf: "2026-09-30",
    selectedDate: "2026-09-20",
    scope: "cumulative",
    page: 1,
    aging: "",
    source: "",
  }), {
    asOf: "2026-09-20",
    page: 1,
    pageSize: 20,
  });
});

test("Billing Principal client comparisons do not carry a snapshot forward from another date", () => {
  assert.equal(getBillingPrincipalExactClientSnapshotWarning({
    asOf: "2026-09-20",
    agingScope: ["D3", "D4"],
    rows: [
      { aging: "D3", effectiveDate: "2026-09-20" },
      { aging: "D4", effectiveDate: "2026-09-19" },
    ] as never,
  }), "No exact client snapshot is saved for D4 on 2026-09-20. Client figures are not carried forward from another date.");

  assert.equal(getBillingPrincipalExactClientSnapshotWarning({
    asOf: "2026-09-20",
    agingScope: ["D3", "D4"],
    rows: [
      { aging: "D3", effectiveDate: "2026-09-20" },
      { aging: "D4", effectiveDate: "2026-09-20" },
    ] as never,
  }), null);
});
