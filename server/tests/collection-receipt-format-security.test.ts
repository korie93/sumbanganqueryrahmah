import assert from "node:assert/strict";
import test from "node:test";
import {
  detectCollectionReceiptSignature,
  validatePdfCollectionReceiptBuffer,
} from "../lib/collection-receipt-format-security";
import { CollectionReceiptSecurityError } from "../lib/collection-receipt-security";

test("detectCollectionReceiptSignature detects supported receipt signatures", () => {
  assert.equal(detectCollectionReceiptSignature(Buffer.from("%PDF-1.7")), "pdf");
  assert.equal(
    detectCollectionReceiptSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "png",
  );
  assert.equal(detectCollectionReceiptSignature(Buffer.from([0xff, 0xd8, 0xff, 0xdb])), "jpg");
  assert.equal(
    detectCollectionReceiptSignature(
      Buffer.from([
        0x52, 0x49, 0x46, 0x46,
        0, 0, 0, 0,
        0x57, 0x45, 0x42, 0x50,
        0x56, 0x50, 0x38, 0x20,
      ]),
    ),
    "webp",
  );
  assert.equal(detectCollectionReceiptSignature(Buffer.from("not-a-receipt")), null);
});

test("detectCollectionReceiptSignature rejects RIFF files that are not WebP receipts", () => {
  assert.equal(
    detectCollectionReceiptSignature(
      Buffer.from([
        0x52, 0x49, 0x46, 0x46,
        0, 0, 0, 0,
        0x57, 0x45, 0x42, 0x50,
        0x41, 0x56, 0x49, 0x20,
      ]),
    ),
    null,
  );
});

test("validatePdfCollectionReceiptBuffer rejects dangerous PDF actions", () => {
  const source = Buffer.from("%PDF-1.7\n1 0 obj\n<< /OpenAction <<>> >>\nendobj\n%%EOF", "latin1");

  assert.throws(
    () => validatePdfCollectionReceiptBuffer(source),
    (error: unknown) =>
      error instanceof CollectionReceiptSecurityError
      && error.reasonCode === "pdf-dangerous-content",
  );
});
