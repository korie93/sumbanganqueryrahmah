import assert from "node:assert/strict";
import test from "node:test";
import { getViewerDesktopHeaders, resolveViewerPinnedColumn } from "./viewer-pinned-column";

test("Viewer pin resolves only an exact visible imported header", () => {
  const headers = ["Account Number", " Customer Name ", "客户姓名", "", "__rowId"];
  for (const column of ["Account Number", " Customer Name ", "客户姓名"]) {
    assert.equal(resolveViewerPinnedColumn(column, headers), column);
  }
  for (const column of [null, undefined, "", " ", "__rowId", "account number", "Customer Name", "Hidden"]) {
    assert.equal(resolveViewerPinnedColumn(column, headers), null);
  }
  assert.equal(resolveViewerPinnedColumn("Account Number", []), null);
});

test("Viewer desktop pin moves one visible field first without mutating the supplied order", () => {
  const headers = ["Account Number", "Customer Name", "Amount", "Notes"];
  const original = [...headers];
  Object.freeze(headers);
  const reordered = getViewerDesktopHeaders(headers, "Amount");
  assert.deepEqual(reordered, ["Amount", "Account Number", "Customer Name", "Notes"]);
  assert.notEqual(reordered, headers);
  assert.deepEqual(headers, original);
  assert.equal(reordered.length, headers.length);
});

test("Viewer absent, hidden and already-first pins keep the original header reference", () => {
  const headers = ["Account Number", "Customer Name"];
  for (const column of [null, undefined, "Hidden", "Account Number"]) {
    assert.equal(getViewerDesktopHeaders(headers, column), headers);
  }
  const empty: string[] = [];
  assert.equal(getViewerDesktopHeaders(empty, "Account Number"), empty);
});
