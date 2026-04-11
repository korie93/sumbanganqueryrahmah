import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS,
  DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS,
  resolveVisibleDashboardRefetchInterval,
} from "@/pages/dashboard/refetch-visibility";

test("resolveVisibleDashboardRefetchInterval pauses dashboard polling in hidden tabs", () => {
  assert.equal(resolveVisibleDashboardRefetchInterval(DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS, "hidden"), false);
  assert.equal(resolveVisibleDashboardRefetchInterval(DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS, "visible"), DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS);
  assert.equal(resolveVisibleDashboardRefetchInterval(DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS, "prerender"), DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS);
  assert.equal(resolveVisibleDashboardRefetchInterval(DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS, "unknown"), DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS);
});
