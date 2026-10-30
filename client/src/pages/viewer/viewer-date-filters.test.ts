import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getImportFilterValidationIssue, isImportDataFilterActive } from "@shared/common/import-data-filters";
import { ViewerFilterRow } from "./ViewerFilterRow";
import { updateViewerFilterAt } from "./viewer-filter-state-utils";
import { buildViewerQueryKey } from "./viewer-retry-policy";
import { reconcileViewerColumnFilters } from "./viewer-state-utils";
import { buildViewerActiveFilterChips } from "./page-utils";
import { filterViewerRows, filterViewerServerPageRows } from "./utils";
import { loadViewerPagedExportRows } from "./viewer-export-loader";
import type { ColumnFilter } from "./types";

const noop = () => undefined;
const range: ColumnFilter = { id: "date-range", column: "Calling Date", operator: "dateBetween", value: "2026-10-01", valueTo: "2026-10-29" };
const render = (filter: ColumnFilter) => renderToStaticMarkup(createElement(ViewerFilterRow, {
  filter, headers: ["Calling Date", "Amount"], index: 0, onRemoveFilter: noop, onUpdateFilter: noop,
}));

test("date fields use bounded native inputs with explicit date/start/end labels and shared validation", () => {
  const markup = render(range);
  for (const id of ["viewer-filter-value-0", "viewer-filter-value-to-0"]) {
    const field = markup.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
    assert.match(field, /type="date"/);
    assert.match(field, /min="0001-01-01"/);
    assert.match(field, /max="9999-12-31"/);
    assert.match(field, /aria-describedby="viewer-filter-help-0"/);
    assert.match(markup, new RegExp(`for="${id}"`));
    assert.doesNotMatch(field, /aria-invalid="true"/);
  }
  assert.match(markup, /Filter 1 start date/);
  assert.match(markup, /Filter 1 end date/);
  assert.match(markup, /Includes both dates\./);
  assert.match(markup, /day-first D\/M\/YYYY and D-M-YYYY/);
  const single = render({ ...range, operator: "dateBefore", valueTo: undefined });
  assert.match(single, /Filter 1 date/);
  assert.match(single, /Excludes the selected date\./);
  assert.doesNotMatch(single, /viewer-filter-value-to-0/);
  const invalid = render({ ...range, valueTo: "2026-09-30" });
  assert.equal((invalid.match(/aria-invalid="true"/g) ?? []).length, 2);
  assert.match(invalid, /role="status"/);
  assert.match(invalid, /Start date must be on or before end date\./);
});

test("date drafts stay inactive until canonical calendar bounds form an ordered inclusive range", () => {
  for (const filter of [
    { ...range, value: "" }, { ...range, valueTo: undefined },
    { ...range, value: "2026-02-30" }, { ...range, value: "01/10/2026" },
    { ...range, valueTo: "2026-09-30" }, { ...range, value: "2026-10-01T00:00:00Z" },
  ]) {
    assert.equal(isImportDataFilterActive(filter), false);
    assert.notEqual(getImportFilterValidationIssue(filter), null);
  }
  assert.equal(isImportDataFilterActive(range), true);
  assert.equal(isImportDataFilterActive({ ...range, valueTo: range.value }), true);
  assert.equal(getImportFilterValidationIssue({ ...range, value: "2024-02-29", valueTo: "2024-02-29" }), null);
});

test("date operators preserve date-family drafts and discard hidden or reinterpreted numeric values", () => {
  const single = updateViewerFilterAt([range], 0, "operator", "dateAfter");
  assert.equal(single[0]?.value, "2026-10-01");
  assert.equal(single[0]?.valueTo, undefined);
  const again = updateViewerFilterAt(single, 0, "operator", "dateBetween");
  assert.equal(again[0]?.value, "2026-10-01");
  assert.equal(again[0]?.valueTo, undefined);
  const updated = updateViewerFilterAt([range], 0, "valueTo", "2026-10-30");
  assert.equal(updated[0]?.valueTo, "2026-10-30");
  assert.equal(range.valueTo, "2026-10-29");
  const numeric = updateViewerFilterAt([range], 0, "operator", "between");
  assert.equal(numeric[0]?.value, "");
  assert.equal(numeric[0]?.valueTo, undefined);
  const date = updateViewerFilterAt([{ column: "Calling Date", operator: "greaterThan", value: "20261029" }], 0, "operator", "dateBefore");
  assert.equal(date[0]?.value, "");
  assert.equal(date[0]?.valueTo, undefined);
});

test("date upper bounds drive query identity, reconciliation and removable chips independently", () => {
  const changed = { ...range, valueTo: "2026-10-30" };
  const key = (filter: ColumnFilter) => buildViewerQueryKey("dates", 25, "paid", [filter], false, { column: "Amount", direction: "desc" });
  assert.notEqual(key(range), key(changed));
  assert.equal(reconcileViewerColumnFilters([range], [{ ...range }])[0], range);
  assert.equal(reconcileViewerColumnFilters([range], [changed])[0], changed);
  let removed = -1;
  const chips = buildViewerActiveFilterChips({ search: "", activeColumnFilters: [range], onClearSearch: noop, onRemoveFilter: index => { removed = index; } });
  assert.equal(chips[0]?.label, "Calling Date is between dates 2026-10-01 and 2026-10-29");
  chips[0]?.onRemove?.();
  assert.equal(removed, 0);
});

test("calendar matching handles supported imported date strings without locale guesses or blank-to-date conversion", () => {
  const rows = ["2026-10-01", "29/10/2026", "20261029", "30-10-2026", "2026-02-30", "10/29/2026", "", null, "2026-10-29T00:00:00Z", 46000, 20261029, "29/10-2026"]
    .map((cellDate, __rowId) => ({ Date: cellDate, Name: "Synthetic", __rowId }));
  const filter = { ...range, column: "Date" };
  assert.deepEqual(filterViewerRows(rows, [filter]).map(row => row.__rowId), [0, 1, 2, 10]);
  assert.deepEqual(filterViewerRows(rows, [{ ...filter, operator: "dateBefore" }]).map(row => row.__rowId), []);
  assert.deepEqual(filterViewerRows(rows, [{ ...filter, operator: "dateAfter", value: "2026-10-29" }]).map(row => row.__rowId), [3]);
  assert.equal(filterViewerServerPageRows(rows, [filter]), rows, "Typed date membership must remain authoritative on the server");
  assert.deepEqual(filterViewerServerPageRows(rows, [filter, { column: "Name", operator: "equals", value: "Other" }]), []);
});

test("date-filtered exports retain both bounds and server order across cursor batches", async () => {
  const requests: Array<{ page: number; cursor?: string | undefined; columnFilters: ColumnFilter[] }> = [];
  const result = await loadViewerPagedExportRows({ pageSize: 1, search: "paid", columnFilters: [range],
    numericSort: { column: "Amount", direction: "desc" }, signal: new AbortController().signal,
    getPage: async ({ page, cursor, columnFilters, numericSort }) => {
      requests.push({ page, cursor, columnFilters });
      assert.deepEqual(numericSort, { column: "Amount", direction: "desc" });
      return { page, pageSize: 1, rows: [{ jsonDataJsonb: { Date: page === 1 ? "2026-10-29" : "2026-10-01" } }], nextCursor: page === 1 ? "last-date-row" : null };
    },
  });
  assert.deepEqual(requests, [{ page: 1, cursor: undefined, columnFilters: [range] }, { page: 2, cursor: "last-date-row", columnFilters: [range] }]);
  assert.deepEqual(result.map(row => row.Date), ["2026-10-29", "2026-10-01"]);
});
