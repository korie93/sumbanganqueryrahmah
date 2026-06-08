import assert from "node:assert/strict";
import test from "node:test";
import { canManageDashboardLoginLogs } from "./dashboard-role-access";

test("dashboard login logs stay read-only for managers", () => {
  assert.equal(canManageDashboardLoginLogs("manager"), false);
  assert.equal(canManageDashboardLoginLogs("user"), false);
  assert.equal(canManageDashboardLoginLogs("admin"), true);
  assert.equal(canManageDashboardLoginLogs("superuser"), true);
});
