import assert from "node:assert/strict";
import test from "node:test";
import {
  applySaveCollectionReceiptDraftPatch,
  buildSaveCollectionDraftPersistPayload,
  buildSaveCollectionDraftRestoreState,
  createEmptySaveCollectionRestoredFormValues,
} from "@/pages/collection/save-collection-state-utils";

test("save collection state utils build an empty restored form shape", () => {
  assert.deepEqual(createEmptySaveCollectionRestoredFormValues(), {
    customerName: "",
    icNumber: "",
    customerPhone: "",
    accountNumber: "",
    batch: "P10",
    paymentDate: "",
    amount: "",
  });
});

test("save collection state utils derive persist payload and restore state", () => {
  const persistPayload = buildSaveCollectionDraftPersistPayload(
    {
      staffNickname: "collector-1",
      customerName: "Siti",
      icNumber: "900101-10-1234",
      customerPhone: "0123456789",
      accountNumber: "ACC-1",
      batch: "P25",
      paymentDate: "2026-03-01",
      amount: "100.50",
    },
    true,
  );
  const restored = buildSaveCollectionDraftRestoreState({
    ...persistPayload,
    savedAt: "2026-04-06T12:00:00.000Z",
  });

  assert.equal(persistPayload.hadPendingReceipts, true);
  assert.equal(restored.values.customerName, "Siti");
  assert.equal(restored.values.batch, "P25");
  assert.deepEqual(restored.notice, {
    restoredAt: "2026-04-06T12:00:00.000Z",
    hadPendingReceipts: true,
  });
});

test("save collection state utils patch only the targeted receipt draft", () => {
  const drafts = applySaveCollectionReceiptDraftPatch(
    [
      {
        draftLocalId: "draft-1",
        receiptAmount: "",
        receiptDate: "",
        receiptReference: "",
        receiptId: null,
        fileHash: null,
      },
      {
        draftLocalId: "draft-2",
        receiptAmount: "50",
        receiptDate: "",
        receiptReference: "",
        receiptId: null,
        fileHash: null,
      },
    ],
    1,
    {
      receiptReference: "ABC123",
    },
  );

  assert.equal(drafts[0]?.receiptReference, "");
  assert.equal(drafts[1]?.receiptAmount, "50");
  assert.equal(drafts[1]?.receiptReference, "ABC123");
});
