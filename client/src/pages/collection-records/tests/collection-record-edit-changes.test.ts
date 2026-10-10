import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionRecord, CollectionRecordReceipt } from "@/lib/api";
import { createCollectionReceiptDraftFromReceipt } from "@/pages/collection/receipt-validation";
import { buildCollectionRecordEditChanges } from "../collection-record-edit-changes";

const receipt = {
  id: "receipt-A", originalFileName: "Synthetic receipt.png", receiptAmount: "100.00",
  receiptDate: "2026-01-01", receiptReference: "REF-001", fileHash: "synthetic-hash",
} as CollectionRecordReceipt;
const record = {
  id: "synthetic-record", customerName: "Synthetic Customer", icNumber: "00001234",
  customerPhone: "0123456789", accountNumber: "00004567", batch: "P10",
  paymentDate: "2026-01-01", amount: "100.00", collectionStaffNickname: "Synthetic Staff", receipts: [receipt],
} as CollectionRecord;
const draft = createCollectionReceiptDraftFromReceipt(receipt);
type Args = Parameters<typeof buildCollectionRecordEditChanges>[0];
function fixture(overrides: Partial<Args> = {}): Args {
  return {
    editingRecord: record, customerName: record.customerName, icNumber: record.icNumber,
    customerPhone: record.customerPhone, accountNumber: record.accountNumber, batch: record.batch,
    paymentDate: record.paymentDate, amount: record.amount, staffNickname: record.collectionStaffNickname,
    newReceiptFiles: [], existingReceiptDrafts: [draft], pendingReceiptDrafts: [], removedReceiptIds: [], ...overrides,
  };
}
const compare = (overrides: Partial<Args> = {}) => buildCollectionRecordEditChanges(fixture(overrides));

test("initial values, null record and cosmetic whitespace have no changes", () => {
  for (const args of [{}, { editingRecord: null }, { customerName: " Synthetic Customer ", icNumber: " 00001234 " }]) {
    assert.deepEqual(compare(args), { hasChanges: false, changes: [] });
  }
});

test("every editable scalar produces only its before/after row and reverting removes it", () => {
  const updates: Partial<Args>[] = [
    { customerName: "Other" }, { icNumber: "00009999" }, { customerPhone: "0199999999" },
    { accountNumber: "00009999" }, { batch: "P25" }, { paymentDate: "2026-01-02" },
    { amount: "120.50" }, { staffNickname: "Other Staff" },
  ];
  for (const update of updates) {
    const result = compare(update);
    assert.equal(result.hasChanges, true);
    assert.equal(result.changes.length, 1);
    assert.notEqual(result.changes[0].before, result.changes[0].after);
    assert.equal(compare().hasChanges, false);
  }
});

test("identifiers preserve leading zeros and names remain case-sensitive", () => {
  const result = compare({ icNumber: "1234", accountNumber: "4567", customerName: "synthetic Customer" });
  assert.equal(result.changes.length, 3);
  assert.deepEqual(result.changes.find((entry) => entry.key === "icNumber"), {
    key: "icNumber", label: "IC Number", before: "00001234", after: "1234",
  });
});

test("equivalent valid amounts compare in exact cents but invalid text is not erased", () => {
  for (const amount of ["100", "0100.0", " 100.00 ", "1,00.00"]) assert.equal(compare({ amount }).hasChanges, false);
  for (const amount of ["", "abc", "100.001", "-100", "0", "100.01", "9007199254740993"]) {
    assert.equal(compare({ amount }).hasChanges, true, amount);
  }
  assert.equal(compare({ amount: "100.01" }).changes[0].after, "RM 100.01");
  assert.equal(compare({ amount: "100.001" }).changes[0].after, "100.001");
});

test("receipt null/blank metadata compares equal, but explicit zero differs from missing", () => {
  const empty = { ...receipt, receiptAmount: null, receiptDate: null, receiptReference: null };
  const blank = createCollectionReceiptDraftFromReceipt(empty);
  const args = { editingRecord: { ...record, receipts: [empty] }, existingReceiptDrafts: [blank] };
  assert.equal(compare(args).hasChanges, false);
  assert.equal(compare({ ...args, existingReceiptDrafts: [{ ...blank, receiptAmount: "  " }] }).hasChanges, false);
  assert.equal(compare({ ...args, existingReceiptDrafts: [{ ...blank, receiptAmount: "0.00" }] }).hasChanges, true);
});

test("receipt metadata edits count and revert without local IDs, hashes or array order causing edits", () => {
  for (const patch of [{ receiptAmount: "101" }, { receiptDate: "2026-01-02" }, { receiptReference: "REF-002" }]) {
    assert.equal(compare({ existingReceiptDrafts: [{ ...draft, ...patch }] }).changes.length, 1);
  }
  assert.equal(compare({ existingReceiptDrafts: [{ ...draft, receiptAmount: "100", receiptReference: " REF-001 ", draftLocalId: "new-local-id", fileHash: null }] }).hasChanges, false);
  const other = { ...receipt, id: "receipt-B" };
  assert.equal(compare({ editingRecord: { ...record, receipts: [receipt, other] },
    existingReceiptDrafts: [createCollectionReceiptDraftFromReceipt(other), draft] }).hasChanges, false);
  assert.equal(compare({ existingReceiptDrafts: [] }).hasChanges, false);
});

test("receipt removal uses valid stable IDs, ignores removed metadata and can be undone", () => {
  const changed = { ...draft, receiptAmount: "120", receiptReference: "Changed" };
  const result = compare({ removedReceiptIds: [" receipt-A ", "receipt-A", "unknown", ""], existingReceiptDrafts: [changed] });
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].label, "Receipt dibuang");
  assert.equal(compare({ removedReceiptIds: ["unknown"] }).hasChanges, false);
  assert.equal(compare({ removedReceiptIds: [] }).hasChanges, false);
});

test("new receipt addition, metadata and same-count replacement remain real changes", () => {
  const file = { name: "Synthetic receipt.png" };
  assert.equal(compare({ newReceiptFiles: [file] }).changes.length, 1);
  const result = compare({ newReceiptFiles: [file], removedReceiptIds: [receipt.id] });
  assert.deepEqual(result.changes.map((entry) => entry.label), ["Receipt dibuang", "Receipt ditambah"]);
  assert.equal(compare({ newReceiptFiles: [file], pendingReceiptDrafts: [{ ...draft, receiptId: null }] }).changes.length, 4);
  assert.equal(compare({ pendingReceiptDrafts: [{ ...draft, receiptId: null }] }).hasChanges, false);
  assert.equal(compare().hasChanges, false);
});

test("manual settlement and server-derived statuses do not become pending record edits", () => {
  assert.equal(compare({ editingRecord: { ...record, cpStatus: "abort_cp", updatedAt: "2026-02-01T00:00:00Z" } }).hasChanges, false);
});

test("comparison does not mutate record, drafts or removal arrays", () => {
  const args = fixture({ removedReceiptIds: ["receipt-A"], newReceiptFiles: [{ name: "new.png" }] });
  const before = JSON.stringify(args);
  Object.freeze(args.removedReceiptIds);
  Object.freeze(args.existingReceiptDrafts);
  Object.freeze(args.editingRecord);
  buildCollectionRecordEditChanges(args);
  assert.equal(JSON.stringify(args), before);
});
