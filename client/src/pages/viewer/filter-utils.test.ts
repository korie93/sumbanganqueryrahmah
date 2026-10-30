import assert from "node:assert/strict";
import test from "node:test";
import {
  buildViewerFiltersEmptyMessage,
  VIEWER_FILTER_OPERATOR_OPTIONS,
} from "@/pages/viewer/filter-utils";

test("VIEWER_FILTER_OPERATOR_OPTIONS preserves supported operator ordering", () => {
  assert.deepEqual(
    VIEWER_FILTER_OPERATOR_OPTIONS.map((option) => option.value),
    ["contains", "equals", "startsWith", "endsWith", "notEquals", "greaterThan", "lessThan", "between", "dateBefore", "dateAfter", "dateBetween"],
  );
  assert.deepEqual(VIEWER_FILTER_OPERATOR_OPTIONS.slice(5, 8).map(({ label }) => label), ["Greater than", "Less than", "Between"]);
  assert.deepEqual(VIEWER_FILTER_OPERATOR_OPTIONS.slice(-3).map(({ label }) => label), ["Before date", "After date", "Between dates"]);
});

test("buildViewerFiltersEmptyMessage returns the expected helper copy", () => {
  assert.equal(
    buildViewerFiltersEmptyMessage(),
    'No active filters. Click "Add Filter" to add one.',
  );
});
