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
      importName: "large-import",
      loading: false,
      maxUploadSizeLabel: "96 MB",
      onClear: () => undefined,
      onDrop: () => undefined,
      onDragOver: () => undefined,
      onFileChange: () => undefined,
      onImportNameChange: () => undefined,
      onSave: () => undefined,
      parsedData: [],
      previewDeferred: true,
    }),
  );

  assert.match(markup, /Ready for Server Validation/);
  assert.match(markup, /Memory-safe upload mode/);
  assert.match(markup, /data-testid="button-save"/);
  assert.doesNotMatch(markup, /<table/);
});
