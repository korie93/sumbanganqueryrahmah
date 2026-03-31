import test from "node:test";
import assert from "node:assert/strict";

import {
  buildViewerOverflowFieldsLabel,
  buildViewerVisibleFieldsSummary,
} from "@/pages/viewer/viewer-table-utils";

test("buildViewerVisibleFieldsSummary handles empty selection and preview caps", () => {
  assert.equal(buildViewerVisibleFieldsSummary(0), "No visible columns selected");
  assert.equal(buildViewerVisibleFieldsSummary(1), "1 field shown");
  assert.equal(buildViewerVisibleFieldsSummary(8), "4 fields shown");
});

test("buildViewerOverflowFieldsLabel formats remaining field count", () => {
  assert.equal(buildViewerOverflowFieldsLabel(1), "Show 1 more field");
  assert.equal(buildViewerOverflowFieldsLabel(3), "Show 3 more fields");
});
