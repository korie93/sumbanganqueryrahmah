import type { NicknameTotalSummary } from "@/pages/collection-nickname-summary/utils";

const AXIS_LABEL_MAX_LENGTH = 14;
const DEFAULT_LABEL_MAX_LENGTH = 18;
const COLLECTION_NICKNAME_CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
] as const;

export type CollectionNicknameSummaryChartDatum = {
  key: string;
  nickname: string;
  axisLabel: string;
  totalAmount: number;
  totalRecords: number;
  percentage: number;
  hasAmount: boolean;
  color: string;
};

function toSafeNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toSafeRecordCount(value: unknown): number {
  return Math.trunc(toSafeNonNegativeNumber(value));
}

function normalizeNickname(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim() || "Unknown / No Nickname";
}

function buildNicknameChartAxisLabel(nickname: string): string {
  const withoutOperationalPrefix = nickname.replace(/^SW[._-]/i, "");
  return truncateNicknameChartLabel(withoutOperationalPrefix, AXIS_LABEL_MAX_LENGTH);
}

export function truncateNicknameChartLabel(
  nickname: string,
  maxLength = DEFAULT_LABEL_MAX_LENGTH,
): string {
  const normalized = normalizeNickname(nickname);
  const safeMaxLength = Math.max(4, Math.trunc(maxLength));
  if (normalized.length <= safeMaxLength) {
    return normalized;
  }
  return `${normalized.slice(0, safeMaxLength - 3).trimEnd()}...`;
}

export function buildCollectionNicknameSummaryChartData(
  rows: readonly NicknameTotalSummary[] | null | undefined,
  grandTotalAmount: number,
): CollectionNicknameSummaryChartDatum[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const normalizedRows = rows.map((row, index) => {
    const nickname = normalizeNickname(row?.nickname);
    const totalAmount = toSafeNonNegativeNumber(row?.totalAmount);
    const totalRecords = toSafeRecordCount(row?.totalRecords);
    return {
      key: `${nickname.toLocaleLowerCase("en-MY")}-${index}`,
      nickname,
      axisLabel: buildNicknameChartAxisLabel(nickname),
      totalAmount,
      totalRecords,
      percentage: 0,
      hasAmount: totalAmount > 0,
      color: COLLECTION_NICKNAME_CHART_COLORS[index % COLLECTION_NICKNAME_CHART_COLORS.length],
    } satisfies CollectionNicknameSummaryChartDatum;
  });

  const rowsTotal = normalizedRows.reduce((sum, row) => sum + row.totalAmount, 0);
  const requestedGrandTotal = toSafeNonNegativeNumber(grandTotalAmount);
  const percentageBase = requestedGrandTotal > 0 ? requestedGrandTotal : rowsTotal;

  return normalizedRows.map((row) => ({
    ...row,
    percentage: percentageBase > 0 ? (row.totalAmount / percentageBase) * 100 : 0,
  }));
}

export function hasCollectionNicknameSummaryChartData(
  data: readonly CollectionNicknameSummaryChartDatum[],
): boolean {
  return data.some((row) => row.hasAmount);
}

export function getCollectionNicknameSummaryChartPeak(
  data: readonly CollectionNicknameSummaryChartDatum[],
): CollectionNicknameSummaryChartDatum | null {
  let peak: CollectionNicknameSummaryChartDatum | null = null;
  for (const row of data) {
    if (!row.hasAmount) {
      continue;
    }
    if (!peak || row.totalAmount > peak.totalAmount) {
      peak = row;
    }
  }
  return peak;
}
