import assert from "node:assert/strict";
import test from "node:test";
import {
  CollectionReceiptSecurityError,
  sanitizeCollectionReceiptBuffer,
  validateCollectionReceiptSecurity,
} from "../lib/collection-receipt-security";

const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+X1eO0QAAAABJRU5ErkJggg==";

test("validateCollectionReceiptSecurity returns image dimensions for valid PNG receipts", () => {
  const pngBuffer = Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64");

  const result = validateCollectionReceiptSecurity(pngBuffer, "png");

  assert.equal(result.imageWidth, 1);
  assert.equal(result.imageHeight, 1);
});

test("sanitizeCollectionReceiptBuffer rejects trailing data in image receipts", () => {
  const pngBuffer = Buffer.concat([
    Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64"),
    Buffer.from("trailing-data", "utf8"),
  ]);

  assert.throws(
    () => sanitizeCollectionReceiptBuffer(pngBuffer, "png"),
    (error: unknown) =>
      error instanceof CollectionReceiptSecurityError &&
      error.reasonCode === "png-trailing-data",
  );
});
