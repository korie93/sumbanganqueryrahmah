import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBillingPrincipalDrilldownFilters,
  getBillingPrincipalCalendarGridDates,
  getBillingPrincipalCalendarMonthRange,
  assertBillingPrincipalExportAuthorization,
  assertBillingPrincipalExportOwner,
  BillingPrincipalExportIdentityError,
} from "./BillingPrincipalInsights";

test("final export authorization binds the unchanged target to the original stable owner", () => {
  const latest = { viewerUserId: "owner-a", target: { version: 7 } };
  assert.doesNotThrow(() => assertBillingPrincipalExportAuthorization("owner-a", 7, latest));
  assert.throws(() => assertBillingPrincipalExportAuthorization("owner-a", 7,
    { ...latest, viewerUserId: "owner-b" }), BillingPrincipalExportIdentityError);
  assert.throws(() => assertBillingPrincipalExportAuthorization("owner-a", 6, latest), /Target changed/);
  assert.throws(() => assertBillingPrincipalExportOwner("", "owner-a"), BillingPrincipalExportIdentityError);
  assert.throws(() => assertBillingPrincipalExportOwner("owner-a", ""), BillingPrincipalExportIdentityError);
  assert.throws(() => assertBillingPrincipalExportOwner("owner-a", "owner-b"), BillingPrincipalExportIdentityError);
});

test("Billing Principal full configured validity spans both months independently of TABLE A", () => {
  const range = { start: "2026-08-12", end: "2026-09-11" };
  assert.deepEqual(getBillingPrincipalCalendarMonthRange({ ...range, month: "2026-08" }), { from: "2026-08-12", to: "2026-08-31" });
  assert.deepEqual(getBillingPrincipalCalendarMonthRange({ ...range, month: "2026-09" }), { from: "2026-09-01", to: "2026-09-11" });
  assert.equal(getBillingPrincipalCalendarMonthRange({ ...range, month: "2026-13" }), null);
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

test("Billing Principal drilldown uses exact clicked day and ten-account pages", () => {
  assert.deepEqual(buildBillingPrincipalDrilldownFilters({
    selectedDate: "2026-09-20",
    periodEnd: "2026-09-30",
    page: 2,
    aging: "D3",
  }), {
    asOf: "2026-09-30",
    date: "2026-09-20",
    page: 2,
    pageSize: 10,
    aging: "D3",
  });
  assert.deepEqual(buildBillingPrincipalDrilldownFilters({
    selectedDate: "2026-09-30",
    periodEnd: "2026-09-30",
    page: 1,
    aging: "ALL",
  }), {
    asOf: "2026-09-30",
    date: "2026-09-30",
    page: 1,
    pageSize: 10,
  });
});
