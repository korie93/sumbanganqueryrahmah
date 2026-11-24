import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_OFFLINE_EXPORT_MAX_RECORDS } from "@shared/collection-offline-export";
import { emptyOfflineSelection, getOfflineSelectionTotals, readOfflineEstimateChanges, readOfflineReceiptIssue, updateOfflineSelection } from "../collection-offline-selection";

function record(id: string, amount = "0.10", receipts = 0) {
  return { id, customerName: "Pelanggan sama", amount, paymentDate: "2026-11-23",
    receiptFile: null, receiptCount: receipts, receipts: [] };
}

test("records from different queries and pages remain keyed only by their stable ID", () => {
  const first = updateOfflineSelection(emptyOfflineSelection(), { type: "select", records: [record("R001", "0.10", 1)] });
  const both = updateOfflineSelection(first, { type: "select", records: [record("R002", "0.20", 2)] });
  const repeated = updateOfflineSelection(both, { type: "select", records: [record("R001", "0.10", 1)] });
  assert.deepEqual([...repeated.items.keys()], ["R001", "R002"]);
  assert.deepEqual(getOfflineSelectionTotals(repeated.items), { cents: 30, receipts: 3 });
  assert.deepEqual([...first.items.keys()], ["R001"]);
});

test("deselecting a page and removing an individual record preserve off-page choices", () => {
  const state = updateOfflineSelection(emptyOfflineSelection(), { type: "select", records: [record("1"), record("2"), record("3")] });
  const next = updateOfflineSelection(state, { type: "remove", ids: ["3", "1", "1", "unknown"] });
  assert.deepEqual([...next.items.keys()], ["2"]);
  assert.deepEqual(getOfflineSelectionTotals(next.items), { cents: 10, receipts: 0 });
  assert.equal(updateOfflineSelection(next, { type: "clear" }).items.size, 0);
});

test("a select-page operation exceeding the shared maximum does not partially select the page", () => {
  const records = Array.from({ length: COLLECTION_OFFLINE_EXPORT_MAX_RECORDS - 1 }, (_, index) => record(String(index)));
  const almostFull = updateOfflineSelection(emptyOfflineSelection(), { type: "select", records });
  const overflow = updateOfflineSelection(almostFull, { type: "select", records: [record("new"), record("other")] });
  assert.equal(overflow.limitReached, true);
  assert.equal(overflow.items, almostFull.items);
  const full = updateOfflineSelection(overflow, { type: "select", records: [record("new"), record("0")] });
  assert.equal(full.items.size, COLLECTION_OFFLINE_EXPORT_MAX_RECORDS);
  assert.equal(full.limitReached, false);
});

test("legacy receipt metadata is counted without retaining receipt bytes or account details", () => {
  const legacy = { ...record("legacy", "1,000.45"), receiptFile: "receipt.jpeg", accountNumber: "private" };
  const selected = updateOfflineSelection(emptyOfflineSelection(), { type: "select", records: [legacy] });
  assert.deepEqual(getOfflineSelectionTotals(selected.items), { cents: 100045, receipts: 1 });
  assert.deepEqual(Object.keys(selected.items.get("legacy")!).sort(), ["cents", "date", "id", "name", "receipts"]);
});

test("undo clear restores the original order and totals once; an account reset or new selection discards undo", () => {
  const original = updateOfflineSelection(emptyOfflineSelection(), { type: "select", records: [record("3"), record("1"), record("2")] });
  const cleared = updateOfflineSelection(original, { type: "clear" });
  const restored = updateOfflineSelection(cleared, { type: "undo-clear" });
  assert.deepEqual([...restored.items.keys()], ["3", "1", "2"]);
  assert.deepEqual(getOfflineSelectionTotals(restored.items), getOfflineSelectionTotals(original.items));
  assert.equal(restored.cleared, null);
  assert.equal(updateOfflineSelection(updateOfflineSelection(cleared, { type: "reset" }), { type: "undo-clear" }).items.size, 0);
  const changed = updateOfflineSelection(cleared, { type: "select", records: [record("4")] });
  assert.deepEqual([...updateOfflineSelection(changed, { type: "undo-clear" }).items.keys()], ["4"]);
});

test("compare against the last confirmed amounts, update only on acceptance, and preserve order on repeated drift", () => {
  const original = updateOfflineSelection(emptyOfflineSelection(), { type: "select", records: [record("b", "0.29", 2), record("a")] });
  const stalePage = updateOfflineSelection(original, { type: "select", records: [record("b", "0.30", 3)] });
  assert.equal(stalePage.items.get("b")?.cents, 29);
  const changes = readOfflineEstimateChanges({ changes: [{ id: "a", cents: 10, receipts: 1 }, { id: "b", cents: 31, receipts: 2 }] }, original.items);
  assert.deepEqual(changes.map((entry) => entry.id), ["b", "a"]);
  const accepted = updateOfflineSelection(original, { type: "accept", estimates: changes });
  assert.deepEqual(getOfflineSelectionTotals(accepted.items), { cents: 41, receipts: 3 });
  assert.deepEqual(getOfflineSelectionTotals(original.items), { cents: 39, receipts: 2 });
  const next = updateOfflineSelection(accepted, { type: "accept", estimates: [{ id: "b", cents: 32, receipts: 2 }] });
  assert.deepEqual([...next.items.keys()], ["b", "a"]);
  assert.deepEqual(getOfflineSelectionTotals(next.items), { cents: 42, receipts: 3 });
  for (const changes of [[{ id: "unknown", cents: 10, receipts: 1 }], [{ id: "a", cents: -1, receipts: 1 }], [{ id: "a", cents: 0, receipts: 0.5 }]]) {
    assert.deepEqual(readOfflineEstimateChanges({ changes }, original.items), []);
  }
});

test("receipt diagnosis is limited to the selected IDs and never invents a receipt ordinal", () => {
  const { items } = updateOfflineSelection(emptyOfflineSelection(), { type: "select", records: [record("a", "1", 3)] });
  for (const receiptNumber of [null, 1, 3]) {
    const issue = { recordId: "a", receiptNumber, receiptCount: 3 };
    assert.deepEqual(readOfflineReceiptIssue(issue, items), issue);
  }
  for (const receiptNumber of [-1, 0, 4, 1.5, undefined]) {
    assert.equal(readOfflineReceiptIssue({ recordId: "a", receiptNumber, receiptCount: 3 }, items), null);
  }
  assert.equal(readOfflineReceiptIssue({ recordId: "unselected", receiptNumber: 1, receiptCount: 2 }, items), null);
});
