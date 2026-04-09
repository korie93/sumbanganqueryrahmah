import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeManagedUserListFilters,
  normalizeManagedUserRoleFilter,
  normalizeManagedUserStatusFilter,
  normalizePendingPasswordResetListFilters,
} from "../auth-managed-user-shared";

type ManagedUserListFiltersInput = NonNullable<Parameters<typeof normalizeManagedUserListFilters>[0]>;
type PendingPasswordResetListFiltersInput =
  NonNullable<Parameters<typeof normalizePendingPasswordResetListFilters>[0]>;

test("auth managed user shared normalizes role and status filters safely", () => {
  assert.equal(normalizeManagedUserRoleFilter("ADMIN"), "admin");
  assert.equal(normalizeManagedUserRoleFilter("weird"), "all");
  assert.equal(normalizeManagedUserStatusFilter("LOCKED"), "locked");
  assert.equal(normalizeManagedUserStatusFilter("unknown"), "all");
});

test("auth managed user shared trims listing filters", () => {
  assert.deepEqual(
    normalizeManagedUserListFilters({
      search: "  alice  ",
      role: " user " as unknown as ManagedUserListFiltersInput["role"],
      status: " banned " as unknown as ManagedUserListFiltersInput["status"],
    }),
    {
      search: "alice",
      role: "user",
      status: "banned",
    },
  );

  assert.deepEqual(
    normalizePendingPasswordResetListFilters({
      search: "  bob  ",
      status: " disabled " as unknown as PendingPasswordResetListFiltersInput["status"],
    }),
    {
      search: "bob",
      status: "disabled",
    },
  );
});
