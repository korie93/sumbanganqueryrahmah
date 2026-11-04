import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DataRowWithId, ViewerVirtualRowData } from "./types";

// Reuse the project's CSS stub for markup tests; built-browser checks own CSS/AX verification.
await import(new URL("../../../../scripts/lib/register-client-css-test-loader.mjs", import.meta.url).href);
const { ViewerVirtualizedTable } = await import("./ViewerVirtualizedTable");
const { ViewerVirtualizedRow } = await import("./ViewerVirtualizedRow");

function rowData(rows: DataRowWithId[], visibleHeaders = ["Name", "Amount"]): ViewerVirtualRowData {
  return {
    rows, visibleHeaders, density: "comfortable", selectedRowIds: new Set(),
    onToggleRowSelection() {}, onInspectRow() {},
    gridTemplateColumns: "44px 56px 180px 140px 48px",
  };
}

function renderTable(rows: DataRowWithId[], visibleHeaders = ["Name", "Amount"]) {
  const data = rowData(rows, visibleHeaders);
  return renderToStaticMarkup(createElement(ViewerVirtualizedTable, {
    filteredRows: rows, density: data.density, gridTemplateColumns: data.gridTemplateColumns,
    onToggleRowSelection: data.onToggleRowSelection, onToggleSelectAllFiltered() {},
    rowHeightPx: 48, viewportHeightPx: 240, selectedRowIds: data.selectedRowIds,
    selectAllFiltered: false, virtualRowData: data, visibleHeaders,
  }));
}

test("virtual Viewer exposes a table with exact filtered row and visible column counts", () => {
  const rows = [{ __rowId: 99, Name: "Synthetic Amina", Amount: "120.00", Hidden: "Never shown" }];
  const html = renderTable(rows);
  assert.match(html, /role="table"[^>]*aria-label="Imported dataset"[^>]*aria-rowcount="2"[^>]*aria-colcount="5"/);
  assert.equal((html.match(/role="rowgroup"/g) ?? []).length, 2);
  assert.equal((html.match(/role="columnheader"/g) ?? []).length, 5);
  assert.equal((html.match(/role="cell"/g) ?? []).length, 5);
  for (const index of [1, 2, 3, 4, 5]) {
    assert.match(html, new RegExp(`role="columnheader" aria-colindex="${index}"`));
    assert.match(html, new RegExp(`role="cell" aria-colindex="${index}"`));
  }
  assert.match(html, /aria-rowindex="1"[^>]*role="row"/);
  assert.match(html, /aria-rowindex="2"[^>]*role="row"/);
  assert.doesNotMatch(html, /role="grid"|role="group"|Never shown/);
});

test("virtual window rows report filtered positions independently of original record identifiers", () => {
  const rows: DataRowWithId[] = Array.from({ length: 138 }, (_, index) => ({ __rowId: index + 900, Name: `Synthetic ${index}` }));
  const data = rowData(rows, ["Name"]);
  data.selectedRowIds.add(rows[137].__rowId);
  const html = renderToStaticMarkup(createElement(ViewerVirtualizedRow, {
    index: 137, style: { position: "absolute", top: 137 * 48, height: 48, width: "100%" }, data,
  }));
  assert.match(html, /aria-rowindex="139"[^>]*role="row"/);
  assert.match(html, /aria-label="Select row 1038"/);
  assert.match(html, /aria-label="View details for row 1038"/);
  assert.match(html, /aria-checked="true"/);
  assert.equal((html.match(/role="cell"/g) ?? []).length, 4);
});

test("accessible table semantics retain bounded virtualization for a large filtered dataset", () => {
  const rows: DataRowWithId[] = Array.from({ length: 10000 }, (_, index) => ({ __rowId: index, Name: `Synthetic ${index}`, Amount: index }));
  const html = renderTable(rows);
  assert.match(html, /aria-rowcount="10001"/);
  const renderedRows = (html.match(/role="row"/g) ?? []).length;
  assert.ok(renderedRows > 1 && renderedRows <= 16, `expected one header plus visible/overscan rows, got ${renderedRows}`);
  assert.doesNotMatch(html, /Synthetic 9999/);
  assert.equal((html.match(/role="cell"/g) ?? []).length, (renderedRows - 1) * 5);
});

test("an empty virtual table retains its header without claiming missing data rows", () => {
  const html = renderTable([], ["Name"]);
  assert.match(html, /aria-rowcount="1"[^>]*aria-colcount="4"/);
  assert.equal((html.match(/role="row"/g) ?? []).length, 1);
  assert.equal((html.match(/role="cell"/g) ?? []).length, 0);
});
