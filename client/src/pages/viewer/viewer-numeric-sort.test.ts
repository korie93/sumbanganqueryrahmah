import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ImportDataNumericSort } from "@shared/common/import-data-sort";
import { ViewerNumericSortControl } from "./ViewerNumericSortControl";
import { buildViewerQueryKey } from "./viewer-retry-policy";
import { buildViewerActiveFilterChips } from "./page-utils";
import { loadViewerPagedExportRows } from "./viewer-export-loader";

const noop = () => undefined;

test("numeric sort identity distinguishes column, direction and default without changing legacy queries", () => {
  const key = (sort?: ImportDataNumericSort | null) => buildViewerQueryKey("import-a", 25, "", [], false, sort);
  assert.equal(key(), key(null));
  const ascending = key({ column: "Amount", direction: "asc" });
  assert.notEqual(ascending, key());
  assert.notEqual(ascending, key({ column: "Amount", direction: "desc" }));
  assert.notEqual(ascending, key({ column: 'Balance,["asc"]', direction: "asc" }));
  assert.equal(ascending, key({ column: "Amount", direction: "asc" }));
});

test("numeric sort controls have labeled keyboard selectors and explain the whole-dataset scope", () => {
  for (const sort of [null, { column: "Amount", direction: "desc" }] as const) {
    const markup = renderToStaticMarkup(createElement(ViewerNumericSortControl, {
      headers: ["Amount", "Default order"], numericSort: sort, onNumericSortChange: noop,
    }));
    assert.match(markup, /<legend[^>]*>Number order<\/legend>/);
    for (const part of ["column", "direction"]) {
      const trigger = markup.match(new RegExp(`<button[^>]*id="viewer-number-order-${part}"[^>]*>`))?.[0] ?? "";
      assert.ok(trigger, part);
      assert.match(trigger, /role="combobox"/);
      assert.ok(trigger.includes(`aria-label="Number order ${part}"`));
      assert.match(trigger, /aria-describedby="viewer-number-order-help"/);
      assert.equal(trigger.includes('disabled=""'), part === "direction" && sort === null);
    }
    assert.match(markup, /Across all matching rows\. Empty or nonnumeric values appear last\./);
  }
});

test("number-order chip can clear only ordering while keeping search and filter removal independent", () => {
  let clearedOrder = false;
  let clearedSearch = false;
  let removedFilter = -1;
  const chips = buildViewerActiveFilterChips({
    search: "Ali", activeColumnFilters: [{ column: "Amount", operator: "greaterThan", value: "0" }],
    numericSort: { column: "Amount", direction: "desc" },
    onClearSearch: () => { clearedSearch = true; },
    onRemoveFilter: index => { removedFilter = index; },
    onClearNumericSort: () => { clearedOrder = true; },
  });
  const order = chips.find(chip => chip.id === "viewer-number-order");
  assert.equal(order?.label, "Amount: largest first");
  order?.onRemove?.();
  assert.equal(clearedOrder, true);
  assert.equal(clearedSearch, false);
  assert.equal(removedFilter, -1);
  assert.equal(chips.length, 3);
});

test("all-results export preserves exact server order and forwards numeric ordering on every cursor batch", async () => {
  const numericSort: ImportDataNumericSort = { column: "Amount", direction: "desc" };
  const calls: Array<{ page: number; cursor?: string | undefined; numericSort?: ImportDataNumericSort | undefined }> = [];
  const rows = await loadViewerPagedExportRows({
    pageSize: 2, search: "", columnFilters: [], numericSort,
    signal: new AbortController().signal,
    getPage: async ({ page, cursor, numericSort: sort }) => {
      calls.push({ page, cursor, numericSort: sort });
      if (page === 1) return { rows: [{ jsonDataJsonb: { Amount: "9007199254740993.01" } }, { jsonDataJsonb: { Amount: "100" } }], page, pageSize: 2, nextCursor: "ordered-page-2" };
      if (page === 2) return { rows: [{ jsonDataJsonb: { Amount: "10" } }, { jsonDataJsonb: { Amount: "2" } }], page, pageSize: 2, nextCursor: "ordered-page-3" };
      return { rows: [{ jsonDataJsonb: { Amount: "unavailable" } }], page, pageSize: 2, nextCursor: null };
    },
  });
  assert.deepEqual(calls, [
    { page: 1, cursor: undefined, numericSort },
    { page: 2, cursor: "ordered-page-2", numericSort },
    { page: 3, cursor: "ordered-page-3", numericSort },
  ]);
  assert.deepEqual(rows.map(row => row.Amount), ["9007199254740993.01", "100", "10", "2", "unavailable"]);
});
