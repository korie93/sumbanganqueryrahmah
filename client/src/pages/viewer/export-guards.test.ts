import assert from "node:assert/strict";
import test from "node:test";
import { resolveViewerExportBlockReason } from "@/pages/viewer/export-guards";

test("resolveViewerExportBlockReason blocks empty exports", () => {
  assert.equal(
    resolveViewerExportBlockReason({
      totalRows: 0,
      filteredRowsLength: 0,
      selectedRowsLength: 0,
      exportingExcel: false,
      exportingPdf: false,
    }),
    "no_data",
  );
});

test("resolveViewerExportBlockReason blocks concurrent viewer exports", () => {
  assert.equal(
    resolveViewerExportBlockReason({
      totalRows: 10,
      filteredRowsLength: 10,
      selectedRowsLength: 0,
      exportingExcel: true,
      exportingPdf: false,
    }),
    "busy",
  );
  assert.equal(
    resolveViewerExportBlockReason({
      totalRows: 10,
      filteredRowsLength: 10,
      selectedRowsLength: 0,
      exportingExcel: false,
      exportingPdf: true,
    }),
    "busy",
  );
});

test("resolveViewerExportBlockReason allows viewer export when data is ready", () => {
  assert.equal(
    resolveViewerExportBlockReason({
      totalRows: 10,
      filteredRowsLength: 10,
      selectedRowsLength: 0,
      exportingExcel: false,
      exportingPdf: false,
    }),
    null,
  );
});

test("resolveViewerExportBlockReason allows filtered exports when dataset exists", () => {
  assert.equal(
    resolveViewerExportBlockReason({
      totalRows: 24,
      filteredRowsLength: 0,
      selectedRowsLength: 0,
      exportFiltered: true,
      exportingExcel: false,
      exportingPdf: false,
    }),
    null,
  );
});

test("resolveViewerExportBlockReason blocks selected exports without selections", () => {
  assert.equal(
    resolveViewerExportBlockReason({
      totalRows: 24,
      filteredRowsLength: 10,
      selectedRowsLength: 0,
      exportSelected: true,
      exportingExcel: false,
      exportingPdf: false,
    }),
    "no_data",
  );
});
