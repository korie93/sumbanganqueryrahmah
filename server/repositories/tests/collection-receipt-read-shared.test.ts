import assert from "node:assert/strict";
import test from "node:test";
import {
  inferLegacyReceiptMimeType,
  mapCollectionRecordReceiptRow,
  normalizeCollectionDate,
} from "../collection-receipt-read-shared";

test("inferLegacyReceiptMimeType maps known legacy storage extensions", () => {
  assert.equal(inferLegacyReceiptMimeType("/uploads/receipt.pdf"), "application/pdf");
  assert.equal(inferLegacyReceiptMimeType("/uploads/receipt.png"), "image/png");
  assert.equal(inferLegacyReceiptMimeType("/uploads/receipt.jpeg"), "image/jpeg");
  assert.equal(inferLegacyReceiptMimeType("/uploads/receipt.webp"), "image/webp");
  assert.equal(inferLegacyReceiptMimeType("/uploads/receipt.bin"), "application/octet-stream");
});

test("normalizeCollectionDate keeps date-like inputs stable", () => {
  const existing = new Date("2026-03-01T00:00:00.000Z");
  assert.equal(normalizeCollectionDate(existing), existing);
  assert.equal(
    normalizeCollectionDate("2026-03-02T00:00:00.000Z").toISOString(),
    "2026-03-02T00:00:00.000Z",
  );
});

test("mapCollectionRecordReceiptRow normalizes receipt amounts and metadata fields", () => {
  const receipt = mapCollectionRecordReceiptRow({
    id: "receipt-1",
    collection_record_id: "record-1",
    storage_path: "/uploads/collection-receipts/receipt.png",
    original_file_name: "receipt.png",
    original_mime_type: "image/png",
    original_extension: ".png",
    file_size: 123,
    receipt_amount: 1050,
    extracted_amount: 980,
    extraction_status: "suggested",
    extraction_confidence: 0.92,
    receipt_date: "2026-03-01",
    receipt_reference: "ABC123",
    file_hash: "hash-1",
    created_at: "2026-03-01T00:00:00.000Z",
  });

  assert.equal(receipt.receiptAmount, "10.50");
  assert.equal(receipt.extractedAmount, "9.80");
  assert.equal(receipt.extractionStatus, "suggested");
  assert.equal(receipt.extractionConfidence, 0.92);
  assert.equal(receipt.receiptReference, "ABC123");
  assert.equal(receipt.createdAt.toISOString(), "2026-03-01T00:00:00.000Z");
});
