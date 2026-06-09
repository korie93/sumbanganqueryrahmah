import assert from "node:assert/strict";
import test from "node:test";
import {
  canMutateCollectionRecords,
  canViewAllStaffCollectionReports,
  canViewCollectionNicknameSummary,
} from "@shared/user-roles";

test("manager can view all-staff nickname summaries without collection mutation access", () => {
  assert.equal(canViewCollectionNicknameSummary("manager"), true);
  assert.equal(canViewAllStaffCollectionReports("manager"), true);
  assert.equal(canMutateCollectionRecords("manager"), false);
});

test("existing collection role capabilities remain unchanged", () => {
  assert.equal(canViewCollectionNicknameSummary("superuser"), true);
  assert.equal(canViewAllStaffCollectionReports("superuser"), true);
  assert.equal(canMutateCollectionRecords("superuser"), true);

  assert.equal(canViewCollectionNicknameSummary("admin"), true);
  assert.equal(canViewAllStaffCollectionReports("admin"), false);
  assert.equal(canMutateCollectionRecords("admin"), true);

  assert.equal(canViewCollectionNicknameSummary("user"), false);
  assert.equal(canViewAllStaffCollectionReports("user"), false);
  assert.equal(canMutateCollectionRecords("user"), true);

  assert.equal(canViewCollectionNicknameSummary("unknown"), false);
  assert.equal(canMutateCollectionRecords("unknown"), false);
});
