import assert from "node:assert/strict";
import test from "node:test";
import {
  getToastStateForTests,
  resetToastStateForTests,
} from "@/hooks/use-toast";
import {
  executeViewerExport,
  runViewerCsvExport,
} from "@/pages/viewer/viewer-export-actions";
import { createViewerExportLifecycle } from "@/pages/viewer/viewer-export-lifecycle";

const eligibleExport = {
  totalRows: 1,
  filteredRowsLength: 1,
  selectedRowsLength: 0,
  exportingExcel: false,
  exportingPdf: false,
  isAnotherExportInFlight: false,
};
const exportRows = [{ __rowId: 1, name: "Alpha" }];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function withCsvDownload(
  run: (downloads: { clicks: number; createdUrls: string[]; revokedUrls: string[] }) => Promise<void>,
  onDownload?: () => void,
) {
  const globalObject = globalThis as typeof globalThis & {
    document?: Document;
    window?: Window & typeof globalThis;
  };
  const originalDocument = globalObject.document;
  const originalWindow = globalObject.window;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const downloads = { clicks: 0, createdUrls: [] as string[], revokedUrls: [] as string[] };

  URL.createObjectURL = ((blob: Blob) => {
    downloads.createdUrls.push(String(blob.size));
    return "blob:test";
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    downloads.revokedUrls.push(url);
  }) as typeof URL.revokeObjectURL;

  const anchor = {
    href: "",
    download: "",
    remove: () => undefined,
    style: { display: "" },
    click: () => {
      downloads.clicks += 1;
      onDownload?.();
    },
  } as HTMLAnchorElement;

  globalObject.document = {
    createElement: (tagName: string) => {
      if (tagName.toLowerCase() === "a") return anchor;
      throw new Error(`Unexpected element request: ${tagName}`);
    },
  } as Document;
  globalObject.window = {
    setTimeout: ((callback: TimerHandler) => {
      if (typeof callback === "function") callback();
      return 0;
    }) as typeof window.setTimeout,
  } as Window & typeof globalThis;

  try {
    await run(downloads);
  } finally {
    globalObject.document = originalDocument;
    globalObject.window = originalWindow;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
}

for (const blocked of [
  { name: "no data", options: { totalRows: 0, filteredRowsLength: 0 } },
  { name: "Excel is busy", options: { exportingExcel: true } },
  { name: "PDF is busy", options: { exportingPdf: true } },
  { name: "another export owns the flight", options: { isAnotherExportInFlight: true } },
]) {
  test(`executeViewerExport skips work when ${blocked.name}`, async () => {
    const events: string[] = [];

    await executeViewerExport({
      ...eligibleExport,
      ...blocked.options,
      kind: "CSV",
      beforeRun: () => { events.push("before"); },
      afterRun: () => { events.push("after"); },
      loadRows: async () => {
        events.push("load");
        return exportRows;
      },
      performExport: () => { events.push("export"); },
    });

    assert.deepEqual(events, []);
  });
}

test("executeViewerExport does not load or finalize when ownership cannot be acquired", async () => {
  const events: string[] = [];

  await executeViewerExport({
    ...eligibleExport,
    kind: "CSV",
    beforeRun: () => {
      events.push("before");
      return false;
    },
    afterRun: () => { events.push("after"); },
    loadRows: async () => {
      events.push("load");
      return exportRows;
    },
    performExport: () => { events.push("export"); },
  });

  assert.deepEqual(events, ["before"]);
});

test("executeViewerExport runs hooks and export work when allowed", async () => {
  const events: string[] = [];

  await executeViewerExport({
    ...eligibleExport,
    kind: "PDF",
    beforeRun: () => { events.push("before"); },
    afterRun: () => { events.push("after"); },
    loadRows: async () => exportRows,
    performExport: async (rows) => { events.push(`export:${rows.length}`); },
  });

  assert.deepEqual(events, ["before", "export:1", "after"]);
});

test("executeViewerExport finalizes an empty loaded result", async () => {
  const events: string[] = [];

  await executeViewerExport({
    ...eligibleExport,
    kind: "CSV",
    beforeRun: () => { events.push("before"); },
    afterRun: () => { events.push("after"); },
    loadRows: async () => [],
    performExport: () => { events.push("export"); },
  });

  assert.deepEqual(events, ["before", "after"]);
});

test("executeViewerExport ignores rows resolved after cancellation and still finalizes", async () => {
  const rows = deferred<typeof exportRows>();
  const events: string[] = [];
  let current = true;
  const exporting = executeViewerExport({
    ...eligibleExport,
    kind: "CSV",
    beforeRun: () => { events.push("before"); },
    afterRun: () => { events.push("after"); },
    shouldContinue: () => current,
    loadRows: () => rows.promise,
    performExport: () => { events.push("export"); },
  });

  current = false;
  rows.resolve(exportRows);
  await exporting;

  assert.deepEqual(events, ["before", "after"]);
});

for (const failure of [
  { name: "abort", error: new DOMException("The operation was aborted.", "AbortError") },
  { name: "failure", error: new Error("Export service unavailable") },
]) {
  test(`executeViewerExport releases a ${failure.name} and allows a successful retry`, async () => {
    const events: string[] = [];
    let busy = false;
    resetToastStateForTests();
    const options = {
      ...eligibleExport,
      kind: "CSV" as const,
      beforeRun: () => {
        assert.equal(busy, false);
        busy = true;
        events.push("before");
      },
      afterRun: () => {
        busy = false;
        events.push("after");
      },
      performExport: () => { events.push("export"); },
    };

    try {
      await executeViewerExport({
        ...options,
        loadRows: async () => { throw failure.error; },
      });
      assert.equal(busy, false);
      assert.equal(getToastStateForTests().toasts.length, failure.name === "abort" ? 0 : 1);

      await executeViewerExport({ ...options, loadRows: async () => exportRows });

      assert.equal(busy, false);
      assert.deepEqual(events, ["before", "after", "before", "export", "after"]);
    } finally {
      resetToastStateForTests();
    }
  });
}

test("runViewerCsvExport retains ownership until the download completes", async () => {
  const events: string[] = [];

  await withCsvDownload(async (downloads) => {
    await runViewerCsvExport({
      ...eligibleExport,
      headers: ["name"],
      importName: "Audit Export",
      beforeRun: () => { events.push("before"); },
      afterRun: () => { events.push("after"); },
      loadRows: async () => {
        events.push("load");
        return exportRows;
      },
    });

    assert.equal(downloads.clicks, 1);
    assert.equal(downloads.createdUrls.length, 1);
    assert.deepEqual(downloads.revokedUrls, ["blob:test"]);
  }, () => { events.push("download"); });

  assert.deepEqual(events, ["before", "load", "download", "after"]);
});

test("runViewerCsvExport does not download after cancellation while loading the export module", async () => {
  const events: string[] = [];
  let current = true;

  await withCsvDownload(async (downloads) => {
    const exporting = runViewerCsvExport({
      ...eligibleExport,
      headers: ["name"],
      importName: "Cancelled Export",
      beforeRun: () => { events.push("before"); },
      afterRun: () => { events.push("after"); },
      shouldContinue: () => current,
      loadRows: async () => {
        events.push("load");
        return exportRows;
      },
    });

    // Rows have resolved, and the CSV action has yielded at its module await.
    await Promise.resolve();
    current = false;
    await exporting;

    assert.equal(downloads.clicks, 0);
    assert.deepEqual(downloads.createdUrls, []);
    assert.deepEqual(downloads.revokedUrls, []);
  });

  assert.deepEqual(events, ["before", "load", "after"]);
});

test("a cancelled CSV completion cannot download or release its pending replacement", async () => {
  const lifecycle = createViewerExportLifecycle();
  const oldRows = deferred<typeof exportRows>();
  const replacementRows = deferred<typeof exportRows>();

  const startCsv = (rows: Promise<typeof exportRows>) => {
    let owner: ReturnType<typeof lifecycle.start> = null;
    return runViewerCsvExport({
      ...eligibleExport,
      headers: ["name"],
      importName: "Export",
      beforeRun: () => {
        owner = lifecycle.start("csv");
        return owner !== null;
      },
      afterRun: () => {
        if (owner) lifecycle.finish(owner);
      },
      shouldContinue: () => owner !== null && lifecycle.isCurrent(owner),
      loadRows: () => rows,
    });
  };

  await withCsvDownload(async (downloads) => {
    const cancelled = startCsv(oldRows.promise);
    assert.equal(lifecycle.isBusy(), true);
    lifecycle.cancel();
    const replacement = startCsv(replacementRows.promise);
    assert.equal(lifecycle.isBusy(), true);

    oldRows.resolve(exportRows);
    await cancelled;

    assert.equal(downloads.clicks, 0);
    assert.equal(lifecycle.isBusy(), true);
    assert.equal(lifecycle.start("excel"), null);

    replacementRows.resolve(exportRows);
    await replacement;

    assert.equal(downloads.clicks, 1);
    assert.equal(lifecycle.isBusy(), false);
  });
});
