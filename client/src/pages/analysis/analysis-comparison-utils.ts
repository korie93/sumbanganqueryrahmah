import type {
  AnalysisColumnProfile,
  SingleAnalysisResult,
} from "@/pages/analysis/types";

export const ANALYSIS_COMPARISON_PAGE_SIZE = 8;

export type AnalysisComparisonColumnStatus =
  | "added"
  | "changed"
  | "removed"
  | "unchanged";

export type AnalysisComparisonColumn = {
  name: string;
  status: AnalysisComparisonColumnStatus;
  baseline: AnalysisColumnProfile | null;
  current: AnalysisColumnProfile | null;
  completenessDelta: number | null;
  consistencyDelta: number | null;
};

export type AnalysisComparisonMetric = {
  key: "quality" | "completeness" | "consistency" | "reviewReady";
  label: string;
  baseline: number;
  current: number;
  delta: number;
};

export type AnalysisComparison = {
  baseline: SingleAnalysisResult["import"] & { totalRows: number };
  current: SingleAnalysisResult["import"] & { totalRows: number };
  rowDelta: number;
  rowDeltaPercent: number | null;
  metrics: AnalysisComparisonMetric[];
  columns: AnalysisComparisonColumn[];
  changedColumns: number;
  addedColumns: number;
  removedColumns: number;
};

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function getReviewReadyPercent(result: SingleAnalysisResult): number {
  const profiledColumns = result.analysis.quality.profiledColumns;
  if (profiledColumns === 0) return 100;

  return roundToSingleDecimal(
    ((profiledColumns - result.analysis.quality.columnsNeedingReview) /
      profiledColumns) *
      100,
  );
}

function getColumnStatus(
  baseline: AnalysisColumnProfile | null,
  current: AnalysisColumnProfile | null,
): AnalysisComparisonColumnStatus {
  if (!baseline) return "added";
  if (!current) return "removed";

  if (
    baseline.inferredType !== current.inferredType ||
    baseline.completenessPercent !== current.completenessPercent ||
    baseline.typeConsistencyPercent !== current.typeConsistencyPercent
  ) {
    return "changed";
  }

  return "unchanged";
}

function buildComparisonColumns(
  baselineColumns: AnalysisColumnProfile[],
  currentColumns: AnalysisColumnProfile[],
): AnalysisComparisonColumn[] {
  const baselineByName = new Map(
    baselineColumns.map((column) => [column.name, column]),
  );
  const currentByName = new Map(
    currentColumns.map((column) => [column.name, column]),
  );
  const columnNames = new Set([
    ...baselineByName.keys(),
    ...currentByName.keys(),
  ]);
  const statusOrder: Record<AnalysisComparisonColumnStatus, number> = {
    changed: 0,
    added: 1,
    removed: 2,
    unchanged: 3,
  };

  return [...columnNames]
    .map((name): AnalysisComparisonColumn => {
      const baseline = baselineByName.get(name) ?? null;
      const current = currentByName.get(name) ?? null;

      return {
        name,
        status: getColumnStatus(baseline, current),
        baseline,
        current,
        completenessDelta:
          baseline && current
            ? roundToSingleDecimal(
                current.completenessPercent - baseline.completenessPercent,
              )
            : null,
        consistencyDelta:
          baseline && current
            ? roundToSingleDecimal(
                current.typeConsistencyPercent -
                  baseline.typeConsistencyPercent,
              )
            : null,
      };
    })
    .sort(
      (left, right) =>
        statusOrder[left.status] - statusOrder[right.status] ||
        left.name.localeCompare(right.name),
    );
}

export function buildAnalysisComparison(
  baselineResult: SingleAnalysisResult,
  currentResult: SingleAnalysisResult,
): AnalysisComparison {
  const baselineQuality = baselineResult.analysis.quality;
  const currentQuality = currentResult.analysis.quality;
  const baselineReviewReady = getReviewReadyPercent(baselineResult);
  const currentReviewReady = getReviewReadyPercent(currentResult);
  const columns = buildComparisonColumns(
    baselineResult.analysis.columns,
    currentResult.analysis.columns,
  );
  const rowDelta = currentResult.totalRows - baselineResult.totalRows;

  return {
    baseline: {
      ...baselineResult.import,
      totalRows: baselineResult.totalRows,
    },
    current: {
      ...currentResult.import,
      totalRows: currentResult.totalRows,
    },
    rowDelta,
    rowDeltaPercent:
      baselineResult.totalRows > 0
        ? roundToSingleDecimal((rowDelta / baselineResult.totalRows) * 100)
        : null,
    metrics: [
      {
        key: "quality",
        label: "Quality score",
        baseline: baselineQuality.score,
        current: currentQuality.score,
        delta: currentQuality.score - baselineQuality.score,
      },
      {
        key: "completeness",
        label: "Completeness",
        baseline: baselineQuality.completenessPercent,
        current: currentQuality.completenessPercent,
        delta: roundToSingleDecimal(
          currentQuality.completenessPercent -
            baselineQuality.completenessPercent,
        ),
      },
      {
        key: "consistency",
        label: "Type consistency",
        baseline: baselineQuality.typeConsistencyPercent,
        current: currentQuality.typeConsistencyPercent,
        delta: roundToSingleDecimal(
          currentQuality.typeConsistencyPercent -
            baselineQuality.typeConsistencyPercent,
        ),
      },
      {
        key: "reviewReady",
        label: "Review-ready columns",
        baseline: baselineReviewReady,
        current: currentReviewReady,
        delta: roundToSingleDecimal(
          currentReviewReady - baselineReviewReady,
        ),
      },
    ],
    columns,
    changedColumns: columns.filter((column) => column.status === "changed").length,
    addedColumns: columns.filter((column) => column.status === "added").length,
    removedColumns: columns.filter((column) => column.status === "removed").length,
  };
}

export function filterAnalysisComparisonColumns(
  columns: AnalysisComparisonColumn[],
  query: string,
  changesOnly: boolean,
): AnalysisComparisonColumn[] {
  const normalizedQuery = query.trim().toLowerCase();

  return columns.filter((column) => {
    if (changesOnly && column.status === "unchanged") return false;
    if (!normalizedQuery) return true;

    return [
      column.name,
      column.status,
      column.baseline?.inferredType,
      column.current?.inferredType,
    ].some((value) => value?.toLowerCase().includes(normalizedQuery));
  });
}

export function formatAnalysisComparisonDelta(
  value: number,
  suffix = " pts",
): string {
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}
