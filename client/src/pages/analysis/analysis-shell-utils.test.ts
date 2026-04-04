import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalysisHeaderDescription,
  buildAnalysisSnapshotItems,
} from "@/pages/analysis/analysis-shell-utils";
import type { AllAnalysisResult, AnalysisData, SingleAnalysisResult } from "@/pages/analysis/types";

const analysis: AnalysisData = {
  icLelaki: { count: 12, samples: [] },
  icPerempuan: { count: 18, samples: [] },
  noPolis: { count: 2, samples: ["RF123"] },
  noTentera: { count: 1, samples: ["T123"] },
  passportMY: { count: 4, samples: ["A123"] },
  passportLuarNegara: { count: 3, samples: ["P123"] },
  duplicates: {
    count: 5,
    items: [
      { value: "900101015555", count: 2 },
      { value: "920202026666", count: 3 },
    ],
  },
};

const singleResult: SingleAnalysisResult = {
  import: {
    id: "import-1",
    name: "Single import",
    filename: "single-import.xlsx",
  },
  totalRows: 40,
  analysis,
};

const allResult: AllAnalysisResult = {
  totalImports: 3,
  totalRows: 120,
  imports: [],
  analysis,
};

test("buildAnalysisHeaderDescription keeps shared admin copy predictable", () => {
  assert.equal(
    buildAnalysisHeaderDescription({ importName: "Single import", mode: "all" }),
    "Review ID distribution, duplicate pressure, and special record types across all saved imports.",
  );
  assert.equal(
    buildAnalysisHeaderDescription({ importName: "Single import", mode: "single" }),
    "Review ID distribution, duplicate pressure, and special record types for Single import.",
  );
});

test("buildAnalysisSnapshotItems summarizes scope, rows, duplicates, and special IDs", () => {
  assert.deepEqual(
    buildAnalysisSnapshotItems({
      allResult,
      analysis,
      mode: "single",
      singleResult,
      totalRows: 40,
    }),
    [
      {
        label: "Scope",
        value: "Single File",
        supporting: "single-import.xlsx",
      },
      {
        label: "Rows",
        value: "40",
        supporting: "40 analyzed rows",
      },
      {
        label: "Duplicates",
        value: "5",
        supporting: "Repeated IDs need review",
        tone: "warning",
      },
      {
        label: "Special IDs",
        value: "10",
        supporting: "Police, military, and passport records",
      },
    ],
  );

  assert.deepEqual(
    buildAnalysisSnapshotItems({
      allResult,
      analysis,
      mode: "all",
      singleResult: null,
      totalRows: 120,
    })[0],
    {
      label: "Scope",
      value: "All Files",
      supporting: "3 imports combined",
    },
  );
});
