import test from "node:test";
import assert from "node:assert/strict";

import {
  buildViewerExportFilename,
  chunkViewerPdfHeaders,
  resolveViewerPotentialIcColumns,
} from "@/pages/viewer/export-file-utils";

test("buildViewerExportFilename includes selected and filtered suffixes", () => {
  const filename = buildViewerExportFilename("April Import", "xlsx", true, true);

  assert.match(filename, /^SQR-April Import-filtered-selected-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test("resolveViewerPotentialIcColumns detects ic-like headers safely", () => {
  assert.deepEqual(resolveViewerPotentialIcColumns(["Name", "No KP", "account_number"]), ["No KP"]);
});

test("chunkViewerPdfHeaders splits wide viewer exports without dropping columns", () => {
  const headers = Array.from({ length: 13 }, (_, index) => `Column ${index + 1}`);

  assert.deepEqual(chunkViewerPdfHeaders(headers, 5), [
    ["Column 1", "Column 2", "Column 3", "Column 4", "Column 5"],
    ["Column 6", "Column 7", "Column 8", "Column 9", "Column 10"],
    ["Column 11", "Column 12", "Column 13"],
  ]);
  assert.deepEqual(chunkViewerPdfHeaders(["Only"], 0), [["Only"]]);
  assert.deepEqual(chunkViewerPdfHeaders([], 5), [[]]);
});
