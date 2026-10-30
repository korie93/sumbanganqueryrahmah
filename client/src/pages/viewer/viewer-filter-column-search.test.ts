import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewerFilterColumnPicker } from "./ViewerFilterColumnPicker";
import { findViewerFilterColumns, moveViewerFilterColumnIndex } from "./viewer-filter-column-search";

test("filter column lookup matches trimmed case-insensitive substrings in the original order", () => {
  const headers = ["Customer Name", "ACCOUNT NUMBER", "Billing Principal (OSP)", "Account Balance"];
  assert.deepEqual(findViewerFilterColumns(headers, "  AcCoUnT  "), [
    { header: "ACCOUNT NUMBER", index: 1 }, { header: "Account Balance", index: 3 },
  ]);
  assert.deepEqual(findViewerFilterColumns(headers, "principal (osp)"), [{ header: "Billing Principal (OSP)", index: 2 }]);
  assert.deepEqual(findViewerFilterColumns(headers, "missing"), []);
});

test("empty lookup preserves every exact header and stable original identity without mutation", () => {
  const headers = Object.freeze([" Name ", "Name", "NAME", "Name", "Référence", "客户名称"]);
  const expected = headers.map((header, index) => ({ header, index }));
  assert.deepEqual(findViewerFilterColumns(headers, " \t\n"), expected);
  assert.deepEqual(findViewerFilterColumns(headers, "name"), expected.slice(0, 4));
  assert.deepEqual(findViewerFilterColumns(headers, "RÉF"), [{ header: "Référence", index: 4 }]);
  assert.deepEqual(findViewerFilterColumns(headers, "客户"), [{ header: "客户名称", index: 5 }]);
  assert.deepEqual(headers, [" Name ", "Name", "NAME", "Name", "Référence", "客户名称"]);
});

test("column lookup treats query syntax literally and does not interpret HTML or regular expressions", () => {
  const headers = ["Account.*", "Amount [RM]", "<img src=x onerror=alert(1)>", "Amount"];
  assert.deepEqual(findViewerFilterColumns(headers, ".*"), [{ header: "Account.*", index: 0 }]);
  assert.deepEqual(findViewerFilterColumns(headers, "[RM]"), [{ header: "Amount [RM]", index: 1 }]);
  assert.deepEqual(findViewerFilterColumns(headers, "<img"), [{ header: headers[2]!, index: 2 }]);
  assert.deepEqual(findViewerFilterColumns([], "name"), []);
});

test("keyboard navigation wraps visible results, clamps a reduced list and ignores text-editing keys", () => {
  assert.equal(moveViewerFilterColumnIndex(0, 3, "ArrowUp"), 2);
  assert.equal(moveViewerFilterColumnIndex(2, 3, "ArrowDown"), 0);
  assert.equal(moveViewerFilterColumnIndex(7, 2, "ArrowUp"), 0);
  assert.equal(moveViewerFilterColumnIndex(1, 3, "Home"), 0);
  assert.equal(moveViewerFilterColumnIndex(0, 3, "End"), 2);
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) assert.equal(moveViewerFilterColumnIndex(0, 0, key), -1);
  for (const key of ["Enter", "Escape", "a", "ArrowLeft"]) assert.equal(moveViewerFilterColumnIndex(1, 3, key), null);
});

test("closed picker has a labeled dialog trigger with current-column description and safely rendered text", () => {
  const markup = renderToStaticMarkup(createElement(ViewerFilterColumnPicker, {
    headers: ['<script>alert("synthetic")</script>'],
    value: '<script>alert("synthetic")</script>', index: 2,
    labelledBy: "synthetic-filter-column-label", onValueChange: () => assert.fail("Rendering cannot commit a column"),
  }));
  const trigger = markup.match(/<button[^>]*>/)?.[0] ?? "";
  assert.match(trigger, /type="button"/);
  assert.match(trigger, /aria-haspopup="dialog"/);
  assert.match(trigger, /aria-expanded="false"/);
  assert.match(trigger, /aria-labelledby="synthetic-filter-column-label"/);
  assert.match(trigger, /aria-describedby="viewer-filter-column-value-2"/);
  assert.match(trigger, /data-testid="select-filter-column-2"/);
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>|<input|role="option"/);
});
