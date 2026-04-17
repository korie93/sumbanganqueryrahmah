import test from "node:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BulkImportPanel } from "@/pages/import/BulkImportPanel";
import { SingleImportPanel } from "@/pages/import/SingleImportPanel";
import { assertNoAccessibilityViolations } from "@/test-utils/axe";

function renderWithinMain(node: ReturnType<typeof createElement>) {
  return `<!doctype html><html lang="ms"><body>${
    renderToStaticMarkup(createElement("main", { "aria-label": "Import accessibility preview" }, node))
  }</body></html>`;
}

test("SingleImportPanel preview flow has no obvious axe violations", async () => {
  const file = new File(["name,amount\nAli,10"], "collections.csv", {
    type: "text/csv",
  });
  const html = renderWithinMain(
    createElement(SingleImportPanel, {
      error: "",
      file,
      fileInputRef: createRef<HTMLInputElement>(),
      headers: ["name", "amount"],
      importName: "Daily Collections",
      loading: false,
      maxUploadSizeLabel: "10 MB",
      onClear: () => undefined,
      onDrop: () => undefined,
      onDragOver: () => undefined,
      onFileChange: () => undefined,
      onImportNameChange: () => undefined,
      onSave: () => undefined,
      parsedData: [
        { name: "Ali", amount: "10" },
        { name: "Siti", amount: "15" },
      ],
    }),
  );

  await assertNoAccessibilityViolations(html);
});

test("BulkImportPanel progress and error summary remain accessible", async () => {
  const html = renderWithinMain(
    createElement(BulkImportPanel, {
      bulkFiles: [
        new File(["a"], "alpha.csv", { type: "text/csv" }),
        new File(["b"], "beta.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      ],
      bulkInputRef: createRef<HTMLInputElement>(),
      bulkProcessing: false,
      bulkProgress: 75,
      bulkResults: [
        {
          id: "one",
          filename: "alpha.csv",
          status: "success",
          rowCount: 12,
          blocked: false,
        },
        {
          id: "two",
          filename: "beta.xlsx",
          status: "error",
          error: "Header mismatch",
          blocked: false,
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

  await assertNoAccessibilityViolations(html);
});
