import assert from "node:assert/strict";
import test from "node:test";
import {
  detectCollectionReceiptSignature,
  removeCollectionReceiptFile,
  saveCollectionReceipt,
} from "../../routes/collection-receipt.service";

function asBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

test("detectCollectionReceiptSignature identifies supported signatures", () => {
  const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const webp = Buffer.from([
    0x52, 0x49, 0x46, 0x46,
    0x24, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20,
  ]);

  assert.equal(detectCollectionReceiptSignature(pdf), "pdf");
  assert.equal(detectCollectionReceiptSignature(png), "png");
  assert.equal(detectCollectionReceiptSignature(jpg), "jpg");
  assert.equal(detectCollectionReceiptSignature(webp), "webp");
  assert.equal(detectCollectionReceiptSignature(Buffer.from([0x00, 0x01, 0x02, 0x03])), null);
});

test("saveCollectionReceipt rejects extension-mismatch payloads", async () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

  await assert.rejects(
    () =>
      saveCollectionReceipt({
        fileName: "receipt.pdf",
        mimeType: "application/pdf",
        contentBase64: asBase64(pngBytes),
      }),
    /does not match/i,
  );
});

test("saveCollectionReceipt accepts webp payloads and stores canonical metadata", async () => {
  const webpBytes = Buffer.from([
    0x52, 0x49, 0x46, 0x46,
    0x24, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20,
  ]);

  const saved = await saveCollectionReceipt({
    fileName: "scan.webp",
    mimeType: "image/webp",
    contentBase64: asBase64(webpBytes),
  });

  assert.equal(saved.originalExtension, ".webp");
  assert.equal(saved.originalMimeType, "image/webp");
  assert.match(saved.storagePath, /\/uploads\/collection-receipts\/.+\.webp$/);

  await removeCollectionReceiptFile(saved.storagePath);
});

test("saveCollectionReceipt accepts image/jpg alias MIME and stores canonical jpeg metadata", async () => {
  const jpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

  const saved = await saveCollectionReceipt({
    fileName: "mobile-upload.jpg",
    mimeType: "image/jpg",
    contentBase64: asBase64(jpgBytes),
  });

  assert.equal(saved.originalExtension, ".jpg");
  assert.equal(saved.originalMimeType, "image/jpeg");
  assert.match(saved.storagePath, /\/uploads\/collection-receipts\/.+\.jpg$/);

  await removeCollectionReceiptFile(saved.storagePath);
});

test("saveCollectionReceipt accepts image/jfif declarations when signature and extension are valid", async () => {
  const jpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

  const saved = await saveCollectionReceipt({
    fileName: "camera-export.jpeg",
    mimeType: "image/jfif",
    contentBase64: asBase64(jpgBytes),
  });

  assert.equal(saved.originalExtension, ".jpg");
  assert.equal(saved.originalMimeType, "image/jpeg");
  assert.match(saved.storagePath, /\/uploads\/collection-receipts\/.+\.jpg$/);

  await removeCollectionReceiptFile(saved.storagePath);
});
