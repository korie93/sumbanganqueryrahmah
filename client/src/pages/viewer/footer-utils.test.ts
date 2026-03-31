import assert from "node:assert/strict";
import test from "node:test";
import {
  buildViewerFooterPageLabel,
  buildViewerFooterSummary,
} from "@/pages/viewer/footer-utils";

test("buildViewerFooterSummary includes filter and selection hints only when present", () => {
  assert.equal(
    buildViewerFooterSummary(1, 25, 100, 8, true, 3),
    "Showing 1-25 of 100 rows (8 match current page filters) (3 selected)",
  );
  assert.equal(
    buildViewerFooterSummary(26, 50, 100, 25, false, 0),
    "Showing 26-50 of 100 rows",
  );
});

test("buildViewerFooterPageLabel formats current page progress", () => {
  assert.equal(buildViewerFooterPageLabel(2, 8), "Page 2 of 8");
});
