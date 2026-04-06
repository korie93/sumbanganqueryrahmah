import assert from "node:assert/strict";
import test from "node:test";
import {
  getLocalMailOutboxEmptyMessage,
  normalizeLocalMailOutboxSortDirection,
} from "@/pages/settings/account-management/local-mail-outbox-utils";

test("normalizeLocalMailOutboxSortDirection keeps asc", () => {
  assert.equal(normalizeLocalMailOutboxSortDirection("asc"), "asc");
});

test("normalizeLocalMailOutboxSortDirection falls back to desc", () => {
  assert.equal(normalizeLocalMailOutboxSortDirection("latest"), "desc");
});

test("getLocalMailOutboxEmptyMessage returns loading copy", () => {
  assert.equal(
    getLocalMailOutboxEmptyMessage({
      hasSearchFilter: false,
      loading: true,
      total: 0,
    }),
    "Loading local mail previews...",
  );
});

test("getLocalMailOutboxEmptyMessage returns default empty copy", () => {
  assert.equal(
    getLocalMailOutboxEmptyMessage({
      hasSearchFilter: false,
      loading: false,
      total: 0,
    }),
    "No local email previews captured yet.",
  );
});

test("getLocalMailOutboxEmptyMessage returns filtered empty copy", () => {
  assert.equal(
    getLocalMailOutboxEmptyMessage({
      hasSearchFilter: true,
      loading: false,
      total: 0,
    }),
    "No email previews match the current filters.",
  );
});
