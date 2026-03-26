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

test("buildCollectionReceiptValidationResult marks mismatched totals", () => {
  const result = buildCollectionReceiptValidationResult({
    totalPaidCents: 300000,
    receipts: [
      { receiptAmountCents: 150000, originalFileName: "receipt-a.png" },
      { receiptAmountCents: 120000, originalFileName: "receipt-b.png" },
    ],
  });

  assert.equal(result.status, "mismatch");
  assert.equal(result.receiptTotalAmountCents, 270000);
  assert.equal(result.requiresOverride, true);
  assert.match(result.message, /tidak sepadan/i);
});

test("buildCollectionReceiptValidationResult marks missing receipt amounts as needs review", () => {
  const result = buildCollectionReceiptValidationResult({
    totalPaidCents: 100000,
    receipts: [
      { receiptAmountCents: null, originalFileName: "receipt-a.png" },
    ],
  });

  assert.equal(result.status, "needs_review");
  assert.equal(result.requiresOverride, true);
  assert.match(result.message, /perlu disahkan/i);
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
