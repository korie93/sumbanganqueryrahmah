import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildGeneralSearchInputKey,
  buildGeneralSearchPageSizeOptions,
  clampGeneralSearchResultsPageSize,
  getValidGeneralSearchFilters,
  normalizeGeneralSearchResponse,
  resolveDefaultGeneralSearchPageSize,
  resolveConfiguredSearchResultLimit,
  resolveGeneralSearchResultState,
  shouldAutomaticallyRefreshGeneralSearch,
} from "@/pages/general-search/general-search-state-utils";

test("simple search identity uses the submitted trimmed query and rejects invalid inputs", () => {
  assert.equal(buildGeneralSearchInputKey({ mode: "simple", query: "" }), null);
  assert.equal(buildGeneralSearchInputKey({ mode: "simple", query: " a " }), null);
  assert.equal(
    buildGeneralSearchInputKey({ mode: "simple", query: "  Synthetic Customer  " }),
    buildGeneralSearchInputKey({ mode: "simple", query: "Synthetic Customer" }),
  );
  assert.notEqual(
    buildGeneralSearchInputKey({ mode: "simple", query: "Synthetic Customer" }),
    buildGeneralSearchInputKey({ mode: "simple", query: "Synthetic  Customer" }),
  );
});

const validIdentityFilter = { id: "filter-one", field: "Customer Name", operator: "contains", value: "Synthetic" };

test("advanced identity ignores transient IDs and incomplete filters without changing submitted values", () => {
  const expected = buildGeneralSearchInputKey({ mode: "advanced", filters: [validIdentityFilter], logic: "AND" });
  assert.equal(buildGeneralSearchInputKey({ mode: "advanced", filters: [], logic: "AND" }), null);
  assert.equal(buildGeneralSearchInputKey({ mode: "advanced", filters: [
    { ...validIdentityFilter, id: "different-id" },
    { id: "empty", field: "", operator: "contains", value: "Synthetic" },
    { id: "blank", field: "Customer Name", operator: "contains", value: "  " },
  ], logic: "AND" }), expected);
  assert.notEqual(buildGeneralSearchInputKey({ mode: "advanced", filters: [
    { ...validIdentityFilter, value: " Synthetic " },
  ], logic: "AND" }), expected);
  assert.notEqual(buildGeneralSearchInputKey({ mode: "advanced", filters: [validIdentityFilter], logic: "OR" }), expected);
  for (const changes of [{ field: "IC Number" }, { operator: "equals" }, { value: "Different" }]) {
    assert.notEqual(buildGeneralSearchInputKey({ mode: "advanced", filters: [
      { ...validIdentityFilter, ...changes },
    ], logic: "AND" }), expected);
  }
});

test("advanced identity preserves filter order and supports operators with no value", () => {
  const emptyFilter = { id: "filter-two", field: "Phone Number", operator: "isEmpty", value: "" };
  const input = { mode: "advanced" as const, filters: [validIdentityFilter, emptyFilter], logic: "OR" as const };
  assert.equal(buildGeneralSearchInputKey(input), buildGeneralSearchInputKey({ ...input, filters: [...input.filters] }));
  assert.notEqual(buildGeneralSearchInputKey(input), buildGeneralSearchInputKey({ ...input, filters: [...input.filters].reverse() }));
  assert.notEqual(buildGeneralSearchInputKey({ mode: "advanced", filters: [emptyFilter], logic: "AND" }), null);
  assert.notEqual(
    buildGeneralSearchInputKey({ mode: "simple", query: "Synthetic" }),
    buildGeneralSearchInputKey({ mode: "advanced", filters: [validIdentityFilter], logic: "AND" }),
  );
});

const successfulEmptyInput = {
  currentInputKey: buildGeneralSearchInputKey({ mode: "simple", query: "Synthetic" }),
  successfulInputKey: buildGeneralSearchInputKey({ mode: "simple", query: "Synthetic" }),
  searched: true,
  loading: false,
  error: "",
  resultCount: 0,
  totalResults: 0,
};

test("only an accepted current successful zero result enables the premium empty state", () => {
  assert.deepEqual(resolveGeneralSearchResultState(successfulEmptyInput), {
    hasCurrentSuccessfulSearch: true, showEmptyState: true,
  });
  for (const changes of [
    { searched: false }, { loading: true }, { error: "Search failed" },
    { successfulInputKey: null }, { currentInputKey: null, successfulInputKey: null },
    { currentInputKey: buildGeneralSearchInputKey({ mode: "simple", query: "Edited keyword" }) },
    { currentInputKey: buildGeneralSearchInputKey({ mode: "advanced", filters: [validIdentityFilter], logic: "AND" }) },
  ]) {
    assert.deepEqual(resolveGeneralSearchResultState({ ...successfulEmptyInput, ...changes }), {
      hasCurrentSuccessfulSearch: false, showEmptyState: false,
    });
  }
});

test("populated results and a positive total with an empty page are not a globally empty search", () => {
  for (const counts of [
    { resultCount: 1, totalResults: 1 },
    { resultCount: 0, totalResults: 20 },
    { resultCount: 1, totalResults: 0 },
  ]) {
    assert.deepEqual(resolveGeneralSearchResultState({ ...successfulEmptyInput, ...counts }), {
      hasCurrentSuccessfulSearch: true, showEmptyState: false,
    });
  }
});

test("export feedback does not remove an accepted populated result table", () => {
  const populatedWithFeedback = {
    ...successfulEmptyInput, resultCount: 2, totalResults: 2,
    error: "Failed to export PDF: Synthetic download failure",
  };
  assert.deepEqual(resolveGeneralSearchResultState(populatedWithFeedback), {
    hasCurrentSuccessfulSearch: true, showEmptyState: false,
  });
  // A failed search is not an export error: starting the request clears the
  // accepted key before awaiting it, even if previous rows were still present.
  assert.deepEqual(resolveGeneralSearchResultState({ ...populatedWithFeedback, successfulInputKey: null }), {
    hasCurrentSuccessfulSearch: false, showEmptyState: false,
  });
  assert.deepEqual(resolveGeneralSearchResultState({ ...populatedWithFeedback, resultCount: 0, totalResults: 0 }), {
    hasCurrentSuccessfulSearch: false, showEmptyState: false,
  });
});

test("edited advanced filters and logic cannot inherit the prior accepted empty result", () => {
  const successfulInputKey = buildGeneralSearchInputKey({ mode: "advanced", filters: [validIdentityFilter], logic: "AND" });
  for (const currentInputKey of [
    buildGeneralSearchInputKey({ mode: "advanced", filters: [], logic: "AND" }),
    buildGeneralSearchInputKey({ mode: "advanced", filters: [validIdentityFilter], logic: "OR" }),
    buildGeneralSearchInputKey({ mode: "advanced", filters: [{ ...validIdentityFilter, value: "Edited" }], logic: "AND" }),
  ]) {
    assert.deepEqual(resolveGeneralSearchResultState({ ...successfulEmptyInput, currentInputKey, successfulInputKey }), {
      hasCurrentSuccessfulSearch: false, showEmptyState: false,
    });
  }
});

test("empty state identity is captured before request and published only after stale-response acceptance", () => {
  const source = readFileSync(new URL("./useGeneralSearchDataState.ts", import.meta.url), "utf8");
  const simple = source.slice(source.indexOf("const handleSimpleSearch"), source.indexOf("const handleAdvancedSearch"));
  const advanced = source.slice(source.indexOf("const handleAdvancedSearch"), source.indexOf("const previouslySearched ="));
  for (const request of [simple, advanced]) {
    const capture = request.indexOf("const requestInputKey = buildGeneralSearchInputKey");
    const fetch = request.indexOf("const response = await");
    const acceptance = request.indexOf("if (!isMountedRef.current || requestId !== searchRequestIdRef.current) return;", fetch);
    const success = request.indexOf("setSuccessfulInputKey(requestInputKey)");
    assert.ok(capture >= 0 && capture < fetch);
    assert.ok(acceptance > fetch && success > acceptance && success < request.indexOf("} catch"));
    assert.match(request, /setSuccessfulInputKey\(null\)/);
    assert.doesNotMatch(request, /deferredQuery/);
  }
  const clearQuery = source.slice(source.indexOf("const handleQueryChange"), source.indexOf("const resetSearchState"));
  const reset = source.slice(source.indexOf("const resetSearchState"), source.indexOf("const handleResultsPerPageChange"));
  for (const cancel of [clearQuery, reset]) assert.match(cancel, /setSuccessfulInputKey\(null\)/);
});

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
