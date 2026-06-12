import assert from "node:assert/strict";
import test from "node:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SingleImportPanel } from "@/pages/import/SingleImportPanel";

test("SingleImportPanel exposes memory-safe server validation for large files", () => {
  const file = new File(["large"], "large-import.xlsx");
  const markup = renderToStaticMarkup(
    createElement(SingleImportPanel, {
      error: "",
      file,
      fileInputRef: createRef<HTMLInputElement>(),
      headers: [],
      columnMapping: [],
      backgroundJob: null,
      importName: "large-import",
      loading: false,
      maxUploadSizeLabel: "96 MB",
      onClear: () => undefined,
      onDrop: () => undefined,
      onDragOver: () => undefined,
      onFileChange: () => undefined,
      onColumnMappingChange: () => undefined,
      onCancelBackgroundJob: () => undefined,
      onResumeBackgroundJob: () => undefined,
      onImportNameChange: () => undefined,
      onSave: () => undefined,
      parsedData: [],
      previewDeferred: true,
    }),
  );

  assert.match(markup, /Ready for server validation/);
  assert.match(markup, /Memory-safe upload mode/);
  assert.match(markup, /data-testid="button-import-next"/);
  assert.match(markup, /Import summary/);
  assert.doesNotMatch(markup, /<table/);
});

test("SingleImportPanel presents a four-step guided workflow before file selection", () => {
  const markup = renderToStaticMarkup(
    createElement(SingleImportPanel, {
      error: "",
      file: null,
      fileInputRef: createRef<HTMLInputElement>(),
      headers: [],
      columnMapping: [],
      backgroundJob: null,
      importName: "",
      loading: false,
      maxUploadSizeLabel: "96 MB",
      onClear: () => undefined,
      onDrop: () => undefined,
      onDragOver: () => undefined,
      onFileChange: () => undefined,
      onColumnMappingChange: () => undefined,
      onCancelBackgroundJob: () => undefined,
      onResumeBackgroundJob: () => undefined,
      onImportNameChange: () => undefined,
      onSave: () => undefined,
      parsedData: [],
      previewDeferred: false,
    }),
  );

  assert.match(markup, /aria-label="Import workflow progress"/);
  assert.match(markup, /aria-current="step"/);
  assert.match(markup, /Select file/);
  assert.match(markup, /Map columns/);
  assert.match(markup, /Review data/);
  assert.match(markup, /Run import/);
  assert.match(markup, /Choose the source file/);
});
