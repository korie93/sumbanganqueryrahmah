import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalysisComparison,
  filterAnalysisComparisonColumns,
  formatAnalysisComparisonDelta,
} from "@/pages/analysis/analysis-comparison-utils";
import type {
  AnalysisColumnProfile,
  AnalysisData,
  SingleAnalysisResult,
} from "@/pages/analysis/types";

function createProfile(
  name: string,
  overrides: Partial<AnalysisColumnProfile> = {},
): AnalysisColumnProfile {
  return {
    name,
    inferredType: "text",
    applicableRows: 10,
    populatedCount: 10,
    emptyCount: 0,
    completenessPercent: 100,
    typeConsistencyPercent: 100,
    uniqueCount: 10,
    uniqueCountIsApproximate: false,
    duplicateCount: 0,
    typeDistribution: {
      boolean: 0,
      date: 0,
      number: 0,
      structured: 0,
      text: 10,
    },
    ...overrides,
  };
}

function createAnalysis(
  columns: AnalysisColumnProfile[],
  qualityOverrides: Partial<AnalysisData["quality"]> = {},
): AnalysisData {
  return {
    icLelaki: { count: 0, samples: [] },
    icPerempuan: { count: 0, samples: [] },
    noPolis: { count: 0, samples: [] },
    noTentera: { count: 0, samples: [] },
    passportMY: { count: 0, samples: [] },
    passportLuarNegara: { count: 0, samples: [] },
    duplicates: { count: 0, items: [] },
    quality: {
      score: 90,
      grade: "good",
      completenessPercent: 90,
      typeConsistencyPercent: 90,
      profiledColumns: columns.length,
      columnsNeedingReview: 0,
      columnsWithMissingValues: 0,
      mixedTypeColumns: 0,
      limitedCardinalityColumns: 0,
      totalApplicableCells: columns.length * 10,
      populatedCells: columns.length * 10,
      emptyCells: 0,
      columnLimitReached: false,
      ...qualityOverrides,
    },
    columns,
  };
}

function createResult(
  id: string,
  totalRows: number,
  analysis: AnalysisData,
): SingleAnalysisResult {
  return {
    import: {
      id,
      name: `File ${id}`,
      filename: `${id}.xlsx`,
    },
    totalRows,
    analysis,
  };
}

test("analysis comparison reports row, quality, and schema differences", () => {
  const baseline = createResult(
    "baseline",
    100,
    createAnalysis([
      createProfile("Stable"),
      createProfile("Changed"),
      createProfile("Removed"),
    ]),
  );
  const current = createResult(
    "current",
    125,
    createAnalysis(
      [
        createProfile("Stable"),
        createProfile("Changed", {
          inferredType: "number",
          completenessPercent: 80,
          typeConsistencyPercent: 75,
        }),
        createProfile("Added"),
      ],
      {
        score: 84,
        completenessPercent: 86,
        typeConsistencyPercent: 82,
        columnsNeedingReview: 1,
      },
    ),
  );

  const comparison = buildAnalysisComparison(baseline, current);

  assert.equal(comparison.rowDelta, 25);
  assert.equal(comparison.rowDeltaPercent, 25);
  assert.equal(comparison.changedColumns, 1);
  assert.equal(comparison.addedColumns, 1);
  assert.equal(comparison.removedColumns, 1);
  assert.deepEqual(
    comparison.columns.map((column) => [column.name, column.status]),
    [
      ["Changed", "changed"],
      ["Added", "added"],
      ["Removed", "removed"],
      ["Stable", "unchanged"],
    ],
  );
  assert.equal(comparison.metrics[0]?.delta, -6);
  assert.equal(comparison.metrics[3]?.current, 66.7);
});

test("analysis comparison filtering defaults cleanly to schema changes", () => {
  const comparison = buildAnalysisComparison(
    createResult(
      "baseline",
      10,
      createAnalysis([createProfile("Stable"), createProfile("Legacy Field")]),
    ),
    createResult(
      "current",
      10,
      createAnalysis([createProfile("Stable"), createProfile("New Field")]),
    ),
  );

  assert.deepEqual(
    filterAnalysisComparisonColumns(comparison.columns, "", true).map(
      (column) => column.name,
    ),
    ["New Field", "Legacy Field"],
  );
  assert.deepEqual(
    filterAnalysisComparisonColumns(comparison.columns, "legacy", false).map(
      (column) => column.name,
    ),
    ["Legacy Field"],
  );
  assert.equal(formatAnalysisComparisonDelta(4.5), "+4.5 pts");
  assert.equal(formatAnalysisComparisonDelta(-2, "%"), "-2%");
  assert.equal(formatAnalysisComparisonDelta(0), "0 pts");
});
