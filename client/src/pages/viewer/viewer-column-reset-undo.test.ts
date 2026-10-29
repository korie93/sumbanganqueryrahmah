import assert from "node:assert/strict";
import test from "node:test";
import {
  createViewerColumnResetUndo,
  restoreViewerColumnResetUndo,
  type ViewerColumnResetUndoSnapshot,
} from "./viewer-column-reset-undo";

test("Viewer reset undo restores sparse visibility, order and a visible pinned field", () => {
  const headers = ["Name", "Account", "Amount", "Notes"];
  const snapshot = createViewerColumnResetUndo(
    headers,
    ["Notes", "Amount", "Account", "Name"],
    new Set(["Account", "Notes"]),
    "Account",
  );
  const expected = {
    order: ["Notes", "Amount", "Account", "Name"],
    visible: ["Notes", "Account"],
    pinnedColumn: "Account",
  };

  assert.deepEqual(snapshot, expected);
  assert.ok(snapshot);
  assert.deepEqual(restoreViewerColumnResetUndo(snapshot, headers), expected);
});

test("Viewer reset undo captures a pin or reordered full layout without hidden fields", () => {
  const headers = ["Name", "Amount"];
  assert.deepEqual(createViewerColumnResetUndo(headers, headers, new Set(headers), "Amount"), {
    order: headers,
    visible: headers,
    pinnedColumn: "Amount",
  });
  assert.deepEqual(
    createViewerColumnResetUndo(headers, ["Amount", "Name"], new Set(headers), undefined),
    { order: ["Amount", "Name"], visible: ["Amount", "Name"], pinnedColumn: null },
  );
});

test("Viewer reset undo does not capture the default layout or an empty dataset", () => {
  const headers = ["Name", "Amount"];
  for (const pin of [null, undefined]) {
    assert.equal(createViewerColumnResetUndo(headers, headers, new Set(["Amount", "Name"]), pin), null);
  }
  assert.equal(createViewerColumnResetUndo([], [], new Set(), null), null);
  assert.equal(restoreViewerColumnResetUndo({ order: [], visible: [], pinnedColumn: null }, []), null);
});

test("Viewer reset undo captures independent arrays before caller state changes", () => {
  const headers = ["Name", "Amount", "Notes"];
  const order = ["Notes", "Amount", "Name"];
  const selected = new Set(["Amount", "Notes"]);
  const snapshot = createViewerColumnResetUndo(headers, order, selected, "Amount");
  assert.ok(snapshot);

  headers[0] = "Changed header";
  order[0] = "Changed order";
  selected.clear();
  assert.deepEqual(snapshot, {
    order: ["Notes", "Amount", "Name"],
    visible: ["Notes", "Amount"],
    pinnedColumn: "Amount",
  });
  assert.notEqual(snapshot.order, order);
  assert.notEqual(snapshot.visible, snapshot.order);
});

test("Viewer reset undo restore clones both arrays without mutating its snapshot", () => {
  const snapshot: ViewerColumnResetUndoSnapshot = {
    order: ["Amount", "Name"],
    visible: ["Amount"],
    pinnedColumn: "Amount",
  };
  const headers = Object.freeze(["Name", "Amount"]);
  const restored = restoreViewerColumnResetUndo(snapshot, headers);
  assert.ok(restored);
  assert.notEqual(restored, snapshot);
  assert.notEqual(restored.order, snapshot.order);
  assert.notEqual(restored.visible, snapshot.visible);

  restored.order.reverse();
  restored.visible.push("Name");
  assert.deepEqual(snapshot, {
    order: ["Amount", "Name"],
    visible: ["Amount"],
    pinnedColumn: "Amount",
  });
  snapshot.order[0] = "Changed";
  snapshot.visible[0] = "Changed";
  assert.deepEqual(restored, {
    order: ["Name", "Amount"],
    visible: ["Amount", "Name"],
    pinnedColumn: "Amount",
  });
});

test("Viewer reset undo capture rejects incomplete, unknown and duplicate header layouts", () => {
  const headers = ["Name", "Amount"];
  for (const order of [["Name"], ["Name", "Unknown"], ["Name", "Name"], ["Name", "Amount", "Notes"]]) {
    assert.equal(createViewerColumnResetUndo(headers, order, new Set(["Name"]), null), null);
  }
  assert.equal(createViewerColumnResetUndo(["Name", "Name"], ["Name", "Name"], new Set(["Name"]), null), null);
  assert.equal(createViewerColumnResetUndo(headers, headers, new Set(["Name", "Unknown"]), null), null);
  assert.equal(createViewerColumnResetUndo(headers, headers, new Set(), null), null);
});

test("Viewer reset undo restore rejects added, removed, renamed and duplicate dataset fields", () => {
  const snapshot: ViewerColumnResetUndoSnapshot = {
    order: ["Amount", "Name"],
    visible: ["Amount"],
    pinnedColumn: "Amount",
  };
  for (const headers of [["Name", "Amount", "Notes"], ["Amount"], ["name", "Amount"], ["Name", "Name"]]) {
    assert.equal(restoreViewerColumnResetUndo(snapshot, headers), null);
  }
  assert.deepEqual(restoreViewerColumnResetUndo(snapshot, ["Amount", "Name"]), snapshot);
});

test("Viewer reset undo restore rejects invalid full order and visible membership", () => {
  const headers = ["Name", "Amount"];
  const snapshot: ViewerColumnResetUndoSnapshot = { order: headers, visible: ["Name"], pinnedColumn: null };
  for (const order of [["Name"], ["Name", "Unknown"], ["Name", "Name"], ["Name", "Amount", "Notes"]]) {
    assert.equal(restoreViewerColumnResetUndo({ ...snapshot, order }, headers), null);
  }
  for (const visible of [[], ["Unknown"], ["Name", "Name"], ["Name", "Unknown"]]) {
    assert.equal(restoreViewerColumnResetUndo({ ...snapshot, visible }, headers), null);
  }
});

test("Viewer reset undo rejects hidden, unknown and reserved pins instead of losing the pin", () => {
  const headers = ["Name", "Amount", "", " ", "__rowId"];
  for (const pinnedColumn of ["Amount", "Unknown", "name", "", " ", "__rowId"]) {
    assert.equal(createViewerColumnResetUndo(headers, headers, new Set(["Name"]), pinnedColumn), null);
    assert.equal(restoreViewerColumnResetUndo({ order: headers, visible: ["Name"], pinnedColumn }, headers), null);
  }
  for (const pinnedColumn of ["", " ", "__rowId"]) {
    assert.equal(createViewerColumnResetUndo(headers, headers, new Set(headers), pinnedColumn), null);
  }
});

test("Viewer reset undo preserves exact literal, whitespace and Unicode header names", () => {
  const headers = Object.freeze([" Customer Name ", "客户姓名", "__proto__", "", "é", "e\u0301"]);
  const order = Object.freeze(["e\u0301", "", "__proto__", "客户姓名", "é", " Customer Name "]);
  const selected = new Set([" Customer Name ", "客户姓名", "__proto__", "", "é", "e\u0301"]);
  const snapshot = createViewerColumnResetUndo(headers, order, selected, " Customer Name ");
  assert.ok(snapshot);
  assert.deepEqual(snapshot.order, order);
  assert.deepEqual(snapshot.visible, order);
  assert.equal(snapshot.pinnedColumn, " Customer Name ");
  assert.deepEqual(restoreViewerColumnResetUndo(snapshot, headers), snapshot);
  assert.deepEqual(headers, [" Customer Name ", "客户姓名", "__proto__", "", "é", "e\u0301"]);
  assert.deepEqual(order, ["e\u0301", "", "__proto__", "客户姓名", "é", " Customer Name "]);
});
