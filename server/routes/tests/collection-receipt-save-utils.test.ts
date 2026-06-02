import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PassThrough } from "node:stream";
import test from "node:test";
import { resolveCollectionReceiptStoragePath } from "../../lib/collection-receipt-files";
import { CollectionReceiptSecurityError } from "../../lib/collection-receipt-security";
import { saveMultipartCollectionReceipt } from "../collection-receipt-multipart-save-utils";
import {
  buildStoredCollectionReceiptFile,
  inspectCollectionReceiptBuffer,
  validateCollectionReceiptDeclaredMetadata,
} from "../collection-receipt-save-utils";

function createTinyPdfBuffer() {
  return Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "latin1");
}

function createReceiptStream(buffer: Buffer) {
  const stream = new PassThrough();
  stream.end(buffer);
  return stream;
}

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

test("multipart receipt storage creates the managed upload directory on demand", async () => {
  const originalExternalScanEnabled = process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "0";

  let storedPath: string | null = null;
  try {
    const stored = await saveMultipartCollectionReceipt({
      fileName: "receipt-missing-dir.pdf",
      mimeType: "application/pdf",
      stream: createReceiptStream(createTinyPdfBuffer()),
    });

    storedPath = stored.storagePath;
    const resolved = resolveCollectionReceiptStoragePath(storedPath);
    assert.ok(resolved);
    assert.equal(resolved.isManagedCollectionReceipt, true);
    await fs.access(resolved.absolutePath);
  } finally {
    if (originalExternalScanEnabled === undefined) {
      delete process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED;
    } else {
      process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = originalExternalScanEnabled;
    }

    const resolved = resolveCollectionReceiptStoragePath(storedPath);
    if (resolved) {
      await fs.rm(resolved.absolutePath, { force: true });
    }
  }
});

test("multipart receipt storage rejects unsafe extensions and content mismatches", async () => {
  await assert.rejects(
    () => saveMultipartCollectionReceipt({
      fileName: "receipt.exe",
      mimeType: "application/pdf",
      stream: createReceiptStream(createTinyPdfBuffer()),
    }),
    (error: unknown) =>
      error instanceof CollectionReceiptSecurityError &&
      error.reasonCode === "receipt-extension-not-allowed",
  );

  await assert.rejects(
    () => saveMultipartCollectionReceipt({
      fileName: "receipt.png",
      mimeType: "image/png",
      stream: createReceiptStream(createTinyPdfBuffer()),
    }),
    (error: unknown) =>
      error instanceof CollectionReceiptSecurityError &&
      error.reasonCode === "receipt-extension-mismatch",
  );
});
