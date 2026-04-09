import assert from "node:assert/strict";
import test from "node:test";
import {
  inferReceiptMimeTypeFromName,
  resolveReceiptPreviewKind,
  shouldRenderInlineReceiptPdfPreview,
} from "../utils";
import {
  clampReceiptPreviewZoom,
  getReceiptPreviewZoomStyle,
  resolveSelectedReceipt,
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
  assert.equal(clampReceiptPreviewZoom(3.5), 3);
  assert.deepEqual(getReceiptPreviewZoomStyle(1.24), {
    "--receipt-preview-zoom": "1.24",
  });

  const receipts = [
    { id: "first", originalFileName: "a.pdf" },
    { id: "second", originalFileName: "b.pdf" },
  ] as any[];
  assert.equal(resolveSelectedReceipt(receipts, "second")?.id, "second");
  assert.equal(resolveSelectedReceipt(receipts, "missing")?.id, "first");
  assert.equal(resolveSelectedReceipt([], "missing"), null);
});
