import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisDataQualitySection } from "@/pages/analysis/AnalysisDataQualitySection";
import type { AnalysisData } from "@/pages/analysis/types";

const analysis: AnalysisData = {
  icLelaki: { count: 0, samples: [] },
  icPerempuan: { count: 0, samples: [] },
  noPolis: { count: 0, samples: [] },
  noTentera: { count: 0, samples: [] },
  passportMY: { count: 0, samples: [] },
  passportLuarNegara: { count: 0, samples: [] },
  duplicates: { count: 0, items: [] },
  quality: {
    score: 82,
    grade: "review",
    completenessPercent: 80,
    typeConsistencyPercent: 87,
    profiledColumns: 1,
    columnsNeedingReview: 1,
    columnsWithMissingValues: 1,
    mixedTypeColumns: 1,
    limitedCardinalityColumns: 0,
    totalApplicableCells: 10,
    populatedCells: 8,
    emptyCells: 2,
    columnLimitReached: false,
  },
  columns: [{
    name: "Account Number",
    inferredType: "mixed",
    applicableRows: 10,
    populatedCount: 8,
    emptyCount: 2,
    completenessPercent: 80,
    typeConsistencyPercent: 75,
    uniqueCount: 8,
    uniqueCountIsApproximate: false,
    duplicateCount: 0,
    typeDistribution: {
      boolean: 0,
      date: 0,
      number: 6,
      structured: 0,
      text: 2,
    },
  }],
};

test("AnalysisDataQualitySection renders an accessible score and single-file drill-down", () => {
  const markup = renderToStaticMarkup(createElement(AnalysisDataQualitySection, {
    analysis,
    mode: "single",
    onInspectColumn: () => undefined,
  }));

  assert.match(markup, /Data Quality/);
  assert.match(markup, /82% - Needs review/);
  assert.match(markup, /aria-valuenow="82"/);
  assert.match(markup, /Account Number/);
  assert.match(markup, /Inspect Account Number in Viewer/);
});

test("AnalysisDataQualitySection explains why all-file mode has no Viewer drill-down", () => {
  const markup = renderToStaticMarkup(createElement(AnalysisDataQualitySection, {
    analysis,
    mode: "all",
    onInspectColumn: () => undefined,
  }));

  assert.doesNotMatch(markup, />Inspect</);
  assert.match(markup, /Select Analyze on a single Saved file/);
});
