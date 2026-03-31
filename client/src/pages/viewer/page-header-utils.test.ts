import assert from "node:assert/strict";
import test from "node:test";
import {
  buildViewerFiltersButtonLabel,
  buildViewerPageHeaderDescription,
} from "@/pages/viewer/page-header-utils";

test("buildViewerPageHeaderDescription formats counts and page progress clearly", () => {
  assert.equal(
    buildViewerPageHeaderDescription(12, 2, 5, 120),
    "12 rows on page 2 of 5 (120 total) ready for inspection, filtering, and export.",
  );
  assert.equal(
    buildViewerPageHeaderDescription(1, 1, 1, 1),
    "1 row on page 1 of 1 (1 total) ready for inspection, filtering, and export.",
  );
});

test("buildViewerFiltersButtonLabel appends active filter count only when present", () => {
  assert.equal(buildViewerFiltersButtonLabel(0), "Filters");
  assert.equal(buildViewerFiltersButtonLabel(3), "Filters (3)");
});
