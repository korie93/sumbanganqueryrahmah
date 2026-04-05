import assert from "node:assert/strict";
import test from "node:test";
import { CollectionReceiptSecurityError } from "../../lib/collection-receipt-security";
import {
  buildStoredCollectionReceiptFile,
  inspectCollectionReceiptBuffer,
  validateCollectionReceiptDeclaredMetadata,
} from "../collection-receipt-save-utils";

test("collection receipt save helpers validate extension and mime declarations defensively", () => {
  assert.throws(
    () => {
      validateCollectionReceiptDeclaredMetadata({
        fileName: "receipt.exe",
        declaredMimeType: "",
        declaredMimeTypeAccepted: false,
        signatureType: "pdf",
      });
    },
    (error: unknown) =>
      error instanceof CollectionReceiptSecurityError &&
      error.reasonCode === "receipt-extension-not-allowed",
  );

  assert.throws(
    () => {
      validateCollectionReceiptDeclaredMetadata({
        fileName: "receipt.pdf",
        declaredMimeType: "image/png",
        declaredMimeTypeAccepted: true,
        signatureType: "pdf",
      });
    },
    (error: unknown) =>
      error instanceof CollectionReceiptSecurityError &&
      error.reasonCode === "receipt-mime-mismatch",
  );
});

test("collection receipt save helpers keep stored receipt metadata canonical and hash buffers", async () => {
  const inspection = await inspectCollectionReceiptBuffer({
    buffer: Buffer.from("receipt-bytes"),
    mimeType: "application/pdf",
  });

  const stored = buildStoredCollectionReceiptFile({
    storedReceipt: {
      storagePath: "/uploads/collection-receipts/receipt.pdf",
      originalFileName: "receipt.pdf",
      canonicalType: {
        mimeType: "application/pdf",
        extension: ".pdf",
      },
    },
    inspection,
    fileSize: 13,
  });

  assert.equal(inspection.fileHash?.length, 64);
  assert.equal(stored.originalMimeType, "application/pdf");
  assert.equal(stored.originalExtension, ".pdf");
  assert.equal(stored.fileSize, 13);
});
