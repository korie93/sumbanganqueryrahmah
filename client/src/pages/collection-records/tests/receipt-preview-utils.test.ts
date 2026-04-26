import assert from "node:assert/strict";
import test from "node:test";
import {
  inferReceiptMimeTypeFromName,
  resolveReceiptPreviewKind,
  shouldRenderInlineReceiptPdfPreview,
} from "../utils";
import type { CollectionRecordReceipt } from "@/lib/api";
import {
  clampReceiptPreviewZoom,
  getReceiptPreviewZoomValue,
  resolveSelectedReceipt,
  shouldShowReceiptPreviewZoomControls,
} from "../receipt-preview-dialog-utils";

test("inferReceiptMimeTypeFromName recognizes webp receipt files", () => {
  assert.equal(inferReceiptMimeTypeFromName("receipt-scan.WEBP"), "image/webp");
});

test("resolveReceiptPreviewKind treats webp receipts as images", () => {
  assert.equal(
    resolveReceiptPreviewKind({
      fileName: "receipt.webp",
    }),
    "image",
  );
});

test("shouldRenderInlineReceiptPdfPreview disables inline PDF preview on mobile", () => {
  assert.equal(
    shouldRenderInlineReceiptPdfPreview({
      kind: "pdf",
      isMobile: true,
    }),
    false,
  );

  assert.equal(
    shouldRenderInlineReceiptPdfPreview({
      kind: "pdf",
      isMobile: false,
    }),
    true,
  );
});

test("receipt preview dialog utils clamp zoom and resolve selected receipt", () => {
  assert.equal(clampReceiptPreviewZoom(0.1), 0.5);
  assert.equal(clampReceiptPreviewZoom(3.5), 2);
  assert.equal(getReceiptPreviewZoomValue(1.24), "1.24");
  assert.equal(
    shouldShowReceiptPreviewZoomControls({
      kind: "image",
      safeSource: "blob:http://127.0.0.1/image",
    }),
    true,
  );
  assert.equal(
    shouldShowReceiptPreviewZoomControls({
      kind: "pdf",
      safeSource: "blob:http://127.0.0.1/pdf",
    }),
    false,
  );
  assert.equal(shouldShowReceiptPreviewZoomControls({ kind: "image", safeSource: null }), false);

  const createReceipt = (id: string, originalFileName: string): CollectionRecordReceipt => ({
    id,
    collectionRecordId: "record-1",
    storagePath: `receipts/${originalFileName}`,
    originalFileName,
    originalMimeType: "application/pdf",
    originalExtension: "pdf",
    fileSize: 128,
    receiptAmount: null,
    extractedAmount: null,
    extractionStatus: "unprocessed",
    extractionConfidence: null,
    receiptDate: null,
    receiptReference: null,
    fileHash: null,
    createdAt: "2026-04-01T00:00:00.000Z",
  });
  const receipts = [createReceipt("first", "a.pdf"), createReceipt("second", "b.pdf")];
  assert.equal(resolveSelectedReceipt(receipts, "second")?.id, "second");
  assert.equal(resolveSelectedReceipt(receipts, "missing")?.id, "first");
  assert.equal(resolveSelectedReceipt([], "missing"), null);
});
