import test from "node:test";
import assert from "node:assert/strict";

import {
  buildViewerExportFilename,
  resolveViewerPotentialIcColumns,
} from "@/pages/viewer/export-file-utils";

test("buildViewerExportFilename includes selected and filtered suffixes", () => {
  const filename = buildViewerExportFilename("April Import", "xlsx", true, true);

  assert.match(filename, /^SQR-April Import-filtered-selected-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test("resolveViewerPotentialIcColumns detects ic-like headers safely", () => {
  assert.deepEqual(resolveViewerPotentialIcColumns(["Name", "No KP", "account_number"]), ["No KP"]);
});
