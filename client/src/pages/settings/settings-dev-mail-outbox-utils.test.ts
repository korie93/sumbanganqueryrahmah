import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDevMailOutboxPagination,
  normalizeDevMailOutboxQuery,
} from "@/pages/settings/settings-dev-mail-outbox-utils";

test("normalizeDevMailOutboxQuery trims search fields and clamps page size", () => {
  assert.deepEqual(
    normalizeDevMailOutboxQuery({
      page: 0,
      pageSize: 999,
      searchEmail: "  alice@example.com ",
      searchSubject: "  Reset Password ",
      sortDirection: "asc",
    }),
    {
      page: 1,
      pageSize: 100,
      searchEmail: "alice@example.com",
      searchSubject: "Reset Password",
      sortDirection: "asc",
    },
  );
});

test("normalizeDevMailOutboxQuery falls back to safe defaults", () => {
  assert.deepEqual(
    normalizeDevMailOutboxQuery({
      page: Number.NaN,
      pageSize: Number.NaN,
      sortDirection: "invalid" as never,
    }),
    {
      page: 1,
      pageSize: 25,
      searchEmail: "",
      searchSubject: "",
      sortDirection: "desc",
    },
  );
});

test("normalizeDevMailOutboxPagination falls back to query values", () => {
  assert.deepEqual(
    normalizeDevMailOutboxPagination(undefined, {
      page: 3,
      pageSize: 50,
    }),
    {
      page: 3,
      pageSize: 50,
      total: 0,
      totalPages: 1,
    },
  );
});
