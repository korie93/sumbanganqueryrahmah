import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGeneralSearchPageSizeOptions,
  clampGeneralSearchResultsPageSize,
  getValidGeneralSearchFilters,
  normalizeGeneralSearchResponse,
  resolveConfiguredSearchResultLimit,
} from "@/pages/general-search/general-search-state-utils";

test("resolveConfiguredSearchResultLimit clamps invalid and out-of-range inputs", () => {
  assert.equal(resolveConfiguredSearchResultLimit(undefined), 200);
  assert.equal(resolveConfiguredSearchResultLimit(2), 10);
  assert.equal(resolveConfiguredSearchResultLimit(6000), 5000);
  assert.equal(resolveConfiguredSearchResultLimit(125.9), 125);
});

test("buildGeneralSearchPageSizeOptions keeps configured limit and mode defaults sorted", () => {
  assert.deepEqual(buildGeneralSearchPageSizeOptions(120, false), [25, 50, 100, 120]);
  assert.deepEqual(buildGeneralSearchPageSizeOptions(35, true), [20, 35]);
});

test("clampGeneralSearchResultsPageSize respects configured result cap", () => {
  assert.equal(clampGeneralSearchResultsPageSize(5, 200), 10);
  assert.equal(clampGeneralSearchResultsPageSize(400, 200), 200);
  assert.equal(clampGeneralSearchResultsPageSize(undefined, 150), 150);
});

test("getValidGeneralSearchFilters ignores incomplete filters but preserves empty operators", () => {
  assert.deepEqual(
    getValidGeneralSearchFilters([
      { id: "1", field: "name", operator: "contains", value: "alice" },
      { id: "2", field: "name", operator: "contains", value: "   " },
      { id: "3", field: "city", operator: "isEmpty", value: "" },
      { id: "4", field: "", operator: "equals", value: "x" },
    ]),
    [
      { id: "1", field: "name", operator: "contains", value: "alice" },
      { id: "3", field: "city", operator: "isEmpty", value: "" },
    ],
  );
});

test("normalizeGeneralSearchResponse caps totals and falls back to rows", () => {
  assert.deepEqual(
    normalizeGeneralSearchResponse(
      {
        rows: [{ name: "Ali" }],
        total: 999,
      },
      200,
    ),
    {
      cappedTotal: 200,
      nextResults: [{ name: "Ali" }],
    },
  );
});
