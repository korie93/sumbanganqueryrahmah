import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBillingPrincipalDrilldownFilters,
  clampBillingPrincipalTrackingRangeToAsOf,
  getBillingPrincipalCalendarGridDates,
  getBillingPrincipalCalendarMonthRange,
} from "./BillingPrincipalInsights";

test("Billing Principal System calendar and exports never request dates after the selected as-of", () => {
  assert.deepEqual(clampBillingPrincipalTrackingRangeToAsOf({
    start: "2026-09-01",
    end: "2026-09-30",
    asOf: "2026-09-04",
  }), {
    start: "2026-09-01",
    end: "2026-09-04",
  });
  assert.deepEqual(clampBillingPrincipalTrackingRangeToAsOf({
    start: "2026-09-01",
    end: "2026-09-30",
    asOf: "2026-10-01",
  }), {
    start: "2026-09-01",
    end: "2026-09-30",
  });
});

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

test("Billing Principal drilldown keeps the selected System as-of and optional exact date", () => {
  assert.deepEqual(buildBillingPrincipalDrilldownFilters({
    reportAsOf: "2026-09-30",
    selectedDate: "2026-09-20",
    page: 2,
    aging: "D3",
  }), {
    asOf: "2026-09-30",
    date: "2026-09-20",
    page: 2,
    pageSize: 20,
    aging: "D3",
  });
  assert.deepEqual(buildBillingPrincipalDrilldownFilters({
    reportAsOf: "2026-09-30",
    page: 1,
    aging: "",
  }), {
    asOf: "2026-09-30",
    page: 1,
    pageSize: 20,
  });
});
