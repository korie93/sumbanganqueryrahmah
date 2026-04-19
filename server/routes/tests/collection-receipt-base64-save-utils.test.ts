import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_RECEIPT_MAX_BYTES } from "../collection-receipt-file-type-utils";
import { estimateCollectionReceiptDecodedSizeFromBase64 } from "../collection-receipt-base64-save-utils";

test("estimateCollectionReceiptDecodedSizeFromBase64 handles valid prefixed payloads", () => {
  const payload = Buffer.from("receipt-check", "utf8").toString("base64");

  assert.equal(
    estimateCollectionReceiptDecodedSizeFromBase64(`data:image/png;base64,${payload}`),
    Buffer.byteLength("receipt-check"),
  );
});

test("estimateCollectionReceiptDecodedSizeFromBase64 returns null for invalid base64 input", () => {
  assert.equal(estimateCollectionReceiptDecodedSizeFromBase64("not@base64"), null);
  assert.equal(estimateCollectionReceiptDecodedSizeFromBase64(""), null);
});

test("estimateCollectionReceiptDecodedSizeFromBase64 distinguishes borderline valid and oversize payloads", () => {
  const maxAllowedPayload = Buffer.alloc(COLLECTION_RECEIPT_MAX_BYTES, 1).toString("base64");
  const oversizePayload = Buffer.alloc(COLLECTION_RECEIPT_MAX_BYTES + 1, 1).toString("base64");

  assert.equal(
    estimateCollectionReceiptDecodedSizeFromBase64(maxAllowedPayload),
    COLLECTION_RECEIPT_MAX_BYTES,
  );
  assert.equal(
    estimateCollectionReceiptDecodedSizeFromBase64(oversizePayload),
    COLLECTION_RECEIPT_MAX_BYTES + 1,
  );
});
