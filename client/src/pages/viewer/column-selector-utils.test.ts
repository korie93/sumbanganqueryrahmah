import assert from "node:assert/strict";
import test from "node:test";
import { buildViewerColumnSelectorLabel } from "@/pages/viewer/column-selector-utils";

test("buildViewerColumnSelectorLabel formats selected and total columns", () => {
  assert.equal(buildViewerColumnSelectorLabel(3, 9), "Columns (3/9)");
});
