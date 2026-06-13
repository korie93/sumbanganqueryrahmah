import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisComparisonSection } from "@/pages/analysis/AnalysisComparisonSection";
import type { AllAnalysisResult } from "@/pages/analysis/types";

const allResult: AllAnalysisResult = {
  totalImports: 2,
  totalRows: 30,
  imports: [
    {
      id: "current",
      name: "Current File",
      filename: "current.xlsx",
      rowCount: 20,
    },
    {
      id: "baseline",
      name: "Baseline File",
      filename: "baseline.xlsx",
      rowCount: 10,
    },
  ],
  analysis: {
    icLelaki: { count: 0, samples: [] },
    icPerempuan: { count: 0, samples: [] },
    noPolis: { count: 0, samples: [] },
    noTentera: { count: 0, samples: [] },
    passportMY: { count: 0, samples: [] },
    passportLuarNegara: { count: 0, samples: [] },
    duplicates: { count: 0, items: [] },
    quality: {
      score: 100,
      grade: "excellent",
      completenessPercent: 100,
      typeConsistencyPercent: 100,
      profiledColumns: 0,
      columnsNeedingReview: 0,
      columnsWithMissingValues: 0,
      mixedTypeColumns: 0,
      limitedCardinalityColumns: 0,
      totalApplicableCells: 0,
      populatedCells: 0,
      emptyCells: 0,
      columnLimitReached: false,
    },
    columns: [],
  },
};

test("AnalysisComparisonSection renders compact, labelled comparison controls", () => {
  const markup = renderToStaticMarkup(
    createElement(AnalysisComparisonSection, { allResult }),
  );

  assert.match(markup, /Compare Saved Files/);
  assert.match(markup, /Baseline file/);
  assert.match(markup, /Compare file/);
  assert.match(markup, /button-run-analysis-comparison/);
  assert.match(markup, /Choose a baseline and a newer file/);
  assert.match(markup, /aria-live="polite"/);
});

test("AnalysisComparisonSection stays hidden when fewer than two files exist", () => {
  const markup = renderToStaticMarkup(
    createElement(AnalysisComparisonSection, {
      allResult: {
        ...allResult,
        totalImports: 1,
        imports: allResult.imports.slice(0, 1),
      },
    }),
  );

  assert.equal(markup, "");
});
