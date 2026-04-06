import assert from "node:assert/strict";
import test from "node:test";
import {
  getManagedAccountsEmptyMessage,
  normalizeManagedAccountsRoleFilter,
  normalizeManagedAccountsStatusFilter,
} from "@/pages/settings/account-management/managed-accounts-utils";

test("normalizeManagedAccountsRoleFilter keeps supported values", () => {
  assert.equal(normalizeManagedAccountsRoleFilter("admin"), "admin");
  assert.equal(normalizeManagedAccountsRoleFilter("user"), "user");
});

test("normalizeManagedAccountsRoleFilter falls back to all", () => {
  assert.equal(normalizeManagedAccountsRoleFilter("superuser"), "all");
});

test("normalizeManagedAccountsStatusFilter keeps supported values", () => {
  assert.equal(normalizeManagedAccountsStatusFilter("locked"), "locked");
  assert.equal(normalizeManagedAccountsStatusFilter("pending_activation"), "pending_activation");
});

test("normalizeManagedAccountsStatusFilter falls back to all", () => {
  assert.equal(normalizeManagedAccountsStatusFilter("archived"), "all");
});

test("getManagedAccountsEmptyMessage returns loading copy", () => {
  assert.equal(
    getManagedAccountsEmptyMessage({
      loading: true,
      total: 0,
      hasActiveFilters: false,
    }),
    "Loading users...",
  );
});

test("getManagedAccountsEmptyMessage returns default empty copy", () => {
  assert.equal(
    getManagedAccountsEmptyMessage({
      loading: false,
      total: 0,
      hasActiveFilters: false,
    }),
    "No managed accounts found.",
  );
});

test("getManagedAccountsEmptyMessage returns filtered empty copy", () => {
  assert.equal(
    getManagedAccountsEmptyMessage({
      loading: false,
      total: 0,
      hasActiveFilters: true,
    }),
    "No managed accounts match the current filters.",
  );
});
