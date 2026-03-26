import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionRecord } from "@/lib/api";
import {
  buildCollectionReceiptReviewSummary,
  getCollectionReceiptValidationStatusLabel,
  isCollectionRecordFlaggedForReview,
} from "@/pages/collection/collection-receipt-status";

let recordCounter = 0;

function createRecord(overrides: Partial<CollectionRecord>): CollectionRecord {
  return {
    id: overrides.id || `record-${++recordCounter}`,
    customerName: overrides.customerName || "Customer",
    icNumber: overrides.icNumber || "900101101010",
    customerPhone: overrides.customerPhone || "0123456789",
    accountNumber: overrides.accountNumber || "ACC-001",
    batch: overrides.batch || "P10",
    paymentDate: overrides.paymentDate || "2026-03-25",
    amount: overrides.amount || "1000.00",
    receiptFile: overrides.receiptFile || null,
    receipts: overrides.receipts || [],
    receiptTotalAmount: overrides.receiptTotalAmount || "1000.00",
    receiptValidationStatus: overrides.receiptValidationStatus || "matched",
    receiptValidationMessage: overrides.receiptValidationMessage || null,
    receiptCount: overrides.receiptCount || 1,
    duplicateReceiptFlag: overrides.duplicateReceiptFlag || false,
    createdByLogin: overrides.createdByLogin || "tester",
    collectionStaffNickname: overrides.collectionStaffNickname || "TEST",
    createdAt: overrides.createdAt || "2026-03-25T00:00:00.000Z",
    updatedAt: overrides.updatedAt,
  };
}

test("buildCollectionReceiptReviewSummary counts flagged receipt states cleanly", () => {
  const summary = buildCollectionReceiptReviewSummary([
    createRecord({
      customerName: "Matched",
      receiptValidationStatus: "matched",
      duplicateReceiptFlag: false,
    }),
    createRecord({
      customerName: "Mismatch",
      receiptValidationStatus: "underpaid",
      receiptValidationMessage: "Underpaid",
      paymentDate: "2026-03-24",
    }),
    createRecord({
      customerName: "Needs Review",
      receiptValidationStatus: "needs_review",
      duplicateReceiptFlag: true,
      receiptValidationMessage: "Duplicate warning",
      paymentDate: "2026-03-23",
    }),
    createRecord({
      customerName: "Unverified",
      receiptValidationStatus: "unverified",
      receiptValidationMessage: "Missing receipt amount",
      paymentDate: "2026-03-22",
    }),
  ]);

  assert.equal(summary.totalRecords, 4);
  assert.equal(summary.matchedCount, 1);
  assert.equal(summary.mismatchCount, 1);
  assert.equal(summary.needsAttentionCount, 3);
  assert.equal(summary.duplicateWarningCount, 1);
  assert.equal(summary.flaggedCount, 3);
  assert.equal(summary.flaggedRecords[0]?.customerName, "Mismatch");
});

test("isCollectionRecordFlaggedForReview treats duplicate matched receipts as actionable", () => {
  assert.equal(
    isCollectionRecordFlaggedForReview({
      receiptValidationStatus: "matched",
      duplicateReceiptFlag: true,
    }),
    true,
  );
  assert.equal(
    isCollectionRecordFlaggedForReview({
      receiptValidationStatus: "matched",
      duplicateReceiptFlag: false,
    }),
    false,
  );
});

test("getCollectionReceiptValidationStatusLabel keeps UI copy stable", () => {
  assert.equal(getCollectionReceiptValidationStatusLabel("matched"), "Matched");
  assert.equal(getCollectionReceiptValidationStatusLabel("underpaid"), "Underpaid");
  assert.equal(getCollectionReceiptValidationStatusLabel("overpaid"), "Overpaid");
  assert.equal(getCollectionReceiptValidationStatusLabel("unverified"), "Unverified");
  assert.equal(getCollectionReceiptValidationStatusLabel("needs_review"), "Needs Review");
});
