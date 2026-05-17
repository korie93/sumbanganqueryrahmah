import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDuplicateReceiptSummary,
  findDuplicateReceiptFiles,
} from "../collection-receipt-duplicate-utils";

function createReceiptFile(name: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type: "image/jpeg" });
}

test("findDuplicateReceiptFiles groups files by normalized name and size", () => {
  const groups = findDuplicateReceiptFiles([
    createReceiptFile("Receipt.JPG", 12),
    createReceiptFile("receipt.jpg", 12),
    createReceiptFile("receipt.jpg", 14),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.indexes, [0, 1]);
  assert.equal(groups[0]?.fileName, "Receipt.JPG");
});

test("findDuplicateReceiptFiles ignores same names with different sizes", () => {
  const groups = findDuplicateReceiptFiles([
    createReceiptFile("receipt.jpg", 12),
    createReceiptFile("receipt.jpg", 13),
  ]);

  assert.equal(groups.length, 0);
});

test("buildDuplicateReceiptSummary stays empty when there are no duplicate groups", () => {
  assert.equal(buildDuplicateReceiptSummary([]), "");
});

test("buildDuplicateReceiptSummary reports duplicated upload count", () => {
  const groups = findDuplicateReceiptFiles([
    createReceiptFile("receipt.jpg", 12),
    createReceiptFile("receipt.jpg", 12),
  ]);

  assert.match(buildDuplicateReceiptSummary(groups), /2 pending uploads/i);
});
