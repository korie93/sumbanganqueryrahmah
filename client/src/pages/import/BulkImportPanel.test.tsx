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

test("BulkImportPanel shows selected file sizes without reading file contents", () => {
  const markup = renderToStaticMarkup(
    createElement(BulkImportPanel, {
      bulkFiles: [new File(["small"], "customers.csv")],
      bulkInputRef: createRef<HTMLInputElement>(),
      bulkProcessing: false,
      bulkProgress: 0,
      bulkResults: [
        {
          id: "customers.csv:5242880:1:0",
          filename: "customers.csv",
          sizeBytes: 5 * 1024 * 1024,
          status: "pending",
        },
      ],
      maxUploadSizeLabel: "10 MB",
      onBulkDrop: () => undefined,
      onBulkDragOver: () => undefined,
      onBulkFileSelect: () => undefined,
      onClearBulk: () => undefined,
      onStartBulkImport: () => undefined,
    }),
  );

  assert.match(markup, /customers\.csv/);
  assert.match(markup, /5\.0 MB/);
});

test("BulkImportPanel offers retry only when completed files include retryable failures", () => {
  const markup = renderToStaticMarkup(
    createElement(BulkImportPanel, {
      bulkFiles: [
        new File(["ok"], "success.csv"),
        new File(["retry"], "failed.csv"),
      ],
      bulkInputRef: createRef<HTMLInputElement>(),
      bulkProcessing: false,
      bulkProgress: 100,
      bulkResults: [
        {
          id: "success",
          filename: "success.csv",
          rowCount: 2,
          status: "success",
        },
        {
          id: "failed",
          filename: "failed.csv",
          error: "Temporary server error",
          status: "error",
        },
      ],
      maxUploadSizeLabel: "10 MB",
      onBulkDrop: () => undefined,
      onBulkDragOver: () => undefined,
      onBulkFileSelect: () => undefined,
      onClearBulk: () => undefined,
      onStartBulkImport: () => undefined,
    }),
  );

  assert.match(markup, />Retry failed</);
  assert.match(markup, /2 rows imported/);
  assert.doesNotMatch(markup, />Start import</);
});

test("BulkImportPanel presents a compact queue summary for selected files", () => {
  const markup = renderToStaticMarkup(
    createElement(BulkImportPanel, {
      bulkFiles: [
        new File(["ready"], "ready.csv"),
        new File(["blocked"], "blocked.csv"),
      ],
      bulkInputRef: createRef<HTMLInputElement>(),
      bulkProcessing: false,
      bulkProgress: 0,
      bulkResults: [
        {
          id: "ready",
          filename: "ready.csv",
          sizeBytes: 5,
          status: "pending",
        },
        {
          id: "blocked",
          filename: "blocked.csv",
          sizeBytes: 7,
          status: "error",
          blocked: true,
          error: "File exceeds the upload limit.",
        },
      ],
      maxUploadSizeLabel: "10 MB",
      onBulkDrop: () => undefined,
      onBulkDragOver: () => undefined,
      onBulkFileSelect: () => undefined,
      onClearBulk: () => undefined,
      onStartBulkImport: () => undefined,
    }),
  );

  assert.match(markup, /Bulk import queue/);
  assert.match(markup, /aria-label="Bulk import summary"/);
  assert.match(markup, /Queue summary/);
  assert.match(markup, /1 ready/);
  assert.match(markup, /1 too large/);
  assert.match(markup, /Oversized files are skipped automatically/);
});
