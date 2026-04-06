import assert from "node:assert/strict";
import test from "node:test";

import {
  getAnalysisSpecialIdPagedSections,
  resolveAnalysisDataset,
} from "@/pages/analysis/analysis-page-state-utils";
import type { AllAnalysisResult, AnalysisData, SingleAnalysisResult } from "@/pages/analysis/types";

const analysis: AnalysisData = {
  icLelaki: { count: 12, samples: ["900101-01-1111"] },
  icPerempuan: { count: 18, samples: ["900101-02-1111"] },
  noPolis: { count: 2, samples: ["P123", "P456"] },
  noTentera: { count: 1, samples: ["T123"] },
  passportMY: { count: 1, samples: ["A1234567"] },
  passportLuarNegara: { count: 2, samples: ["X123", "X456"] },
  duplicates: { count: 3, items: [{ value: "900101-01-1111", count: 2 }] },
};

const singleResult: SingleAnalysisResult = {
  import: { id: "imp-1", name: "Single", filename: "single.xlsx" },
  totalRows: 48,
  analysis,
};

const allResult: AllAnalysisResult = {
  totalImports: 4,
  totalRows: 120,
  imports: [],
  analysis,
};

test("resolveAnalysisDataset follows the active analysis mode", () => {
  assert.deepEqual(
    resolveAnalysisDataset({
      mode: "single",
      singleResult,
      allResult,
    }),
    {
      analysis,
      totalRows: 48,
    },
  );

  assert.deepEqual(
    resolveAnalysisDataset({
      mode: "all",
      singleResult,
      allResult,
    }),
    {
      analysis,
      totalRows: 120,
    },
  );
});

test("getAnalysisSpecialIdPagedSections returns stable paged sections", () => {
  const sections = getAnalysisSpecialIdPagedSections(analysis, {});

  assert.deepEqual(sections.polis.items, ["P123", "P456"]);
  assert.deepEqual(sections.tentera.items, ["T123"]);
  assert.deepEqual(sections.passportMY.items, ["A1234567"]);
  assert.deepEqual(sections.passportLN.items, ["X123", "X456"]);
});
