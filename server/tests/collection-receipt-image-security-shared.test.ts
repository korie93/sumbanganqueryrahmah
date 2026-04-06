import assert from "node:assert/strict";
import test from "node:test";
import {
  readUInt24LE,
  validateImageDimensions,
} from "../lib/collection-receipt-image-security-shared";
import { CollectionReceiptSecurityError } from "../lib/collection-receipt-security";

test("readUInt24LE parses 24-bit little-endian values and guards invalid ranges", () => {
  const buffer = Buffer.from([0x34, 0x12, 0xab, 0xff]);

  assert.equal(readUInt24LE(buffer, 0), 0xab1234);
  assert.equal(readUInt24LE(buffer, -1), null);
  assert.equal(readUInt24LE(buffer, 2), null);
});

test("validateImageDimensions preserves valid image dimensions", () => {
  assert.deepEqual(validateImageDimensions({ width: 1200, height: 800 }), {
    width: 1200,
    height: 800,
  });
});

test("validateImageDimensions rejects zero and invalid image dimensions", () => {
  assert.throws(
    () => validateImageDimensions({ width: 0, height: 10 }),
    (error: unknown) =>
      error instanceof CollectionReceiptSecurityError
      && error.reasonCode === "image-dimensions-invalid",
  );

  assert.throws(
    () => validateImageDimensions(null),
    (error: unknown) =>
      error instanceof CollectionReceiptSecurityError
      && error.reasonCode === "image-dimensions-unverified",
  );
});
