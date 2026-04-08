import assert from "node:assert/strict";
import test from "node:test";
import {
  loadViewerPagedExportRows,
  resolveViewerImmediateExportRows,
} from "@/pages/viewer/viewer-export-loader";

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
