import assert from "node:assert/strict";
import test from "node:test";
import { resolveCollectionReceiptFile } from "../collection-receipt-file-resolution-utils";

test("collection receipt file resolution only resolves managed uploads and infers preview support", () => {
  const managed = resolveCollectionReceiptFile("/uploads/collection-receipts/april-receipt.webp");
  const unsafe = resolveCollectionReceiptFile("../collection-receipts/april-receipt.webp");

  assert.equal(managed?.storedFileName, "april-receipt.webp");
  assert.equal(managed?.mimeType, "image/webp");
  assert.equal(managed?.isInlinePreviewSupported, true);
  assert.equal(unsafe, null);
});
