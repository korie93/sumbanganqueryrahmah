import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildGeneralSearchPageSizeOptions,
  clampGeneralSearchResultsPageSize,
  getValidGeneralSearchFilters,
  normalizeGeneralSearchResponse,
  resolveDefaultGeneralSearchPageSize,
  resolveConfiguredSearchResultLimit,
  shouldAutomaticallyRefreshGeneralSearch,
} from "@/pages/general-search/general-search-state-utils";

test("first explicit submit is not automatically aborted and resubmitted", () => {
  assert.equal(shouldAutomaticallyRefreshGeneralSearch(false, false), false);
  assert.equal(shouldAutomaticallyRefreshGeneralSearch(true, false), false);
});

test("later input, mode, filter and page-size refreshes remain enabled", () => {
  assert.equal(shouldAutomaticallyRefreshGeneralSearch(true, true), true);
});

test("reset or empty query disables refresh and rearms a single next submit", () => {
  let previouslySearched = false;
  const refreshes = [false, true, true, false, false, true, true].map((searched) => {
    const refresh = shouldAutomaticallyRefreshGeneralSearch(searched, previouslySearched);
    previouslySearched = searched;
    return refresh;
  });
  assert.deepEqual(refreshes, [false, false, true, false, false, false, true]);
});

test("the hook guards the first submit but preserves live refresh and cancellation cleanup", () => {
  const source = readFileSync(new URL("./useGeneralSearchDataState.ts", import.meta.url), "utf8");
  assert.match(source, /const previouslySearchedRef = useRef\(false\)/);
  assert.match(source, /const previouslySearched = previouslySearchedRef\.current;\s+previouslySearchedRef\.current = searched;/);
  assert.match(source, /if \(!shouldAutomaticallyRefreshGeneralSearch\(searched, previouslySearched\)\) return;/);
  assert.match(source, /\[advancedMode, handleAdvancedSearch, handleSimpleSearch, resultsPerPage, searched\]/);
  assert.match(source, /void handleAdvancedSearch\(1\)/);
  assert.match(source, /void handleSimpleSearch\(1\)/);
  const clearQuery = source.slice(source.indexOf("const handleQueryChange"), source.indexOf("const resetSearchState"));
  const reset = source.slice(source.indexOf("const resetSearchState"), source.indexOf("const handleResultsPerPageChange"));
  for (const cancel of [clearQuery, reset]) {
    assert.match(cancel, /searchRequestIdRef\.current \+= 1/);
    assert.match(cancel, /searchAbortControllerRef\.current\?\.abort\(\)/);
    assert.match(cancel, /setLoading\(false\)/);
    assert.match(cancel, /setSearched\(false\)/);
  }
});

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

test("resolveDefaultGeneralSearchPageSize keeps first search payloads bounded", () => {
  assert.equal(resolveDefaultGeneralSearchPageSize(5000, false), 50);
  assert.equal(resolveDefaultGeneralSearchPageSize(5000, true), 40);
  assert.equal(resolveDefaultGeneralSearchPageSize(25, false), 25);
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
      totalIsApproximate: false,
    },
  );
});

test("normalizeGeneralSearchResponse preserves lower-bound total metadata below the configured cap", () => {
  assert.deepEqual(
    normalizeGeneralSearchResponse(
      {
        rows: [{ name: "Ali" }],
        total: 51,
        totalIsApproximate: true,
      },
      200,
    ),
    {
      cappedTotal: 51,
      nextResults: [{ name: "Ali" }],
      totalIsApproximate: true,
    },
  );
});
