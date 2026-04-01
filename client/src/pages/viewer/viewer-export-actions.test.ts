import assert from "node:assert/strict";
import test from "node:test";
import { executeViewerExport } from "@/pages/viewer/viewer-export-actions";

test("executeViewerExport skips work when export is blocked", async () => {
  let called = false;

  await executeViewerExport({
    kind: "CSV",
    totalRows: 0,
    filteredRowsLength: 0,
    selectedRowsLength: 0,
    exportingExcel: false,
    exportingPdf: false,
    isAnotherExportInFlight: false,
    loadRows: async () => {
      called = true;
      return [];
    },
    performExport: () => {
      called = true;
    },
  });

  assert.equal(called, false);
});

test("executeViewerExport runs hooks and export work when allowed", async () => {
  const events: string[] = [];

  await executeViewerExport({
    kind: "PDF",
    totalRows: 10,
    filteredRowsLength: 5,
    selectedRowsLength: 0,
    exportingExcel: false,
    exportingPdf: false,
    isAnotherExportInFlight: false,
    beforeRun: () => {
      events.push("before");
    },
    afterRun: () => {
      events.push("after");
    },
    loadRows: async () => [{ __rowId: 1, name: "Alpha" }],
    performExport: async (rows) => {
      events.push(`export:${rows.length}`);
    },
  });

  assert.deepEqual(events, ["before", "export:1", "after"]);
});

test("executeViewerExport swallows abort errors and still finalizes", async () => {
  const events: string[] = [];

  await executeViewerExport({
    kind: "Excel",
    totalRows: 5,
    filteredRowsLength: 5,
    selectedRowsLength: 0,
    exportingExcel: false,
    exportingPdf: false,
    isAnotherExportInFlight: false,
    beforeRun: () => {
      events.push("before");
    },
    afterRun: () => {
      events.push("after");
    },
    loadRows: async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    },
    performExport: async () => {
      events.push("export");
    },
  });

  assert.deepEqual(events, ["before", "after"]);
});
