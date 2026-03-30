import assert from "node:assert/strict";
import test from "node:test";
import {
  inferReceiptMimeTypeFromName,
  resolveReceiptPreviewKind,
  shouldRenderInlineReceiptPdfPreview,
} from "../utils";

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
