import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionReceiptValidationPreview,
  buildCollectionReceiptDraftPatchFromInspection,
  createCollectionReceiptDraftFromReceipt,
  createEmptyCollectionReceiptDraft,
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
      createEmptyCollectionReceiptDraft({ receiptAmount: "1500" }),
      createEmptyCollectionReceiptDraft({ receiptAmount: "1500" }),
    ],
  });

  assert.equal(result.status, "matched");
  assert.equal(result.requiresOverride, false);
  assert.equal(result.receiptTotalAmountCents, 300000);
});

test("buildCollectionReceiptValidationPreview marks underpaid totals", () => {
  const result = buildCollectionReceiptValidationPreview({
    totalPaid: "3000",
    receipts: [
      createEmptyCollectionReceiptDraft({ receiptAmount: "1500" }),
      createEmptyCollectionReceiptDraft({ receiptAmount: "1200" }),
    ],
  });

  assert.equal(result.status, "underpaid");
  assert.equal(result.requiresOverride, true);
  assert.match(result.message, /lebih rendah/i);
});

test("shouldBlockCollectionReceiptSave only allows override roles with a reason", () => {
  const validation = buildCollectionReceiptValidationPreview({
    totalPaid: "1000",
    receipts: [createEmptyCollectionReceiptDraft({ receiptAmount: "800" })],
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

test("buildCollectionReceiptValidationPreview marks overpaid totals", () => {
  const result = buildCollectionReceiptValidationPreview({
    totalPaid: "3000",
    receipts: [
      createEmptyCollectionReceiptDraft({ receiptAmount: "1800" }),
      createEmptyCollectionReceiptDraft({ receiptAmount: "1800" }),
    ],
  });

  assert.equal(result.status, "overpaid");
  assert.equal(result.requiresOverride, true);
  assert.match(result.message, /melebihi/i);
});

test("buildCollectionReceiptValidationPreview keeps OCR-assist mismatches in needs review when totals still match", () => {
  const result = buildCollectionReceiptValidationPreview({
    totalPaid: "1500",
    receipts: [
      createEmptyCollectionReceiptDraft({
        receiptAmount: "1500",
        extractedAmount: "1200",
        extractionStatus: "suggested",
        extractionConfidence: 0.91,
      }),
    ],
  });

  assert.equal(result.status, "needs_review");
  assert.equal(result.requiresOverride, false);
});

test("buildCollectionReceiptDraftPatchFromInspection preserves duplicate warning data", () => {
  const patch = buildCollectionReceiptDraftPatchFromInspection({
    fileName: "receipt-a.png",
    fileHash: "abc123",
    extractedAmount: "123.45",
    extractionStatus: "suggested",
    extractionConfidence: 0.88,
    extractionMessage: "Suggested total found near TOTAL label.",
    duplicateSummary: {
      fileHash: "abc123",
      matchCount: 2,
      matches: [
        {
          receiptId: "receipt-1",
          collectionRecordId: "record-1",
          originalFileName: "receipt-a.png",
          createdAt: "2026-03-25T00:00:00.000Z",
        },
      ],
    },
  });

  assert.equal(patch.extractedAmount, "123.45");
  assert.equal(patch.duplicateSummary?.matchCount, 2);
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
    extractionStatus: "suggested",
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
