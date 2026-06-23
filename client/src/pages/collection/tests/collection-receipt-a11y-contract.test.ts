import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readCollectionSource(fileName: string): string {
  return readFileSync(path.resolve(process.cwd(), "client/src/pages/collection", fileName), "utf8");
}

const receiptPanelSource = readCollectionSource("CollectionReceiptPanel.tsx");
const receiptDraftCardSource = readCollectionSource("CollectionReceiptDraftCard.tsx");

test("collection receipt existing metadata inputs have explicit accessible names", () => {
  assert.match(receiptPanelSource, /const existingReceiptLabel = formatCollectionReceiptFileName\(/);
  assert.match(receiptPanelSource, /title=\{existingReceiptLabel\}/);
  assert.match(receiptPanelSource, /aria-label=\{existingReceiptLabel\}/);
  assert.match(receiptPanelSource, /aria-label=\{`Existing receipt amount for \$\{existingReceiptLabel\}`\}/);
  assert.match(receiptPanelSource, /aria-label=\{`Existing receipt date for \$\{existingReceiptLabel\}`\}/);
  assert.match(receiptPanelSource, /aria-label=\{`Existing receipt reference for \$\{existingReceiptLabel\}`\}/);
});

test("collection receipt decorative icons are hidden from assistive technology", () => {
  assert.match(receiptPanelSource, /<RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" \/>/);
  assert.match(receiptDraftCardSource, /<FileImage className="h-9 w-9" aria-hidden="true" \/>/);
  assert.match(receiptDraftCardSource, /<FileText className="h-9 w-9" aria-hidden="true" \/>/);
  assert.match(receiptDraftCardSource, /<Trash2 className="mr-2 h-4 w-4" aria-hidden="true" \/>/);
});
