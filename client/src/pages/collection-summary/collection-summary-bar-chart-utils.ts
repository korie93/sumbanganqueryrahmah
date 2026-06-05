import type { CollectionMonthlySummary } from "@/lib/api";

export type CollectionSummaryBarChartDatum = {
  month: number;
  label: string;
  shortLabel: string;
  totalAmount: number;
  totalRecords: number;
  hasData: boolean;
};

function toSafeNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function toSafeMonth(value: unknown): number | null {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return month;
}

function toSafeMonthLabel(row: CollectionMonthlySummary, month: number): string {
  const label = String(row.monthName || "").trim();
  return label || `Month ${month}`;
}

export function buildCollectionSummaryBarChartData(
  summaryRows: readonly CollectionMonthlySummary[] | null | undefined,
): CollectionSummaryBarChartDatum[] {
  if (!Array.isArray(summaryRows)) {
    return [];
  }

  return summaryRows
    .map((row) => {
      const month = toSafeMonth(row?.month);
      if (month === null) {
        return null;
      }

      const label = toSafeMonthLabel(row, month);
      const totalAmount = toSafeNonNegativeNumber(row.totalAmount);
      const totalRecords = Math.trunc(toSafeNonNegativeNumber(row.totalRecords));

      return {
        month,
        label,
        shortLabel: label.slice(0, 3),
        totalAmount,
        totalRecords,
        hasData: totalAmount > 0 || totalRecords > 0,
      } satisfies CollectionSummaryBarChartDatum;
    })
    .filter((row): row is CollectionSummaryBarChartDatum => row !== null)
    .sort((a, b) => a.month - b.month);
}

export function hasCollectionSummaryBarChartData(
  data: readonly CollectionSummaryBarChartDatum[],
): boolean {
  return data.some((row) => row.hasData);
}

export function getCollectionSummaryBarChartPeakMonth(
  data: readonly CollectionSummaryBarChartDatum[],
): CollectionSummaryBarChartDatum | null {
  let peak: CollectionSummaryBarChartDatum | null = null;
  for (const row of data) {
    if (!row.hasData) {
      continue;
    }
    if (!peak || row.totalAmount > peak.totalAmount) {
      peak = row;
    }
  }
  return peak;
}
