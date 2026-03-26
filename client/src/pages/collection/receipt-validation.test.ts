import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionReceiptValidationPreview,
  createCollectionReceiptDraftFromReceipt,
  parseCollectionAmountInputToCents,
  shouldBlockCollectionReceiptSave,
} from "./receipt-validation";

test("parseCollectionAmountInputToCents uses cents safely", () => {
  assert.equal(parseCollectionAmountInputToCents("1000"), 100000);
  assert.equal(parseCollectionAmountInputToCents("15.50"), 1550);
  assert.equal(parseCollectionAmountInputToCents("15.555"), null);
});

test("buildCollectionReceiptValidationPreview marks matched totals", () => {
  const result = buildCollectionReceiptValidationPreview({
    totalPaid: "3000",
    receipts: [
      { receiptAmount: "1500", receiptDate: "", receiptReference: "" },
      { receiptAmount: "1500", receiptDate: "", receiptReference: "" },
    ],
  });

  assert.equal(result.status, "matched");
  assert.equal(result.requiresOverride, false);
  assert.equal(result.receiptTotalAmountCents, 300000);
});

test("buildCollectionReceiptValidationPreview marks mismatched totals", () => {
  const result = buildCollectionReceiptValidationPreview({
    totalPaid: "3000",
    receipts: [
      { receiptAmount: "1500", receiptDate: "", receiptReference: "" },
      { receiptAmount: "1200", receiptDate: "", receiptReference: "" },
    ],
  });

  assert.equal(result.status, "mismatch");
  assert.equal(result.requiresOverride, true);
  assert.match(result.message, /tidak sepadan/i);
});

test("shouldBlockCollectionReceiptSave only allows override roles with a reason", () => {
  const validation = buildCollectionReceiptValidationPreview({
    totalPaid: "1000",
    receipts: [{ receiptAmount: "800", receiptDate: "", receiptReference: "" }],
  });

  assert.equal(shouldBlockCollectionReceiptSave({ validation, role: "user" }), true);
  assert.equal(shouldBlockCollectionReceiptSave({ validation, role: "admin" }), true);
  assert.equal(
    shouldBlockCollectionReceiptSave({
      validation,
      role: "admin",
      overrideReason: "Verified under supervisor approval",
    }),
    false,
  );
});

test("createCollectionReceiptDraftFromReceipt preserves existing reviewable fields", () => {
  const draft = createCollectionReceiptDraftFromReceipt({
    id: "receipt-1",
    collectionRecordId: "record-1",
    storagePath: "/uploads/collection-receipts/receipt-1.png",
    originalFileName: "receipt-1.png",
    originalMimeType: "image/png",
    originalExtension: ".png",
    fileSize: 1200,
    receiptAmount: "1500.00",
    extractedAmount: "1499.99",
    extractionConfidence: 0.93,
    receiptDate: "2026-03-25",
    receiptReference: "RCP-100",
    fileHash: "abc123",
    createdAt: "2026-03-25T00:00:00.000Z",
  });

  assert.equal(draft.receiptAmount, "1500.00");
  assert.equal(draft.receiptReference, "RCP-100");
  assert.equal(draft.fileHash, "abc123");
});
