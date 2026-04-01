import assert from "node:assert/strict";
import test from "node:test";
import {
  executeViewerExport,
  runViewerCsvExport,
} from "@/pages/viewer/viewer-export-actions";

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

test("runViewerCsvExport delegates through the shared export flow", async () => {
  const globalObject = globalThis as typeof globalThis & {
    document?: Document;
    window?: Window & typeof globalThis;
  };
  const originalDocument = globalObject.document;
  const originalWindow = globalObject.window;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  let clicked = false;

  URL.createObjectURL = ((blob: Blob) => {
    createdUrls.push(String(blob.size));
    return "blob:test";
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    revokedUrls.push(url);
  }) as typeof URL.revokeObjectURL;

  const anchor = {
    href: "",
    download: "",
    click: () => {
      clicked = true;
    },
  } as HTMLAnchorElement;

  globalObject.document = {
    createElement: (tagName: string) => {
      if (tagName.toLowerCase() === "a") {
        return anchor;
      }
      throw new Error(`Unexpected element request: ${tagName}`);
    },
  } as Document;
  globalObject.window = {
    setTimeout: ((callback: TimerHandler) => {
      if (typeof callback === "function") {
        callback();
      }
      return 0;
    }) as typeof window.setTimeout,
  } as Window & typeof globalThis;

  try {
    await runViewerCsvExport({
      headers: ["name"],
      importName: "Audit Export",
      totalRows: 1,
      filteredRowsLength: 1,
      selectedRowsLength: 0,
      exportingExcel: false,
      exportingPdf: false,
      isAnotherExportInFlight: false,
      loadRows: async () => [{ __rowId: 1, name: "Alpha" }],
    });
  } finally {
    globalObject.document = originalDocument;
    globalObject.window = originalWindow;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }

  assert.equal(clicked, true);
  assert.equal(createdUrls.length, 1);
  assert.deepEqual(revokedUrls, ["blob:test"]);
});
