import assert from "node:assert/strict";
import test from "node:test";
import { getVisibleHomeItems } from "../app/navigation";
import { buildHomeDashboardSections } from "./home-layout-utils";
import { createHomeRequestGate, formatHomeAmount, getHomeBusinessDate, getHomeLeaderBreakdown } from "./home-dashboard-utils";

test("Home date follows Kuala Lumpur across device/UTC month and leap-year boundaries", () => {
  const before = getHomeBusinessDate(new Date("2026-09-30T15:59:59.000Z"));
  const after = getHomeBusinessDate(new Date("2026-09-30T16:00:00.000Z"));
  assert.equal(before.key, "2026-09-30");
  assert.equal(before.daysRemaining, 0);
  assert.equal(after.key, "2026-10-01");
  assert.equal(after.daysRemaining, 30);
  assert.equal(after.greeting, "Good morning");
  assert.equal(after.nextMidnight, Date.parse("2026-10-01T16:00:00.000Z"));
  assert.equal(getHomeBusinessDate(new Date("2028-02-28T18:00:00Z")).daysInMonth, 29);
  assert.equal(formatHomeAmount(123456789012.34), "RM 123,456,789,012.34");
});

test("Home leader denominator fails closed, separates Unassigned and reports inconsistent totals", () => {
  const dashboard = { month: 10, scopeLabel: "All records", canViewLeaderBreakdown: true,
    leaders: [{ id: "a", name: "Leader A", totalAmount: 80, totalRecords: 2 },
      { id: "b", name: "Leader B", totalAmount: 70, totalRecords: 1 }], unassignedAmount: 10 };
  assert.deepEqual(getHomeLeaderBreakdown(100).leaders, []);
  assert.deepEqual(getHomeLeaderBreakdown(100, { ...dashboard, canViewLeaderBreakdown: false }).leaders, []);
  const result = getHomeLeaderBreakdown(100, dashboard);
  assert.equal(result.leaders.length, 2);
  assert.equal(result.denominator, 150);
  assert.equal(result.mismatch, true);
  assert.equal(result.unassignedAmount, 10);
  assert.equal(getHomeLeaderBreakdown(200, dashboard).denominator, 200);
  assert.equal(getHomeLeaderBreakdown(200, dashboard).mismatch, false);
});

test("a real team leader's display name never reclassifies structured assigned totals", () => {
  const result = getHomeLeaderBreakdown(100, {
    month: 10, scopeLabel: "All records", canViewLeaderBreakdown: true,
    leaders: [{ id: "real-team", name: "Unassigned", totalAmount: 80, totalRecords: 2 }],
    unassignedAmount: 20,
  });
  assert.equal(result.leaders.length, 1);
  assert.equal(result.leaders[0]?.id, "real-team");
  assert.equal(result.denominator, 100);
  assert.equal(result.unassignedAmount, 20);
});

test("Home request gate blocks duplicate retries and ignores stale completions after cancellation", () => {
  const gate = createHomeRequestGate();
  const first = gate.begin()!;
  assert.equal(gate.begin(), null);
  gate.cancel();
  assert.equal(first.controller.signal.aborted, true);
  const second = gate.begin()!;
  assert.equal(gate.isCurrent(first.sequence), false);
  gate.finish(first.sequence);
  assert.equal(gate.isCurrent(second.sequence), true);
  assert.equal(gate.begin(), null);
  gate.finish(second.sequence);
  assert.ok(gate.begin());
});

test("Home data eligibility follows actual configurable permissions for all four roles", () => {
  for (const role of ["admin", "manager", "user"]) {
    const unavailable = buildHomeDashboardSections(getVisibleHomeItems(role, null));
    assert.equal(unavailable.canViewCollection, false);
    assert.equal(unavailable.canViewRecentActivity, false);
    assert.equal(unavailable.quickAccess.length, 0);
    const selected = buildHomeDashboardSections(getVisibleHomeItems(role, { "general-search": true, "collection-report": true, dashboard: false }));
    assert.deepEqual(selected.quickAccess.map((item) => item.id), ["general-search", "collection-report"]);
    assert.equal(selected.canViewCollection, true);
    assert.equal(selected.canViewRecentActivity, false);
  }
  const root = buildHomeDashboardSections(getVisibleHomeItems("superuser", null));
  assert.equal(root.canViewCollection, true);
  assert.equal(root.canViewRecentActivity, true);
  assert.deepEqual(root.quickAccess.map((item) => item.id), ["general-search", "collection-report"]);
});
