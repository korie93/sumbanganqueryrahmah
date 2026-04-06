import assert from "node:assert/strict";
import test from "node:test";
import { inferMimeTypeFromReceiptPath } from "../collection-bootstrap-records-shared";

test("inferMimeTypeFromReceiptPath maps supported receipt extensions", () => {
  assert.equal(inferMimeTypeFromReceiptPath("/uploads/receipt.pdf"), "application/pdf");
  assert.equal(inferMimeTypeFromReceiptPath("/uploads/receipt.PNG"), "image/png");
  assert.equal(inferMimeTypeFromReceiptPath("/uploads/receipt.jpeg"), "image/jpeg");
  assert.equal(inferMimeTypeFromReceiptPath("/uploads/receipt.unknown"), "application/octet-stream");
});
