import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionReceiptValidationResult,
  findDuplicateCollectionReceiptHashes,
  formatCollectionAmountFromCents,
  parseCollectionAmountToCents,
} from "../collection/collection-receipt-validation";

test("parseCollectionAmountToCents uses integer cents safely", () => {
  assert.equal(parseCollectionAmountToCents("1000"), 100000);
  assert.equal(parseCollectionAmountToCents("15.50"), 1550);
  assert.equal(parseCollectionAmountToCents("15.555"), null);
});

test("buildCollectionReceiptValidationResult marks matched totals", () => {
  const result = buildCollectionReceiptValidationResult({
    totalPaidCents: 300000,
    receipts: [
      { receiptAmountCents: 150000, originalFileName: "receipt-a.png" },
      { receiptAmountCents: 150000, originalFileName: "receipt-b.png" },
    ],
  });

  assert.equal(result.status, "matched");
  assert.equal(result.receiptTotalAmountCents, 300000);
  assert.equal(result.requiresOverride, false);
});

test("buildCollectionReceiptValidationResult marks underpaid totals", () => {
  const result = buildCollectionReceiptValidationResult({
    totalPaidCents: 300000,
    receipts: [
      { receiptAmountCents: 150000, originalFileName: "receipt-a.png" },
      { receiptAmountCents: 120000, originalFileName: "receipt-b.png" },
    ],
  });

  assert.equal(result.status, "underpaid");
  assert.equal(result.receiptTotalAmountCents, 270000);
  assert.equal(result.requiresOverride, true);
  assert.match(result.message, /kurang/i);
});

test("buildCollectionReceiptValidationResult marks missing receipt amounts as unverified", () => {
  const result = buildCollectionReceiptValidationResult({
    totalPaidCents: 100000,
    receipts: [
      { receiptAmountCents: null, originalFileName: "receipt-a.png" },
    ],
  });

  assert.equal(result.status, "unverified");
  assert.equal(result.requiresOverride, true);
  assert.match(result.message, /perlu disahkan/i);
});

test("buildCollectionReceiptValidationResult marks overpaid totals", () => {
  const result = buildCollectionReceiptValidationResult({
    totalPaidCents: 300000,
    receipts: [
      { receiptAmountCents: 180000, originalFileName: "receipt-a.png" },
      { receiptAmountCents: 180000, originalFileName: "receipt-b.png" },
    ],
  });

  assert.equal(result.status, "overpaid");
  assert.equal(result.receiptTotalAmountCents, 360000);
  assert.equal(result.requiresOverride, true);
  assert.match(result.message, /melebihi/i);
});

test("buildCollectionReceiptValidationResult keeps OCR mismatches as needs_review when totals still match", () => {
  const result = buildCollectionReceiptValidationResult({
    totalPaidCents: 150000,
    receipts: [
      {
        receiptAmountCents: 150000,
        extractedAmountCents: 120000,
        extractionStatus: "suggested",
        extractionConfidence: 0.92,
        originalFileName: "receipt-a.png",
      },
    ],
  });

  assert.equal(result.status, "needs_review");
  assert.equal(result.requiresOverride, false);
  assert.match(result.message, /semakan manusia/i);
});

test("findDuplicateCollectionReceiptHashes detects repeated receipt hashes", () => {
  const duplicates = findDuplicateCollectionReceiptHashes([
    { fileHash: "abc", originalFileName: "receipt-a.png" },
    { fileHash: "abc", originalFileName: "receipt-b.png" },
    { fileHash: "def", originalFileName: "receipt-c.png" },
  ]);

  assert.deepEqual(duplicates, [
    {
      fileHash: "abc",
      fileNames: ["receipt-a.png", "receipt-b.png"],
    },
  ]);
});

test("formatCollectionAmountFromCents formats cent totals consistently", () => {
  assert.equal(formatCollectionAmountFromCents(0), "0.00");
  assert.equal(formatCollectionAmountFromCents(1550), "15.50");
});
