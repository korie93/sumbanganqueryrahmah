import assert from "node:assert/strict";
import test from "node:test";
import {
  loadViewerPagedExportRows,
  resolveViewerImmediateExportRows,
} from "@/pages/viewer/viewer-export-loader";
import type { ViewerPageResponse } from "@/pages/viewer/page-utils";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

test("loadViewerPagedExportRows rejects a late final response after cancellation", async () => {
  const controller = new AbortController();
  let reads = 0;
  await assert.rejects(loadViewerPagedExportRows({
    pageSize: 2,
    search: "",
    columnFilters: [],
    signal: controller.signal,
    getPage: async () => {
      reads += 1;
      controller.abort();
      // A response can finish even when its transport ignores cancellation.
      return { rows: [{ jsonDataJsonb: { name: "Late row" } }], page: 1, pageSize: 2, nextCursor: null };
    },
  }), { name: "AbortError" });
  assert.equal(reads, 1);
});

test("resolveViewerImmediateExportRows prefers selected rows when requested", () => {
  const rows = [
    { __rowId: 0, name: "Alpha" },
    { __rowId: 1, name: "Beta" },
    { __rowId: 2, name: "Gamma" },
  ];

  const result = resolveViewerImmediateExportRows({
    rows,
    filteredRows: rows.slice(0, 2),
    selectedRowIds: new Set([1, 2]),
    exportSelected: true,
  });

  assert.deepEqual(result, [rows[1], rows[2]]);
});

test("resolveViewerImmediateExportRows returns filtered rows when requested", () => {
  const rows = [
    { __rowId: 0, name: "Alpha" },
    { __rowId: 1, name: "Beta" },
  ];
  const filteredRows = [rows[1]];

  const result = resolveViewerImmediateExportRows({
    rows,
    filteredRows,
    selectedRowIds: new Set<number>(),
    exportFiltered: true,
  });

  assert.deepEqual(result, filteredRows);
});

test("loadViewerPagedExportRows walks every cursor-linked page", async () => {
  const calls: Array<{ page: number; cursor?: string | undefined; search: string }> = [];

  const rows = await loadViewerPagedExportRows({
    pageSize: 2,
    search: "alpha",
    columnFilters: [],
    signal: new AbortController().signal,
    getPage: async ({ page, cursor, search }) => {
      calls.push({ page, cursor, search });

      if (page === 1) {
        return {
          rows: [
            { jsonDataJsonb: { name: "A" } },
            { jsonDataJsonb: { name: "B" } },
          ],
          page: 1,
          pageSize: 2,
          nextCursor: "cursor-2",
        };
      }

      return {
        rows: [{ jsonDataJsonb: { name: "C" } }],
        page: 2,
        pageSize: 2,
        nextCursor: null,
      };
    },
  });

  assert.deepEqual(calls, [
    { page: 1, cursor: undefined, search: "alpha" },
    { page: 2, cursor: "cursor-2", search: "alpha" },
  ]);
  assert.deepEqual(
    rows.map((row) => ({ id: row.__rowId, name: row.name })),
    [
      { id: 0, name: "A" },
      { id: 1, name: "B" },
      { id: 2, name: "C" },
    ],
  );
});

test("export progress advances only after each held page has actually delivered rows", async () => {
  const first = deferred<ViewerPageResponse>();
  const second = deferred<ViewerPageResponse>();
  const secondStarted = deferred<void>();
  const progress: number[] = [];
  const reads: number[] = [];
  const loading = loadViewerPagedExportRows({
    pageSize: 2,
    search: "",
    columnFilters: [],
    signal: new AbortController().signal,
    onProgress: (receivedRows) => { progress.push(receivedRows); },
    getPage: ({ page }) => {
      reads.push(page);
      if (page === 1) return first.promise;
      assert.equal(page, 2);
      secondStarted.resolve();
      return second.promise;
    },
  });

  assert.deepEqual(reads, [1]);
  assert.deepEqual(progress, []);
  first.resolve({
    rows: [{ jsonDataJsonb: { name: "A" } }, { jsonDataJsonb: { name: "B" } }],
    page: 1, pageSize: 2, nextCursor: "page-two",
  });
  await secondStarted.promise;
  assert.deepEqual(reads, [1, 2]);
  assert.deepEqual(progress, [2]);

  second.resolve({ rows: [{ jsonDataJsonb: { name: "C" } }], page: 2, pageSize: 2, nextCursor: null });
  const rows = await loading;
  assert.deepEqual(rows.map((row) => row.name), ["A", "B", "C"]);
  assert.deepEqual(progress, [2, 3]);
});

test("an aborted pending page cannot advance progress or request another cursor", async () => {
  const controller = new AbortController();
  const latePage = deferred<ViewerPageResponse>();
  const secondStarted = deferred<void>();
  const progress: number[] = [];
  let reads = 0;
  const loading = loadViewerPagedExportRows({
    pageSize: 2,
    search: "",
    columnFilters: [],
    signal: controller.signal,
    onProgress: (receivedRows) => { progress.push(receivedRows); },
    getPage: async ({ page }) => {
      reads += 1;
      if (page === 1) return {
        rows: [{ jsonDataJsonb: { name: "A" } }, { jsonDataJsonb: { name: "B" } }],
        page: 1, pageSize: 2, nextCursor: "page-two",
      };
      assert.equal(page, 2);
      secondStarted.resolve();
      return latePage.promise;
    },
  });
  await secondStarted.promise;
  assert.deepEqual(progress, [2]);
  controller.abort();
  const rejected = assert.rejects(loading, { name: "AbortError" });
  // Simulate a transport that delivers a response despite cancellation.
  latePage.resolve({
    rows: [{ jsonDataJsonb: { name: "Too late" } }], page: 2, pageSize: 2, nextCursor: "page-three",
  });
  await rejected;
  assert.deepEqual(progress, [2]);
  assert.equal(reads, 2);
});

test("an empty page finishes without announcing records that were not received", async () => {
  for (const withFirstPage of [false, true]) {
    const progress: number[] = [];
    let reads = 0;
    const rows = await loadViewerPagedExportRows({
      pageSize: 2,
      search: "",
      columnFilters: [],
      signal: new AbortController().signal,
      onProgress: (receivedRows) => { progress.push(receivedRows); },
      getPage: async ({ page }) => {
        reads += 1;
        if (withFirstPage && page === 1) return {
          rows: [{ jsonDataJsonb: { name: "A" } }], page: 1, pageSize: 2, nextCursor: "page-two",
        };
        return { rows: [], page, pageSize: 2, nextCursor: "must-not-be-read" };
      },
    });
    assert.equal(rows.length, withFirstPage ? 1 : 0);
    assert.deepEqual(progress, withFirstPage ? [1] : []);
    assert.equal(reads, withFirstPage ? 2 : 1);
  }
});

test("a failed later page preserves the last actual count and stops reading", async () => {
  const failure = new Error("Synthetic export read failure");
  const progress: number[] = [];
  let reads = 0;
  await assert.rejects(loadViewerPagedExportRows({
    pageSize: 2,
    search: "",
    columnFilters: [],
    signal: new AbortController().signal,
    onProgress: (receivedRows) => { progress.push(receivedRows); },
    getPage: async ({ page }) => {
      reads += 1;
      if (page === 1) return {
        rows: [{ jsonDataJsonb: { name: "A" } }, { jsonDataJsonb: { name: "B" } }],
        page: 1, pageSize: 2, nextCursor: "page-two",
      };
      throw failure;
    },
  }), failure);
  assert.deepEqual(progress, [2]);
  assert.equal(reads, 2);
});

test("cancellation from an accepted-page callback rejects both cursor and final pages", async () => {
  for (const nextCursor of ["page-two", null]) {
    const controller = new AbortController();
    const progress: number[] = [];
    let reads = 0;
    await assert.rejects(loadViewerPagedExportRows({
      pageSize: 2,
      search: "",
      columnFilters: [],
      signal: controller.signal,
      onProgress: (receivedRows) => {
        progress.push(receivedRows);
        controller.abort();
      },
      getPage: async () => {
        reads += 1;
        return {
          rows: [{ jsonDataJsonb: { name: "A" } }], page: 1, pageSize: 2, nextCursor,
        };
      },
    }), { name: "AbortError" });
    assert.deepEqual(progress, [1]);
    assert.equal(reads, 1);
  }
});
