import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  diagnoseJpegStructure,
  validateJpegStructure,
} from "../../lib/collection-receipt-jpeg-security-utils";
import {
  CollectionReceiptSecurityError,
  sanitizeCollectionReceiptBuffer,
} from "../../lib/collection-receipt-security";
import { sanitizeAndInspectCollectionReceiptBuffer } from "../collection-receipt-save-utils";

// These are the existing offline encodings of a synthetic 2x2 #2468ac square
// from account-avatar-image.test.ts. No receipt or customer data is included.
// Chromium baseline JPEG includes ICC metadata; Pillow JPEG has multiple scans.
const baselineJpegBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AI4AzEX/2Q==";
const progressiveJpegBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUAQEAAAAAAAAAAAAAAAAAAAAF/9oADAMBAAIQAxAAAAGYFDf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEPP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==";

// Exact observed APP0/JFXX-WA-shaped trailer; this does not identify a producer.
const KNOWN_TRAILER = Buffer.from("ffe000124a465858005741000000000000000000", "hex");

function prepareReceipt(buffer: Buffer) {
  return sanitizeAndInspectCollectionReceiptBuffer({
    fileName: "synthetic-receipt.jpg",
    buffer,
    signatureType: "jpg",
  });
}

function hasReason(reasonCode: string) {
  return (error: unknown): boolean =>
    error instanceof CollectionReceiptSecurityError && error.reasonCode === reasonCode;
}

for (const [label, base64] of [["baseline", baselineJpegBase64], ["progressive", progressiveJpegBase64]] as const) {
  test(`receipt JPEG compatibility removes only the exact known trailer from a genuine ${label} JPEG`, async () => {
    assert.equal(KNOWN_TRAILER.length, 20);
    const original = Buffer.from(base64, "base64");
    const input = Buffer.concat([original, KNOWN_TRAILER]);
    const before = Buffer.from(input);
    const expected = sanitizeCollectionReceiptBuffer(original, "jpg");

    const result = await prepareReceipt(input);

    assert.deepEqual(result.sanitizedBuffer, expected.buffer);
    assert.equal(result.imageWidth, 2);
    assert.equal(result.imageHeight, 2);
    assert.equal(result.imageWidth, expected.imageWidth);
    assert.equal(result.imageHeight, expected.imageHeight);
    assert.equal(result.inspection.fileHash, createHash("sha256").update(expected.buffer).digest("hex"));
    assert.deepEqual([...result.removedMetadataKinds].sort(), [
      ...expected.removedMetadataKinds,
      "jpeg-jfxx-wa-trailer",
    ].sort());
    validateJpegStructure(result.sanitizedBuffer);
    assert.deepEqual(input, before, "normalization must not mutate the selected upload");
    assert.equal(diagnoseJpegStructure(input).eoiEndOffset, original.length);
    assert.equal(diagnoseJpegStructure(input).reasonCode, "jpeg-trailing-data");

    const repeated = await prepareReceipt(result.sanitizedBuffer);
    assert.deepEqual(repeated.sanitizedBuffer, result.sanitizedBuffer);
    assert.equal(repeated.inspection.fileHash, result.inspection.fileHash);
    assert.deepEqual(repeated.removedMetadataKinds, []);
  });

  test(`strict JPEG validation and general sanitization still reject the known trailer on ${label}`, () => {
    const input = Buffer.concat([Buffer.from(base64, "base64"), KNOWN_TRAILER]);
    assert.throws(() => validateJpegStructure(input), hasReason("jpeg-trailing-data"));
    assert.throws(() => sanitizeCollectionReceiptBuffer(input, "jpg"), hasReason("jpeg-trailing-data"));
  });
}

test("receipt JPEG compatibility rejects a one-byte change at every position of the known trailer", async () => {
  const image = Buffer.from(progressiveJpegBase64, "base64");
  for (let position = 0; position < KNOWN_TRAILER.length; position += 1) {
    const changedTrailer = Buffer.from(KNOWN_TRAILER);
    changedTrailer[position] ^= 1;
    const input = Buffer.concat([image, changedTrailer]);
    const before = Buffer.from(input);
    await assert.rejects(() => prepareReceipt(input), hasReason("jpeg-trailing-data"), `trailer byte ${position}`);
    assert.deepEqual(input, before);
  }
});

test("receipt JPEG compatibility rejects shortened, repeated, extended and unrelated suffixes", async () => {
  const image = Buffer.from(progressiveJpegBase64, "base64");
  const suffixes = [
    ...Array.from({ length: KNOWN_TRAILER.length - 1 }, (_, index) => KNOWN_TRAILER.subarray(0, index + 1)),
    KNOWN_TRAILER.subarray(1),
    Buffer.concat([KNOWN_TRAILER, KNOWN_TRAILER]),
    Buffer.concat([Buffer.from([0]), KNOWN_TRAILER]),
    Buffer.concat([KNOWN_TRAILER, Buffer.from([0])]),
    Buffer.alloc(20),
    Buffer.from("01234567890123456789"),
    Buffer.from("<script>alert(1)</script>"),
    image,
    Buffer.concat([image, KNOWN_TRAILER]),
    Buffer.concat([KNOWN_TRAILER, Buffer.from("<script>alert(1)</script>")]),
  ];
  for (const suffix of suffixes) {
    const input = Buffer.concat([image, suffix]);
    const before = Buffer.from(input);
    await assert.rejects(() => prepareReceipt(input), hasReason("jpeg-trailing-data"));
    assert.deepEqual(input, before);
  }
});

test("receipt JPEG compatibility never invents an EOI or repairs malformed primary structure", async () => {
  const image = Buffer.from(progressiveJpegBase64, "base64");
  const metadataWithFalseEoi = Buffer.from("ffe10004ffd9", "hex");
  const variants = [
    { prefix: image.subarray(0, -2), reason: "jpeg-eoi-missing" },
    { prefix: Buffer.concat([image.subarray(0, 2), metadataWithFalseEoi, image.subarray(2, -2)]), reason: "jpeg-eoi-missing" },
    { prefix: Buffer.from("0000ffd9", "hex"), reason: "jpeg-header-invalid" },
    { prefix: Buffer.from("ffd8ffe10001ffd9", "hex"), reason: "jpeg-segment-invalid" },
    { prefix: Buffer.from("ffd8ffe1ffffffd9", "hex"), reason: "jpeg-segment-invalid" },
  ];
  for (const variant of variants) {
    const input = Buffer.concat([variant.prefix, KNOWN_TRAILER]);
    const before = Buffer.from(input);
    await assert.rejects(() => prepareReceipt(input), hasReason(variant.reason));
    assert.deepEqual(input, before);
  }
});

test("receipt JPEG compatibility still enforces image dimension and pixel limits", async () => {
  for (const { width, height, reason } of [
    { width: 10_001, height: 2, reason: "image-dimensions-edge-exceeded" },
    { width: 8_000, height: 8_000, reason: "image-dimensions-pixel-exceeded" },
    { width: 0, height: 2, reason: "image-dimensions-unverified" },
  ]) {
    // Modify the SOF dimensions solely to test header limits; do not claim
    // that the resulting bytes independently decode to the enlarged raster.
    const image = Buffer.from(progressiveJpegBase64, "base64");
    const frameOffset = image.indexOf(Buffer.from([0xff, 0xc2]));
    assert.ok(frameOffset >= 0);
    image.writeUInt16BE(height, frameOffset + 5);
    image.writeUInt16BE(width, frameOffset + 7);
    assert.throws(() => sanitizeCollectionReceiptBuffer(image, "jpg"), hasReason(reason));

    const input = Buffer.concat([image, KNOWN_TRAILER]);
    const before = Buffer.from(input);
    await assert.rejects(() => prepareReceipt(input), hasReason(reason));
    assert.deepEqual(input, before);
  }
});

test("receipt JPEG compatibility locates the actual EOI beyond marker-like metadata bytes", async () => {
  const image = Buffer.from(progressiveJpegBase64, "base64");
  const metadataWithFalseEoi = Buffer.from("ffe10004ffd9", "hex");
  const original = Buffer.concat([image.subarray(0, 2), metadataWithFalseEoi, image.subarray(2)]);
  const expected = sanitizeCollectionReceiptBuffer(original, "jpg");
  const input = Buffer.concat([original, KNOWN_TRAILER]);
  const before = Buffer.from(input);

  const result = await prepareReceipt(input);

  assert.deepEqual(result.sanitizedBuffer, expected.buffer);
  assert.equal(result.inspection.fileHash, createHash("sha256").update(expected.buffer).digest("hex"));
  assert.ok(result.removedMetadataKinds.includes("jpeg-app1"));
  assert.ok(result.removedMetadataKinds.includes("jpeg-jfxx-wa-trailer"));
  assert.deepEqual(input, before);
});
