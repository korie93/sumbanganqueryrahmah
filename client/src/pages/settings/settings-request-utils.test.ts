import assert from "node:assert/strict";
import test from "node:test";
import {
  SETTINGS_EMPTY_TOTAL,
  SETTINGS_FIRST_PAGE,
  SETTINGS_MIN_TOTAL_PAGES,
  isSettingsAbortError,
  normalizeSettingsPaginationState,
  normalizeSettingsPageNumber,
  normalizeSettingsPageSize,
} from "@/pages/settings/settings-request-utils";

test("isSettingsAbortError only treats abort-shaped errors as aborts", () => {
  assert.equal(isSettingsAbortError(new DOMException("aborted", "AbortError")), true);
  assert.equal(isSettingsAbortError(new Error("boom")), false);

  const namedError = new Error("aborted");
  namedError.name = "AbortError";
  assert.equal(isSettingsAbortError(namedError), true);
});

test("normalizeSettingsPageNumber clamps invalid and fractional pages", () => {
  assert.equal(normalizeSettingsPageNumber(undefined), SETTINGS_FIRST_PAGE);
  assert.equal(normalizeSettingsPageNumber(0), SETTINGS_FIRST_PAGE);
  assert.equal(normalizeSettingsPageNumber(3.8), 3);
});

test("normalizeSettingsPageSize enforces minimum and maximum bounds", () => {
  assert.equal(normalizeSettingsPageSize(undefined, 25, 100), 25);
  assert.equal(normalizeSettingsPageSize(0, 25, 100), 1);
  assert.equal(normalizeSettingsPageSize(999, 25, 100), 100);
});

test("normalizeSettingsPaginationState falls back to query values and safe totals", () => {
  assert.deepEqual(
    normalizeSettingsPaginationState(
      {
        page: 2.7,
        pageSize: 80.4,
        total: -10,
        totalPages: 0,
      },
      {
        page: 4,
        pageSize: 50,
      },
    ),
    {
      page: 2,
      pageSize: 80,
      total: SETTINGS_EMPTY_TOTAL,
      totalPages: SETTINGS_MIN_TOTAL_PAGES,
    },
  );
});
