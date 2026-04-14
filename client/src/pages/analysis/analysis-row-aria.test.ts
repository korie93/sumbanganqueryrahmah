import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalysisDuplicateRowAriaLabel,
  buildAnalysisFileRowAriaLabel,
} from "@/pages/analysis/analysis-row-aria";

test("buildAnalysisFileRowAriaLabel summarizes analyzed file metadata", () => {
  assert.equal(
    buildAnalysisFileRowAriaLabel({
      index: 4,
      item: {
        id: "imp-1",
        name: "April Batch",
        filename: "APRIL-BATCH.xlsx",
        rowCount: 1620,
      },
    }),
    "Analyzed file 4, name April Batch, filename APRIL-BATCH.xlsx, 1,620 rows",
  );
});

test("buildAnalysisDuplicateRowAriaLabel summarizes duplicate values", () => {
  assert.equal(
    buildAnalysisDuplicateRowAriaLabel({
      duplicate: {
        value: "900101011234",
        count: 7,
      },
      index: 2,
    }),
    "Duplicate value 2, value 900101011234, appears 7 times",
  );
});
