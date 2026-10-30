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
  reconcileViewerColumnFilters,
  resolveViewerFilterRowIndex,
  toggleViewerColumnSelection,
  toggleViewerRowSelection,
} from "@/pages/viewer/viewer-state-utils";
import type { ColumnFilter } from "@/pages/viewer/types";
import { buildViewerQueryKey } from "@/pages/viewer/viewer-retry-policy";
import type { ImportDataNumericSort } from "@shared/common/import-data-sort";

test("getViewerActiveColumnFilters ignores incomplete filters", () => {
  const result = getViewerActiveColumnFilters([
    { column: "name", operator: "contains", value: "ali" },
    { column: " ", operator: "equals", value: "x" },
    { column: "ic", operator: "equals", value: " " },
  ]);

  assert.deepEqual(result, [{ column: "name", operator: "contains", value: "ali" }]);
});

test("filter debounce retains query identity for initial empty and UI-only changes", () => {
  const initial: ColumnFilter[] = [];
  assert.equal(reconcileViewerColumnFilters(initial, []), initial);
  assert.equal(reconcileViewerColumnFilters(initial, getViewerActiveColumnFilters([
    { id: "new-ui-filter", column: "name", operator: "contains", value: "" },
  ])), initial);

  const previous: ColumnFilter[] = [{ id: "old-ui-filter", column: "name", operator: "contains", value: "Ali" }];
  const recreated: ColumnFilter[] = [{ id: "new-ui-filter", column: "name", operator: "contains", value: "Ali" }];
  assert.equal(reconcileViewerColumnFilters(previous, recreated), previous);
});

test("numeric filters activate only with complete valid bounds and include zero", () => {
  const greater: ColumnFilter = { column: "Amount", operator: "greaterThan", value: "0" };
  const range: ColumnFilter = { column: "Amount", operator: "between", value: "-5", valueTo: "0" };
  const filters: ColumnFilter[] = [
    greater, range,
    { column: "Amount", operator: "between", value: "5" },
    { column: "Amount", operator: "between", value: "5", valueTo: "" },
    { column: "Amount", operator: "between", value: "5", valueTo: "4" },
    { column: "Amount", operator: "lessThan", value: "NaN" },
    { column: "Amount", operator: "greaterThan", value: "1,00" },
  ];
  assert.deepEqual(getViewerActiveColumnFilters(filters), [greater, range]);
});

test("range upper bounds invalidate debounce identity while inactive upper fields do not", () => {
  const range: ColumnFilter[] = [{ column: "Amount", operator: "between", value: "10", valueTo: "20" }];
  const changed = [{ ...range[0]!, valueTo: "30" }];
  assert.equal(reconcileViewerColumnFilters(range, changed), changed);
  assert.equal(reconcileViewerColumnFilters(range, [{ ...range[0]!, id: "recreated" }]), range);
  const text: ColumnFilter[] = [{ column: "Customer", operator: "contains", value: "Ali" }];
  assert.equal(reconcileViewerColumnFilters(text, [{ ...text[0]!, valueTo: "ignored" }]), text);
});

test("active chip removal resolves the matching row after incomplete numeric filters", () => {
  const filters: ColumnFilter[] = [
    { id: "partial", column: "Amount", operator: "between", value: "10", valueTo: "" },
    { id: "active", column: "Customer", operator: "contains", value: "Ali" },
  ];
  const active = getViewerActiveColumnFilters(filters);
  assert.equal(active.length, 1);
  assert.equal(resolveViewerFilterRowIndex(filters, active[0]!), 1);
  assert.equal(resolveViewerFilterRowIndex(filters, { ...active[0]! }), 1);
  assert.equal(resolveViewerFilterRowIndex(filters, { ...active[0]!, id: "removed" }), -1);
  const withoutId: ColumnFilter = { column: "Amount", operator: "lessThan", value: "10" };
  assert.equal(resolveViewerFilterRowIndex([withoutId], withoutId), 0);
});

test("filter debounce publishes every effective query change", () => {
  const previous: ColumnFilter[] = [{ column: "name", operator: "contains", value: "Ali" }];
  for (const next of [
    [],
    [{ column: "account", operator: "contains", value: "Ali" }],
    [{ column: "name", operator: "equals", value: "Ali" }],
    [{ column: "name", operator: "contains", value: "Abu" }],
    [...previous, { column: "status", operator: "equals", value: "active" }],
  ] satisfies ColumnFilter[][]) {
    assert.equal(reconcileViewerColumnFilters(previous, next), next);
  }
  const ordered: ColumnFilter[] = [
    { column: "name", operator: "contains", value: "Ali" },
    { column: "status", operator: "equals", value: "active" },
  ];
  const reordered = [...ordered].reverse();
  assert.equal(reconcileViewerColumnFilters(ordered, reordered), reordered);
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

test("changing import drops a previous preset query and cursor without losing the global search handoff", () => {
  const filters: ColumnFilter[] = [{ column: "Old date", operator: "dateBetween", value: "2024-01-01", valueTo: "2024-02-29" }];
  const sort: ImportDataNumericSort = { column: "Old amount", direction: "desc" };
  const previous = { columnFilters: filters, debouncedColumnFilters: filters, numericSort: sort,
    search: "synthetic", currentPage: 2, nextCursor: "old-file-cursor", pageCursorHistory: [null, "old-file-cursor"] };
  const oldKey = buildViewerQueryKey("old-file", 100, previous.search, previous.columnFilters, false, previous.numericSort);
  const current = { ...previous, ...createViewerImportResetState("New dataset", 100) };
  assert.deepEqual(current.columnFilters, []);
  assert.deepEqual(current.debouncedColumnFilters, []);
  assert.equal(current.numericSort, null);
  assert.equal(current.search, "synthetic");
  assert.equal(current.currentPage, 1);
  assert.equal(current.nextCursor, null);
  assert.deepEqual(current.pageCursorHistory, [null]);
  const key = buildViewerQueryKey("new-file", 100, current.search, current.columnFilters, false, current.numericSort);
  assert.notEqual(key, oldKey);
  assert.equal(key.includes("Old date"), false);
  assert.equal(key.includes("Old amount"), false);
});
