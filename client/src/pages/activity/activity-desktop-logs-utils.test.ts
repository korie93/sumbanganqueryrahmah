import assert from "node:assert/strict";
import test from "node:test";
import {
  canBanActivity,
  canKickActivity,
  getActivityBrowserText,
} from "@/pages/activity/activity-desktop-logs-utils";

test("getActivityBrowserText appends version when present", () => {
  assert.equal(getActivityBrowserText({ browser: "Chrome", version: "123" }), "Chrome 123");
  assert.equal(getActivityBrowserText({ browser: "Safari", version: "" }), "Safari");
});

test("desktop activity action guards respect active state and superuser bans", () => {
  assert.equal(canKickActivity({ isActive: true }), true);
  assert.equal(canKickActivity({ isActive: false }), false);
  assert.equal(canBanActivity({ isActive: true, role: "admin" }), true);
  assert.equal(canBanActivity({ isActive: true, role: "superuser" }), false);
  assert.equal(canBanActivity({ isActive: false, role: "admin" }), false);
});
