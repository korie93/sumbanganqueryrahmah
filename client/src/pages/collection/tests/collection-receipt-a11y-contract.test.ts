import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionReceiptPanel } from "../CollectionReceiptPanel";

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

test("the visible receipt upload describes supported formats and file size without repeated empty messages", () => {
  const markup = renderToStaticMarkup(createElement(CollectionReceiptPanel, {
    pendingFiles: [], inputRef: { current: null },
    onFileChange: () => undefined, onRemovePending: () => undefined,
  }));
  const helperId = markup.match(/<p id="([^"]+-help)"/)?.[1];
  assert.ok(helperId);
  const uploadButton = markup.match(/<button[^>]*>Upload Receipt<\/button>/)?.[0];
  assert.ok(uploadButton);
  assert.ok(uploadButton.includes(`aria-describedby="${helperId}"`));
  assert.match(markup, /JPG, JPEG, PNG, WEBP or PDF, up to 5MB each/);
  assert.match(markup, /No pending receipt\./);
  assert.doesNotMatch(markup, /No receipt selected yet|Pending Receipts/);
});
