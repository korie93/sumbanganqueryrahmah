import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBulkImportSelectionResults,
  filterSupportedImportFiles,
  resolveNextImportName,
  summarizeBulkImportResults,
} from "@/pages/import/import-page-state-utils";

function createFile(name: string, size = 1024) {
  return new File(["test"], name, { type: "text/plain", lastModified: 1, });
}

test("filterSupportedImportFiles keeps only supported spreadsheet uploads", () => {
  const files = [
    createFile("alpha.csv"),
    createFile("beta.xlsx"),
    createFile("gamma.xlsb"),
    createFile("notes.txt"),
  ];

  assert.deepEqual(
    filterSupportedImportFiles(files).map((file) => file.name),
    ["alpha.csv", "beta.xlsx", "gamma.xlsb"],
  );
});

test("buildBulkImportSelectionResults blocks oversized import files and keeps supported files pending", () => {
  const smallFile = new File(["small"], "small.csv");
  const bigFile = new File([new Uint8Array(10)], "big.csv");
  Object.defineProperty(bigFile, "size", { value: 10_000_000 });

  const results = buildBulkImportSelectionResults([smallFile, bigFile], 1_000_000);
  assert.equal(results[0].status, "pending");
  assert.equal(results[0].blocked, undefined);
  assert.equal(results[1].status, "error");
  assert.equal(results[1].blocked, true);
  assert.match(results[1].error ?? "", /upload limit/i);
});

test("resolveNextImportName preserves manual names and otherwise strips file extensions", () => {
  assert.equal(resolveNextImportName("Manual Name", "sales.xlsx"), "Manual Name");
  assert.equal(resolveNextImportName("", "sales.xlsx"), "sales");
});

test("summarizeBulkImportResults keeps success, failure, and blocked counts separate", () => {
  assert.deepEqual(
    summarizeBulkImportResults([
      { filename: "a.csv", status: "success" },
      { filename: "b.csv", status: "error", error: "nope" },
      { filename: "c.csv", status: "error", blocked: true, error: "too large" },
    ]),
    {
      successCount: 1,
      blockedErrorCount: 1,
      errorCount: 1,
    },
  );
});
