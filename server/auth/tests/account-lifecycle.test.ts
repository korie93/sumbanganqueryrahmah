import assert from "node:assert/strict";
import test from "node:test";
import {
  getAccountAccessBlockReason,
  isManageableUserRole,
  isValidUserRole,
  normalizeManageableUserRole,
  normalizeUserRole,
} from "../account-lifecycle";

test("manager is a valid manageable role with normal active-account access", () => {
  assert.equal(normalizeUserRole(" MANAGER "), "manager");
  assert.equal(normalizeManageableUserRole("MANAGER"), "manager");
  assert.equal(isValidUserRole("manager"), true);
  assert.equal(isManageableUserRole("manager"), true);
  assert.equal(
    getAccountAccessBlockReason({
      role: "manager",
      status: "active",
      isBanned: false,
      lockedAt: null,
    }),
    null,
  );
});
