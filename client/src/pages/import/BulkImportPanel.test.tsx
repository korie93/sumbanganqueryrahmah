import assert from "node:assert/strict";
import test from "node:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BulkImportPanel } from "@/pages/import/BulkImportPanel";

test("BulkImportPanel exposes a programmatic label for the hidden bulk file input", () => {
  const markup = renderToStaticMarkup(
    createElement(BulkImportPanel, {
      bulkFiles: [],
      bulkInputRef: createRef<HTMLInputElement>(),
      bulkProcessing: false,
      bulkProgress: 0,
      bulkResults: [],
      maxUploadSizeLabel: "10 MB",
      onBulkDrop: () => undefined,
      onBulkDragOver: () => undefined,
      onBulkFileSelect: () => undefined,
      onClearBulk: () => undefined,
      onStartBulkImport: () => undefined,
    }),
  );

  assert.match(markup, /<label for="bulk-import-file-input" class="sr-only">Select bulk import files<\/label>/);
  assert.match(markup, /id="bulk-import-file-input"/);
  assert.match(markup, /aria-label="Select bulk import files"/);
});
