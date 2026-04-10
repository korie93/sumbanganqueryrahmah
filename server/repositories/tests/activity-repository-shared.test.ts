import assert from "node:assert/strict";
import test from "node:test";
import type { UserActivity } from "../../../shared/schema-postgres";
import { computeActivityStatus } from "../activity-repository-shared";

function activity(overrides: Partial<UserActivity>): UserActivity {
  return {
    id: "activity-1",
    userId: "user-1",
    username: "demo",
    role: "user",
    pcName: null,
    browser: null,
    fingerprint: null,
    ipAddress: null,
    loginTime: new Date(),
    logoutTime: null,
    lastActivityTime: new Date(),
    isActive: true,
    logoutReason: null,
    ...overrides,
  } as UserActivity;
}

test("computeActivityStatus preserves logout reason precedence", () => {
  assert.equal(computeActivityStatus(activity({ isActive: false, logoutReason: "KICKED" })), "KICKED");
  assert.equal(computeActivityStatus(activity({ isActive: false, logoutReason: "BANNED" })), "BANNED");
  assert.equal(computeActivityStatus(activity({ isActive: false, logoutReason: null })), "LOGOUT");
});

test("computeActivityStatus marks active stale sessions idle", () => {
  const lastActivityTime = new Date(Date.now() - 6 * 60_000);
  assert.equal(computeActivityStatus(activity({ isActive: true, lastActivityTime })), "IDLE");
  assert.equal(computeActivityStatus(activity({ isActive: true, lastActivityTime: new Date() })), "ONLINE");
});

test("computeActivityStatus treats database-style timestamps without timezone as UTC", () => {
  const staleTimestamp = new Date(Date.now() - 6 * 60_000).toISOString().replace("T", " ").replace("Z", "");
  const recentTimestamp = new Date().toISOString().replace("T", " ").replace("Z", "");

  assert.equal(
    computeActivityStatus(activity({ isActive: true, lastActivityTime: staleTimestamp as unknown as Date })),
    "IDLE",
  );
  assert.equal(
    computeActivityStatus(activity({ isActive: true, lastActivityTime: recentTimestamp as unknown as Date })),
    "ONLINE",
  );
});
