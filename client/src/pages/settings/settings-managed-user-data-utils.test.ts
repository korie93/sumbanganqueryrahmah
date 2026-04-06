import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeManagedUsersQuery,
  normalizePendingResetRequestsQuery,
} from "@/pages/settings/settings-managed-user-data-utils";

test("normalizeManagedUsersQuery clamps invalid pagination and trims search", () => {
  assert.deepEqual(
    normalizeManagedUsersQuery({
      page: 0,
      pageSize: 999,
      search: "  admin  ",
      role: "admin",
      status: "locked",
    }),
    {
      page: 1,
      pageSize: 100,
      search: "admin",
      role: "admin",
      status: "locked",
    },
  );
});

test("normalizeManagedUsersQuery falls back to supported role and status values", () => {
  assert.deepEqual(
    normalizeManagedUsersQuery({
      role: "superuser" as never,
      status: "archived" as never,
    }),
    {
      page: 1,
      pageSize: 50,
      search: "",
      role: "all",
      status: "all",
    },
  );
});

test("normalizePendingResetRequestsQuery clamps pagination and trims search", () => {
  assert.deepEqual(
    normalizePendingResetRequestsQuery({
      page: 4.8,
      pageSize: 0,
      search: "  reset  ",
      status: "pending_activation",
    }),
    {
      page: 4,
      pageSize: 1,
      search: "reset",
      status: "pending_activation",
    },
  );
});

test("normalizePendingResetRequestsQuery falls back to all for unsupported status", () => {
  assert.deepEqual(
    normalizePendingResetRequestsQuery({
      status: "archived" as never,
    }),
    {
      page: 1,
      pageSize: 50,
      search: "",
      status: "all",
    },
  );
});
