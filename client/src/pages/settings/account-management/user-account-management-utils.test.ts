import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUserAccountManagementBadgeSummary,
  getUserAccountManagementDescription,
} from "@/pages/settings/account-management/user-account-management-utils";

test("getUserAccountManagementDescription returns focused mobile copy", () => {
  assert.equal(
    getUserAccountManagementDescription(true),
    "Manage closed accounts, mail previews, and reset requests in focused sections.",
  );
});

test("getUserAccountManagementDescription returns desktop copy", () => {
  assert.equal(
    getUserAccountManagementDescription(false),
    "Organize account creation, mail previews, managed users, and pending reset requests into focused sections without crowding the main Security page.",
  );
});

test("buildUserAccountManagementBadgeSummary preserves badge order and variants", () => {
  assert.deepEqual(
    buildUserAccountManagementBadgeSummary({
      managedUserCount: 8,
      outboxCount: 3,
      pendingResetCount: 2,
    }),
    [
      { label: "Accounts", total: 8, variant: "secondary" },
      { label: "Outbox", total: 3, variant: "outline" },
      { label: "Reset Requests", total: 2, variant: "outline" },
    ],
  );
});
