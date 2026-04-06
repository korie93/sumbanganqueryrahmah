import assert from "node:assert/strict";
import test from "node:test";
import { getPendingAccountManagementPreloadKeys } from "@/pages/settings/settings-account-management-boundary-utils";

test("getPendingAccountManagementPreloadKeys skips preloads for non-superuser", () => {
  assert.deepEqual(
    getPendingAccountManagementPreloadKeys({
      devMailOutboxLoaded: false,
      devMailOutboxLoading: false,
      isSuperuser: false,
      managedUsersLoaded: false,
      managedUsersLoading: false,
      pendingResetRequestsLoaded: false,
      pendingResetRequestsLoading: false,
    }),
    [],
  );
});

test("getPendingAccountManagementPreloadKeys only returns unloaded sections", () => {
  assert.deepEqual(
    getPendingAccountManagementPreloadKeys({
      devMailOutboxLoaded: false,
      devMailOutboxLoading: true,
      isSuperuser: true,
      managedUsersLoaded: false,
      managedUsersLoading: false,
      pendingResetRequestsLoaded: true,
      pendingResetRequestsLoading: false,
    }),
    ["managedUsers"],
  );
});

test("getPendingAccountManagementPreloadKeys returns all eligible sections", () => {
  assert.deepEqual(
    getPendingAccountManagementPreloadKeys({
      devMailOutboxLoaded: false,
      devMailOutboxLoading: false,
      isSuperuser: true,
      managedUsersLoaded: false,
      managedUsersLoading: false,
      pendingResetRequestsLoaded: false,
      pendingResetRequestsLoading: false,
    }),
    ["managedUsers", "pendingResetRequests", "devMailOutbox"],
  );
});
