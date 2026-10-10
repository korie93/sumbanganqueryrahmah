import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionRecord } from "@/lib/api";
import { useCollectionRecordEditSaveAction } from "../useCollectionRecordEditSaveAction";

type SaveArgs = Parameters<typeof useCollectionRecordEditSaveAction>[0];

function renderSaveAction(overrides: Partial<SaveArgs> = {}) {
  const errors: unknown[] = [];
  const effects: string[] = [];
  const record: CollectionRecord = {
    id: "synthetic-edit-guard", customerName: "Synthetic Customer",
    icNumber: "00001234", customerPhone: "0123456789", accountNumber: "00004567",
    batch: "P10", paymentDate: "2026-01-01", amount: "100.00",
    collectionStaffNickname: "Synthetic Staff", receipts: [],
    receiptFile: null, receiptTotalAmount: "0.00", receiptValidationStatus: "unverified",
    receiptValidationMessage: null, receiptCount: 0, duplicateReceiptFlag: false,
    createdByLogin: "synthetic-user",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
  let action: ReturnType<typeof useCollectionRecordEditSaveAction> | undefined;
  function Harness() {
    action = useCollectionRecordEditSaveAction({
      editingRecord: record, customerName: record.customerName, icNumber: record.icNumber,
      customerPhone: record.customerPhone, accountNumber: record.accountNumber,
      batch: record.batch, paymentDate: record.paymentDate, amount: "100.00",
      staffNickname: record.collectionStaffNickname, nicknameOptions: [],
      newReceiptFiles: [], existingReceiptDrafts: [], pendingReceiptDrafts: [], removedReceiptIds: [],
      onRefresh: async () => { effects.push("refresh"); },
      closeDialog: () => { effects.push("close"); },
      resetEditState: () => { effects.push("reset"); },
      notifyMutationError: (error) => { errors.push(error); },
      notifyMutationSuccess: () => { effects.push("success"); },
      ...overrides,
    });
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  assert.ok(action);
  return { action, errors, effects };
}

test("unchanged and formatting-equivalent edits do not invoke any mutation side effects", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("Unexpected synthetic network request"); };
  try {
    for (const overrides of [{}, { amount: "100", customerName: " Synthetic Customer " }]) {
      const { action, errors, effects } = renderSaveAction(overrides);
      assert.equal(action.changeReview.hasChanges, false);
      await action.handleSaveEdit();
      assert.deepEqual(errors, []);
      assert.deepEqual(effects, []);
    }
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("changed invalid input still reaches existing validation instead of bypassing it", async () => {
  const { action, errors, effects } = renderSaveAction({ customerName: "" });
  assert.equal(action.changeReview.hasChanges, true);
  await action.handleSaveEdit();
  assert.deepEqual(errors, [{ title: "Validation Error", description: "Customer Name is required." }]);
  assert.deepEqual(effects, []);
});

test("no selected record cannot become a saveable edit", async () => {
  const { action, errors, effects } = renderSaveAction({ editingRecord: null });
  assert.equal(action.changeReview.hasChanges, false);
  await action.handleSaveEdit();
  assert.deepEqual(errors, []);
  assert.deepEqual(effects, []);
});

test("the dialog and save guard share the review without changing version or idempotency checks", () => {
  const source = readFileSync("client/src/pages/collection-records/useCollectionRecordEditSaveAction.ts", "utf8");
  const edit = readFileSync("client/src/pages/collection-records/useCollectionRecordEdit.ts", "utf8");
  assert.match(edit, /changeReview: saveAction\.changeReview/);
  assert.match(source, /if \(!editingRecord \|\| !changeReview\.hasChanges \|\| savingEdit \|\| savingEditInFlightRef\.current\)/);
  assert.ok(source.indexOf("!changeReview.hasChanges") < source.indexOf("const validationError"));
  assert.match(source, /expectedUpdatedAt: editingRecord\.updatedAt \|\| editingRecord\.createdAt/);
  assert.match(source, /idempotencyFingerprint: editMutationIntentRef\.current\.fingerprint/);
  assert.match(source, /idempotencyKey: editMutationIntentRef\.current\.key/);
  assert.match(source, /confirmExistingReceiptRemoval\(removeReceiptIds\.length\)/);
});
