import assert from "node:assert/strict";
import test from "node:test";
import { resolveViewerExportBlockReason } from "@/pages/viewer/export-guards";

test("resolveViewerExportBlockReason blocks empty exports", () => {
  assert.equal(
    resolveViewerExportBlockReason({
      rowsLength: 0,
      exportingExcel: false,
      exportingPdf: false,
    }),
    "no_data",
  );
});

test("resolveViewerExportBlockReason blocks concurrent viewer exports", () => {
  assert.equal(
    resolveViewerExportBlockReason({
      rowsLength: 10,
      exportingExcel: true,
      exportingPdf: false,
    }),
    "busy",
  );
  assert.equal(
    resolveViewerExportBlockReason({
      rowsLength: 10,
      exportingExcel: false,
      exportingPdf: true,
    }),
    "busy",
  );
});

test("resolveViewerExportBlockReason allows viewer export when data is ready", () => {
  assert.equal(
    resolveViewerExportBlockReason({
      rowsLength: 10,
      exportingExcel: false,
      exportingPdf: false,
    }),
    null,
  );
});
