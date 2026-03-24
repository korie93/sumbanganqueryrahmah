import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { sanitizeCollectionReceiptBuffer } from "../../lib/collection-receipt-security";
import {
  detectCollectionReceiptSignature,
  removeCollectionReceiptFile,
  saveMultipartCollectionReceipt,
  saveCollectionReceipt,
} from "../../routes/collection-receipt.service";

function asBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

function createTinyPdfBuffer() {
  return Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "latin1");
}

function createDangerousPdfBuffer() {
  return Buffer.from(
    "%PDF-1.7\n1 0 obj\n<< /OpenAction 2 0 R >>\nendobj\n2 0 obj\n<< /JavaScript (app.alert('x')) >>\nendobj\ntrailer\n<<>>\n%%EOF\n",
    "latin1",
  );
}

function createTinyPngBuffer(width = 1, height = 1) {
  const buffer = Buffer.alloc(24);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buffer.set([0x00, 0x00, 0x00, 0x0d], 8);
  buffer.set([0x49, 0x48, 0x44, 0x52], 12);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function createTinyJpegBuffer(width = 1, height = 1) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}

function createTinyWebpBuffer(width = 1, height = 1) {
  return Buffer.from([
    0x52, 0x49, 0x46, 0x46,
    0x16, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58,
    0x0a, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    (width - 1) & 0xff, ((width - 1) >> 8) & 0xff, ((width - 1) >> 16) & 0xff,
    (height - 1) & 0xff, ((height - 1) >> 8) & 0xff, ((height - 1) >> 16) & 0xff,
  ]);
}

function createJpegWithExifMetadata() {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x16, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x65, 0x74, 0x61, 0x64, 0x61, 0x74, 0x61,
    0x2d, 0x54, 0x65, 0x73, 0x74, 0x21,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    0x00, 0x01,
    0x00, 0x01,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}

function createPngWithTextMetadata() {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([
      0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00,
      0x1f, 0x15, 0xc4, 0x89,
    ]),
    Buffer.from([
      0x00, 0x00, 0x00, 0x09,
      0x74, 0x45, 0x58, 0x74,
      0x43, 0x6f, 0x6d, 0x6d, 0x65, 0x6e, 0x74, 0x00, 0x58,
      0x00, 0x00, 0x00, 0x00,
    ]),
    Buffer.from([
      0x00, 0x00, 0x00, 0x00,
      0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ]),
  ]);
}

test("detectCollectionReceiptSignature identifies supported signatures", () => {
  const pdf = createTinyPdfBuffer();
  const png = createTinyPngBuffer();
  const jpg = createTinyJpegBuffer();
  const webp = createTinyWebpBuffer();

  assert.equal(detectCollectionReceiptSignature(pdf), "pdf");
  assert.equal(detectCollectionReceiptSignature(png), "png");
  assert.equal(detectCollectionReceiptSignature(jpg), "jpg");
  assert.equal(detectCollectionReceiptSignature(webp), "webp");
  assert.equal(detectCollectionReceiptSignature(Buffer.from([0x00, 0x01, 0x02, 0x03])), null);
});

test("saveCollectionReceipt rejects extension-mismatch payloads", async () => {
  const pngBytes = createTinyPngBuffer();

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
  const webpBytes = createTinyWebpBuffer();

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
  const jpgBytes = createTinyJpegBuffer();

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
  const jpgBytes = createTinyJpegBuffer();

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

test("saveMultipartCollectionReceipt streams files to disk with canonical metadata", async () => {
  const pngBytes = createTinyPngBuffer();

  const saved = await saveMultipartCollectionReceipt({
    fileName: "stream-upload.png",
    mimeType: "image/png",
    stream: Readable.from([pngBytes]),
  });

  assert.equal(saved.originalExtension, ".png");
  assert.equal(saved.originalMimeType, "image/png");
  assert.match(saved.storagePath, /\/uploads\/collection-receipts\/.+\.png$/);

  await removeCollectionReceiptFile(saved.storagePath);
});

test("sanitizeCollectionReceiptBuffer strips JPEG EXIF metadata before storage", () => {
  const source = createJpegWithExifMetadata();

  const sanitized = sanitizeCollectionReceiptBuffer(source, "jpg");

  assert.equal(sanitized.strippedMetadata, true);
  assert.match(sanitized.removedMetadataKinds.join(","), /jpeg-exif/i);
  assert.equal(sanitized.imageWidth, 1);
  assert.equal(sanitized.imageHeight, 1);
  assert.ok(sanitized.buffer.length < source.length);
  assert.equal(sanitized.buffer.includes(Buffer.from("Exif\0\0", "latin1")), false);
});

test("sanitizeCollectionReceiptBuffer strips PNG text metadata before storage", () => {
  const source = createPngWithTextMetadata();

  const sanitized = sanitizeCollectionReceiptBuffer(source, "png");

  assert.equal(sanitized.strippedMetadata, true);
  assert.match(sanitized.removedMetadataKinds.join(","), /png-text/i);
  assert.equal(sanitized.imageWidth, 1);
  assert.equal(sanitized.imageHeight, 1);
  assert.ok(sanitized.buffer.length < source.length);
  assert.equal(sanitized.buffer.includes(Buffer.from("tEXt", "ascii")), false);
});

test("saveCollectionReceipt rejects PDF payloads that contain dangerous automatic actions", async () => {
  await assert.rejects(
    () =>
      saveCollectionReceipt({
        fileName: "dangerous.pdf",
        mimeType: "application/pdf",
        contentBase64: asBase64(createDangerousPdfBuffer()),
      }),
    /embedded JavaScript|automatic open actions/i,
  );
});

test("saveCollectionReceipt rejects images whose dimensions exceed the security limits", async () => {
  await assert.rejects(
    () =>
      saveCollectionReceipt({
        fileName: "oversized.png",
        mimeType: "image/png",
        contentBase64: asBase64(createTinyPngBuffer(10001, 1)),
      }),
    /maximum edge|maximum pixel/i,
  );
});
