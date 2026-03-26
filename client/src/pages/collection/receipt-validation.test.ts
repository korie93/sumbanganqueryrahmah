import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionReceiptMetadataPayload,
  createCollectionReceiptDraftFromReceipt,
  createEmptyCollectionReceiptDraft,
} from "./receipt-validation";

test("createEmptyCollectionReceiptDraft creates sane defaults", () => {
  const draft = createEmptyCollectionReceiptDraft();

  assert.equal(typeof draft.draftLocalId, "string");
  assert.ok(draft.draftLocalId.length > 0);
  assert.equal(draft.receiptAmount, "");
  assert.equal(draft.receiptDate, "");
  assert.equal(draft.receiptReference, "");
  assert.equal(draft.fileHash, null);
});

test("createCollectionReceiptDraftFromReceipt preserves editable receipt fields", () => {
  const draft = createCollectionReceiptDraftFromReceipt({
    id: "receipt-1",
    collectionRecordId: "record-1",
    storagePath: "/uploads/collection-receipts/receipt-1.png",
    originalFileName: "receipt-1.png",
    originalMimeType: "image/png",
    originalExtension: ".png",
    fileSize: 1200,
    receiptAmount: "1500.00",
    extractedAmount: null,
    extractionStatus: "unprocessed",
    extractionConfidence: null,
    receiptDate: "2026-03-25",
    receiptReference: "RCP-100",
    fileHash: "abc123",
    createdAt: "2026-03-25T00:00:00.000Z",
  });

  assert.equal(draft.receiptId, "receipt-1");
  assert.equal(draft.receiptAmount, "1500.00");
  assert.equal(draft.receiptDate, "2026-03-25");
  assert.equal(draft.receiptReference, "RCP-100");
  assert.equal(draft.fileHash, "abc123");
});

test("buildCollectionReceiptMetadataPayload serializes draft for form submission", () => {
  const payload = buildCollectionReceiptMetadataPayload(
    createEmptyCollectionReceiptDraft({
      receiptId: "receipt-2",
      receiptAmount: "88.50",
      receiptDate: "2026-03-26",
      receiptReference: "RCP-200",
      fileHash: "hash-xyz",
    }),
  );

  assert.equal(payload.receiptId, "receipt-2");
  assert.equal(payload.receiptAmount, "88.50");
  assert.equal(payload.receiptDate, "2026-03-26");
  assert.equal(payload.receiptReference, "RCP-200");
  assert.equal(payload.fileHash, "hash-xyz");
});
