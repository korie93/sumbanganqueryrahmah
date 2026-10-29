import assert from "node:assert/strict";
import test from "node:test";
import {
  getViewerColumnKind,
  getViewerColumnPresentation,
  getViewerDetailFields,
  getViewerDetailHeaders,
  filterViewerDetailFields,
  isViewerDetailValueEmpty,
  getViewerRowIdentity,
  getViewerTableLayout,
} from "./viewer-column-presentation";

test("Viewer presentation distinguishes identifiers from numeric measures without inspecting values", () => {
  for (const header of ["Account Number", "Card Number", "Phone", "IC", "Reference", "Customer ID", "accountNumber"]) {
    assert.equal(getViewerColumnKind(header), "identifier", header);
    assert.equal(getViewerColumnPresentation(header).align, "left", header);
  }
  for (const header of ["Amount (RM)", "Jumlah (RM)", "Quantity", "Balance", "Percentage"]) {
    assert.equal(getViewerColumnKind(header), "numeric", header);
    assert.equal(getViewerColumnPresentation(header).align, "right", header);
  }
  assert.equal(getViewerColumnKind("Customer Name"), "name");
  assert.equal(getViewerColumnKind("Payment Date"), "date");
  assert.equal(getViewerColumnKind("Notes"), "note");
  assert.equal(getViewerColumnKind("Unfamiliar custom column"), "text");
});

test("Viewer table layout reserves the same fixed controls and per-header minimums in both densities", () => {
  const headers = ["Customer Name", "Reference", "Amount (RM)", "Payment Date", "Notes"];
  for (const density of ["comfortable", "compact"] as const) {
    const layout = getViewerTableLayout(headers, density);
    assert.equal(layout.columns.length, headers.length);
    assert.equal(layout.minWidth, 44 + 56 + 48 + layout.columns.reduce((sum, column) => sum + column.minWidth, 0));
    assert.match(layout.gridTemplateColumns, /^44px 56px /);
    assert.match(layout.gridTemplateColumns, / 48px$/);
    for (const column of layout.columns) assert.ok(layout.gridTemplateColumns.includes(`minmax(${column.minWidth}px, 1fr)`));
    assert.ok(layout.columns[0].minWidth > layout.columns[2].minWidth);
    assert.ok(layout.columns[4].minWidth > layout.columns[0].minWidth);
  }
  assert.ok(getViewerTableLayout(headers, "compact").minWidth < getViewerTableLayout(headers, "comfortable").minWidth);
  assert.equal(getViewerTableLayout([]).minWidth, 760);
});

test("Viewer record details only expose the supplied headers and preserve exact imported strings", () => {
  const row = {
    __rowId: 10,
    "Card Number": "00009007199254740993",
    Notes: "  First line\nSecond <script>example</script> line  ",
    Empty: "   ",
    Amount: "00005000.00",
    Unlisted: "Not included by guessing row keys",
  };
  const snapshot = JSON.stringify(row);
  const headers = ["Card Number", "Notes", "Empty", "Amount", "Card Number", "__rowId", ""];
  assert.deepEqual(getViewerDetailHeaders(headers), ["Card Number", "Notes", "Empty", "Amount"]);
  assert.deepEqual(getViewerDetailFields(row, headers), [
    { header: "Card Number", value: "00009007199254740993" },
    { header: "Notes", value: "  First line\nSecond <script>example</script> line  " },
    { header: "Empty", value: "-" },
    { header: "Amount", value: "00005000.00" },
  ]);
  assert.equal(JSON.stringify(row), snapshot);
});

test("Viewer mobile identity follows visible names and falls back safely without inferring hidden fields", () => {
  const row = { __rowId: 4, "Customer Name": "Synthetic Customer", "Account Number": "00000123", "Other Name": " " };
  assert.equal(getViewerRowIdentity(row, ["Account Number", "Customer Name"]), "Synthetic Customer");
  assert.equal(getViewerRowIdentity(row, ["Account Number"]), "Row 5");
  assert.equal(getViewerRowIdentity(row, ["Other Name"]), "Row 5");
});

test("Viewer detail search matches literal trimmed header names without searching values", () => {
  const fields = [
    { header: "Account Number", value: "0000123456" },
    { header: "Notes [A.*]", value: "Synthetic value only" },
    { header: "客户姓名", value: "Another synthetic value" },
  ];
  assert.deepEqual(filterViewerDetailFields(fields, "  NUMBER  "), [fields[0]]);
  assert.deepEqual(filterViewerDetailFields(fields, "[a.*]"), [fields[1]]);
  assert.deepEqual(filterViewerDetailFields(fields, "客户"), [fields[2]]);
  assert.deepEqual(filterViewerDetailFields(fields, "^Account"), []);
  assert.deepEqual(filterViewerDetailFields(fields, "value only"), []);
  assert.deepEqual(filterViewerDetailFields(fields, "0000123456"), []);
});

test("Viewer detail search retains original ordering and unchanged display values", () => {
  const fields = Object.freeze([
    Object.freeze({ header: "Second Account", value: "  000001\nSecond line  " }),
    Object.freeze({ header: "Empty", value: "-" }),
    Object.freeze({ header: "First Account", value: "000002" }),
  ]);
  const snapshot = JSON.stringify(fields);
  assert.deepEqual(filterViewerDetailFields(fields, "account"), [fields[0], fields[2]]);
  assert.deepEqual(filterViewerDetailFields(fields, "  "), fields);
  assert.deepEqual(filterViewerDetailFields([], "account"), []);
  assert.equal(JSON.stringify(fields), snapshot);
});

test("Viewer empty-field detection uses raw blank values and retains zero, false and literal dashes", () => {
  for (const value of [undefined, null, "", " \n\t ", "\u00a0", []]) {
    assert.equal(isViewerDetailValueEmpty(value), true);
  }
  for (const value of [0, false, "0", "false", "-", "—", " 00001234 ", " First\nSecond ", "null", {}]) {
    assert.equal(isViewerDetailValueEmpty(value), false);
  }
});
