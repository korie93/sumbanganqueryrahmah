import assert from "node:assert/strict";
import test from "node:test";
import {
  getCollectionDailyScopeLabel,
  getCollectionDailyStaffScopeDescription,
} from "@/pages/collection/collection-daily-filters-card-utils";

test("collection daily filters card utils pick the correct scope label", () => {
  assert.equal(
    getCollectionDailyScopeLabel({
      canManage: true,
      currentUsername: "collector.user",
      selectedUsersLabel: "3 selected",
    }),
    "3 selected",
  );

  assert.equal(
    getCollectionDailyScopeLabel({
      canManage: false,
      currentUsername: "collector.user",
      selectedUsersLabel: "3 selected",
    }),
    "collector.user",
  );
});

test("collection daily filters card utils return scope description by role", () => {
  assert.equal(
    getCollectionDailyStaffScopeDescription(true),
    "Choose one or more staff nicknames before editing target or calendar.",
  );
  assert.equal(
    getCollectionDailyStaffScopeDescription(false),
    "Your current account is used automatically for this daily view.",
  );
});
