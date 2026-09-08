import assert from "node:assert/strict";
import test from "node:test";
import {
  getAccountAccessBlockReason,
  isManageableUserRole,
  isValidUserRole,
  isValidAccountStatus,
  normalizeAccountStatus,
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

test("terminal deleted status always denies access but is not a writable account lifecycle choice", () => {
  assert.equal(isValidAccountStatus("deleted"), false);
  assert.equal(normalizeAccountStatus("deleted", "active"), "disabled");
  for (const role of ["user", "manager", "admin", "superuser"]) {
    assert.equal(getAccountAccessBlockReason({ role, status: "deleted", isBanned: false }), "disabled");
  }
});
