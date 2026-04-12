import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
  hasNormalizedSearchChanged,
  normalizeSearchValue,
  shouldSyncNormalizedSearch,
} from "@/pages/settings/account-management/utils";

test("normalizeSearchValue trims and lowercases filter text", () => {
  assert.equal(normalizeSearchValue("  Alice@Example.COM "), "alice@example.com");
  assert.equal(normalizeSearchValue(""), "");
});

test("ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE keeps filters anchored to the first page", () => {
  assert.equal(ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE, 1);
});

test("hasNormalizedSearchChanged compares local and query values after normalization", () => {
  assert.equal(hasNormalizedSearchChanged("  Alpha  ", "alpha"), false);
  assert.equal(hasNormalizedSearchChanged("beta", "alpha"), true);
});

test("shouldSyncNormalizedSearch only triggers when the normalized query diverges", () => {
  assert.equal(shouldSyncNormalizedSearch("alpha", "  ALPHA "), false);
  assert.equal(shouldSyncNormalizedSearch("beta", "alpha"), true);
});
