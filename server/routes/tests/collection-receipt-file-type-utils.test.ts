import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStoredCollectionReceiptMetadata,
  isCollectionReceiptInlinePreviewMimeType,
  mapCollectionReceiptExtensionToType,
  mapCollectionReceiptMimeToType,
  normalizeCollectionReceiptMimeType,
  resolveCollectionReceiptMimeTypeFromFileName,
  sanitizeReceiptDownloadName,
} from "../collection-receipt-file-type-utils";

test("collection receipt file type helpers normalize aliases and map supported formats", () => {
  assert.equal(normalizeCollectionReceiptMimeType("image/jpg"), "image/jpeg");
  assert.equal(normalizeCollectionReceiptMimeType("application/x-pdf"), "application/pdf");
  assert.equal(mapCollectionReceiptMimeToType("image/jpeg"), "jpg");
  assert.equal(mapCollectionReceiptMimeToType("image/webp"), "webp");
  assert.equal(mapCollectionReceiptExtensionToType(".jpeg"), "jpg");
  assert.equal(mapCollectionReceiptExtensionToType(".pdf"), "pdf");
  assert.equal(mapCollectionReceiptExtensionToType(".exe"), null);
});

test("collection receipt preview helpers keep filenames safe and inline-aware", () => {
  assert.equal(resolveCollectionReceiptMimeTypeFromFileName("receipt.webp"), "image/webp");
  assert.equal(resolveCollectionReceiptMimeTypeFromFileName("receipt.bin"), "application/octet-stream");
  assert.equal(isCollectionReceiptInlinePreviewMimeType("image/png"), true);
  assert.equal(isCollectionReceiptInlinePreviewMimeType("application/octet-stream"), false);
  assert.equal(
    sanitizeReceiptDownloadName("unsafe receipt (April)#1?.pdf"),
    "unsafe_receipt_April_1_.pdf",
  );
});

test("collection receipt storage metadata keeps managed paths and canonical extensions", () => {
  const metadata = buildStoredCollectionReceiptMetadata({
    fileName: "APRIL RECEIPT.jpeg",
    signatureType: "jpg",
  });

  assert.equal(metadata.originalFileName.endsWith(".jpeg"), true);
  assert.equal(metadata.storedFileName.endsWith(".jpg"), true);
  assert.equal(metadata.storagePath.startsWith("/uploads/collection-receipts/"), true);
});

test("collection receipt storage metadata generates a unique managed filename for each upload attempt", () => {
  const first = buildStoredCollectionReceiptMetadata({
    fileName: "shared-receipt.png",
    signatureType: "png",
  });
  const second = buildStoredCollectionReceiptMetadata({
    fileName: "shared-receipt.png",
    signatureType: "png",
  });

  assert.notEqual(first.storedFileName, second.storedFileName);
  assert.notEqual(first.absolutePath, second.absolutePath);
  assert.notEqual(first.storagePath, second.storagePath);
});
