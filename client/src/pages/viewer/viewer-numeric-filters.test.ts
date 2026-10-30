import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewerFilterRow } from "./ViewerFilterRow";
import { filterViewerRows, filterViewerServerPageRows } from "./utils";
import type { ColumnFilter } from "./types";

const noop = () => undefined;
const render = (filter: ColumnFilter) => renderToStaticMarkup(createElement(ViewerFilterRow, {
  filter, index: 0, headers: ["Amount", "Name"], onRemoveFilter: noop, onUpdateFilter: noop,
}));

test("server numeric membership survives JSON rounding while local text filtering remains available", () => {
  const rows = [{ __rowId: 0, Amount: Number("9007199254740993"), Name: "Ali" }];
  const numeric: ColumnFilter = { column: "Amount", operator: "greaterThan", value: "9007199254740992" };
  assert.deepEqual(filterViewerRows(rows, [numeric]), []);
  assert.equal(filterViewerServerPageRows(rows, [numeric]), rows);
  assert.deepEqual(filterViewerServerPageRows(rows, [numeric, { column: "Name", operator: "equals", value: "Abu" }]), []);
});

test("numeric row filters compare actual numbers and exclude blanks or non-numeric values", () => {
  const rows = [-5, "0", "2", "10", "1,000.50", "", null, "not a number"].map((Amount, __rowId) => ({ Amount, __rowId }));
  assert.deepEqual(filterViewerRows(rows, [{ column: "Amount", operator: "greaterThan", value: "2" }]).map(row => row.__rowId), [3, 4]);
  assert.deepEqual(filterViewerRows(rows, [{ column: "Amount", operator: "lessThan", value: "2" }]).map(row => row.__rowId), [0, 1]);
  assert.deepEqual(filterViewerRows(rows, [{ column: "Amount", operator: "between", value: "0", valueTo: "10" }]).map(row => row.__rowId), [1, 2, 3]);
  assert.deepEqual(filterViewerRows(rows, [{ column: "Amount", operator: "between", value: "10", valueTo: "10" }]).map(row => row.__rowId), [3]);
});

test("numeric row filters retain precision beyond JavaScript safe integers and compose with text", () => {
  const rows = [
    { __rowId: 0, Amount: "9007199254740992.01", Name: "Ali" },
    { __rowId: 1, Amount: "9007199254740992.02", Name: "Ali" },
    { __rowId: 2, Amount: "9007199254740992.03", Name: "Abu" },
  ];
  assert.deepEqual(filterViewerRows(rows, [
    { column: "Amount", operator: "greaterThan", value: "9007199254740992.01" },
    { column: "Name", operator: "equals", value: "ali" },
  ]).map(row => row.__rowId), [1]);
  assert.deepEqual(filterViewerRows(rows, [{ column: "Amount", operator: "lessThan", value: "invalid" }]), []);
});

test("Between exposes two labeled decimal fields and an inclusive-range description", () => {
  const markup = render({ column: "Amount", operator: "between", value: "0", valueTo: "10" });
  for (const id of ["viewer-filter-value-0", "viewer-filter-value-to-0"]) {
    assert.match(markup, new RegExp(`for="${id}"`));
    const field = markup.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
    assert.match(field, /type="text"/);
    assert.match(field, /inputMode="decimal"/);
    assert.match(field, /aria-describedby="viewer-filter-help-0"/);
    assert.doesNotMatch(field, /aria-invalid="true"/);
  }
  assert.match(markup, /Filter 1 minimum value/);
  assert.match(markup, /Filter 1 maximum value/);
  assert.match(markup, /id="viewer-filter-help-0"[^>]*>Includes both limits\./);
});

test("numeric validation is described by both fields without changing text-filter input semantics", () => {
  const invalid = render({ column: "Amount", operator: "between", value: "10", valueTo: "5" });
  assert.match(invalid, /Minimum must be less than or equal to maximum\./);
  assert.match(invalid, /id="viewer-filter-help-0" role="status"/);
  assert.equal((invalid.match(/aria-invalid="true"/g) ?? []).length, 2);
  const partial = render({ column: "Amount", operator: "between", value: "10" });
  assert.match(partial, /Enter both a minimum and maximum\./);
  const text = render({ column: "Name", operator: "contains", value: "Ali" });
  assert.match(text, /type="search"/);
  assert.doesNotMatch(text, /viewer-filter-value-to-0|aria-invalid|viewer-filter-help-0/);
});
