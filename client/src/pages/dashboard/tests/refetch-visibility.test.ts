import assert from "node:assert/strict";
import test from "node:test";
import { resolveVisibleDashboardRefetchInterval } from "@/pages/dashboard/refetch-visibility";

test("resolveVisibleDashboardRefetchInterval pauses dashboard polling in hidden tabs", () => {
  assert.equal(resolveVisibleDashboardRefetchInterval(30_000, "hidden"), false);
  assert.equal(resolveVisibleDashboardRefetchInterval(30_000, "visible"), 30_000);
  assert.equal(resolveVisibleDashboardRefetchInterval(60_000, "prerender"), 60_000);
  assert.equal(resolveVisibleDashboardRefetchInterval(60_000, "unknown"), 60_000);
});
