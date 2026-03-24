import assert from "node:assert/strict";
import test from "node:test";
import { inferReceiptMimeTypeFromName, resolveReceiptPreviewKind } from "../utils";

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
