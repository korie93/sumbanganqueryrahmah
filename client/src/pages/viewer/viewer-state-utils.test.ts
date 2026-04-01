import assert from "node:assert/strict";
import test from "node:test";
import {
  createViewerClearedState,
  createViewerImportResetState,
  createViewerPaginationResetState,
  createViewerSearchTooShortState,
  deselectViewerColumns,
  getViewerActiveColumnFilters,
  getViewerGridTemplateColumns,
  getViewerPageMetrics,
  getViewerSelectAllFilteredRowIds,
  getViewerVirtualTableMinWidth,
  getViewerVisibleHeaders,
  pruneViewerSelectedRowIds,
  toggleViewerColumnSelection,
  toggleViewerRowSelection,
} from "@/pages/viewer/viewer-state-utils";

test("getViewerActiveColumnFilters ignores incomplete filters", () => {
  const result = getViewerActiveColumnFilters([
    { column: "name", operator: "contains", value: "ali" },
    { column: " ", operator: "equals", value: "x" },
    { column: "ic", operator: "equals", value: " " },
  ]);

  assert.deepEqual(result, [{ column: "name", operator: "contains", value: "ali" }]);
});

test("viewer header and layout helpers derive stable presentation values", () => {
  assert.deepEqual(
    getViewerVisibleHeaders(["name", "ic", "amount"], new Set(["ic", "amount"])),
    ["ic", "amount"],
  );
  assert.equal(getViewerVirtualTableMinWidth(2), 900);
  assert.equal(getViewerGridTemplateColumns(3), "44px 56px repeat(3, minmax(180px, 1fr))");
});

test("getViewerPageMetrics computes pagination summary from current page state", () => {
  assert.deepEqual(
    getViewerPageMetrics({
      totalRows: 52,
      currentPage: 2,
      currentPageSize: 10,
      loadedRowsCount: 10,
      nextCursor: "cursor-3",
    }),
    {
      totalPages: 6,
      pageStart: 11,
      pageEnd: 20,
      hasPreviousPage: true,
      hasNextPage: true,
    },
  );
});

test("viewer selection helpers preserve immutable selection behavior", () => {
  const rows = [
    { __rowId: 1, name: "A" },
    { __rowId: 3, name: "C" },
  ];

  assert.deepEqual(Array.from(pruneViewerSelectedRowIds(new Set([1, 2, 3]), rows)), [1, 3]);
  assert.deepEqual(Array.from(toggleViewerColumnSelection(new Set(["name"]), "amount")), [
    "name",
    "amount",
  ]);
  assert.deepEqual(Array.from(deselectViewerColumns(["name", "amount"])), ["name"]);
  assert.deepEqual(Array.from(toggleViewerRowSelection(new Set([1, 2]), 2)), [1]);
  assert.deepEqual(Array.from(getViewerSelectAllFilteredRowIds(rows)), [1, 3]);
});

test("viewer reset state builders return stable defaults", () => {
  assert.deepEqual(createViewerPaginationResetState(100), {
    currentPage: 1,
    currentPageSize: 100,
    totalRows: 0,
    nextCursor: null,
    pageCursorHistory: [null],
  });

  const importReset = createViewerImportResetState("April Import", 100);
  assert.equal(importReset.importName, "April Import");
  assert.equal(importReset.emptyHint, "");
  assert.equal(importReset.isCleared, false);
  assert.deepEqual(importReset.rows, []);
  assert.deepEqual(importReset.headers, []);
  assert.equal(importReset.selectedColumns?.size, 0);

  const clearedReset = createViewerClearedState(100);
  assert.equal(clearedReset.importName, "Data Viewer");
  assert.equal(clearedReset.emptyHint, "Open file in Saved tab first to view.");
  assert.equal(clearedReset.isCleared, true);
  assert.deepEqual(clearedReset.columnFilters, []);
  assert.equal(clearedReset.search, "");

  assert.deepEqual(createViewerSearchTooShortState(100), {
    rows: [],
    totalRows: 0,
    currentPageSize: 100,
    nextCursor: null,
    pageCursorHistory: [null],
    loading: false,
    loadingMore: false,
  });
});
