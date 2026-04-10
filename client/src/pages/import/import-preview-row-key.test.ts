import assert from "node:assert/strict";
import test from "node:test";
import { getImportPreviewRowKey } from "@/pages/import/import-preview-row-key";
import type { ImportRow } from "@/pages/import/types";

test("getImportPreviewRowKey stays stable for the same row object", () => {
  const row: ImportRow = {
    account: "1001",
    customer: "Aisyah",
  };

  assert.equal(getImportPreviewRowKey(row), getImportPreviewRowKey(row));
});

test("getImportPreviewRowKey does not collapse different rows with the same values", () => {
  const firstRow: ImportRow = {
    account: "1001",
    customer: "Aisyah",
  };
  const secondRow: ImportRow = {
    account: "1001",
    customer: "Aisyah",
  };

  assert.notEqual(getImportPreviewRowKey(firstRow), getImportPreviewRowKey(secondRow));
});
