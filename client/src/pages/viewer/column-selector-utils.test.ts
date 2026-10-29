import assert from "node:assert/strict";
import test from "node:test";
import { buildViewerColumnSelectorLabel, filterViewerColumnSelectorHeaders } from "@/pages/viewer/column-selector-utils";

test("buildViewerColumnSelectorLabel formats selected and total columns", () => {
  assert.equal(buildViewerColumnSelectorLabel(3, 9), "Columns (3/9)");
});

test("column search matches literal trimmed text regardless of case", () => {
  const headers = ["Customer Name", "Account Number", "Card Number", "Notes [Archive]", "A+B", "客户姓名"];
  assert.deepEqual(filterViewerColumnSelectorHeaders(headers, "  NUMBER  "), [
    { header: "Account Number", index: 1 }, { header: "Card Number", index: 2 },
  ]);
  assert.deepEqual(filterViewerColumnSelectorHeaders(headers, "[archive]"), [{ header: "Notes [Archive]", index: 3 }]);
  assert.deepEqual(filterViewerColumnSelectorHeaders(headers, "+"), [{ header: "A+B", index: 4 }]);
  assert.deepEqual(filterViewerColumnSelectorHeaders(headers, "客户"), [{ header: "客户姓名", index: 5 }]);
  assert.deepEqual(filterViewerColumnSelectorHeaders(headers, ".*"), []);
});

test("column search keeps original indexes and never mutates the selected order", () => {
  const headers = Object.freeze(["Reference", "Amount", "Account Number", "Notes"]);
  assert.deepEqual(filterViewerColumnSelectorHeaders(headers, "account"), [{ header: "Account Number", index: 2 }]);
  assert.deepEqual(filterViewerColumnSelectorHeaders(headers, "notes"), [{ header: "Notes", index: 3 }]);
  assert.deepEqual(headers, ["Reference", "Amount", "Account Number", "Notes"]);
  assert.deepEqual(filterViewerColumnSelectorHeaders(headers, "  "), headers.map((header, index) => ({ header, index })));
  assert.deepEqual(filterViewerColumnSelectorHeaders([], "account"), []);
});
