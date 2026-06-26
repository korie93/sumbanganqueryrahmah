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
  averagePerRecord: number;
  percentage: number;
  hasAmount: boolean;
  color: string;
};

export type CollectionNicknameSummaryChartLimit = "5" | "10" | "all";
export type CollectionNicknameSummaryChartSort = "amount" | "records" | "average";
export type CollectionNicknamePerformanceLevel = "high" | "medium" | "low";
export type CollectionNicknameBenchmarkStatus = "not-set" | "achieved" | "near" | "behind";

export type CollectionNicknameSummaryChartFilter = {
  limit: CollectionNicknameSummaryChartLimit;
  query: string;
  sortBy: CollectionNicknameSummaryChartSort;
};

const COLLECTION_NICKNAME_PERFORMANCE_LABELS: Record<CollectionNicknamePerformanceLevel, string> = {
  high: "Tinggi",
  medium: "Sederhana",
  low: "Rendah",
};

const COLLECTION_NICKNAME_BENCHMARK_LABELS: Record<CollectionNicknameBenchmarkStatus, string> = {
  "not-set": "Tiada target",
  achieved: "Capai target",
  near: "Hampir capai",
  behind: "Jauh daripada target",
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
      averagePerRecord: totalRecords > 0 ? totalAmount / totalRecords : 0,
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

export function rankCollectionNicknameSummaryChartData(
  data: readonly CollectionNicknameSummaryChartDatum[],
): CollectionNicknameSummaryChartDatum[] {
  return [...data].sort((left, right) => {
    const amountDifference = right.totalAmount - left.totalAmount;
    if (amountDifference !== 0) {
      return amountDifference;
    }

    const recordDifference = right.totalRecords - left.totalRecords;
    if (recordDifference !== 0) {
      return recordDifference;
    }

    return left.nickname.localeCompare(right.nickname, "en-MY");
  });
}

export function getCollectionNicknamePerformanceLevel(
  row: Pick<CollectionNicknameSummaryChartDatum, "totalAmount">,
  peakAmount: number,
): CollectionNicknamePerformanceLevel {
  const safePeakAmount = toSafeNonNegativeNumber(peakAmount);
  const safeAmount = toSafeNonNegativeNumber(row.totalAmount);
  if (safePeakAmount <= 0 || safeAmount <= 0) {
    return "low";
  }

  const ratio = safeAmount / safePeakAmount;
  if (ratio >= 2 / 3) {
    return "high";
  }
  if (ratio >= 1 / 3) {
    return "medium";
  }
  return "low";
}

export function getCollectionNicknameTargetAwarePerformanceLevel(
  row: Pick<CollectionNicknameSummaryChartDatum, "totalAmount">,
  peakAmount: number,
  benchmarkAmount: number,
): CollectionNicknamePerformanceLevel {
  const safeBenchmarkAmount = toSafeNonNegativeNumber(benchmarkAmount);
  if (safeBenchmarkAmount <= 0) {
    return getCollectionNicknamePerformanceLevel(row, peakAmount);
  }

  const benchmarkStatus = getCollectionNicknameBenchmarkStatus(row, safeBenchmarkAmount);
  if (benchmarkStatus === "achieved") {
    return "high";
  }
  if (benchmarkStatus === "near") {
    return "medium";
  }
  return "low";
}

export function getCollectionNicknamePerformanceLabel(
  level: CollectionNicknamePerformanceLevel,
): string {
  return COLLECTION_NICKNAME_PERFORMANCE_LABELS[level];
}

export function parseCollectionNicknameBenchmarkAmount(input: string): number {
  const normalized = String(input || "").replace(/,/g, "").trim();
  if (!normalized) {
    return 0;
  }
  return toSafeNonNegativeNumber(normalized);
}

export function getCollectionNicknameBenchmarkProgress(
  row: Pick<CollectionNicknameSummaryChartDatum, "totalAmount">,
  benchmarkAmount: number,
): number {
  const safeBenchmarkAmount = toSafeNonNegativeNumber(benchmarkAmount);
  if (safeBenchmarkAmount <= 0) {
    return 0;
  }

  const safeAmount = toSafeNonNegativeNumber(row.totalAmount);
  return Math.max(0, (safeAmount / safeBenchmarkAmount) * 100);
}

export function getCollectionNicknameBenchmarkGap(
  row: Pick<CollectionNicknameSummaryChartDatum, "totalAmount">,
  benchmarkAmount: number,
): number {
  const safeBenchmarkAmount = toSafeNonNegativeNumber(benchmarkAmount);
  if (safeBenchmarkAmount <= 0) {
    return 0;
  }

  return Math.max(0, safeBenchmarkAmount - toSafeNonNegativeNumber(row.totalAmount));
}

export function getCollectionNicknameBenchmarkStatus(
  row: Pick<CollectionNicknameSummaryChartDatum, "totalAmount">,
  benchmarkAmount: number,
): CollectionNicknameBenchmarkStatus {
  const safeBenchmarkAmount = toSafeNonNegativeNumber(benchmarkAmount);
  if (safeBenchmarkAmount <= 0) {
    return "not-set";
  }

  const progress = getCollectionNicknameBenchmarkProgress(row, safeBenchmarkAmount);
  if (progress >= 100) {
    return "achieved";
  }
  if (progress >= 80) {
    return "near";
  }
  return "behind";
}

export function getCollectionNicknameBenchmarkStatusLabel(
  status: CollectionNicknameBenchmarkStatus,
): string {
  return COLLECTION_NICKNAME_BENCHMARK_LABELS[status];
}

function compareChartRows(
  left: CollectionNicknameSummaryChartDatum,
  right: CollectionNicknameSummaryChartDatum,
  sortBy: CollectionNicknameSummaryChartSort,
): number {
  const primaryDifference = sortBy === "records"
    ? right.totalRecords - left.totalRecords
    : sortBy === "average"
      ? right.averagePerRecord - left.averagePerRecord
      : right.totalAmount - left.totalAmount;
  if (primaryDifference !== 0) {
    return primaryDifference;
  }

  const amountDifference = right.totalAmount - left.totalAmount;
  if (amountDifference !== 0) {
    return amountDifference;
  }

  const recordDifference = right.totalRecords - left.totalRecords;
  if (recordDifference !== 0) {
    return recordDifference;
  }

  return left.nickname.localeCompare(right.nickname, "en-MY");
}

export function filterCollectionNicknameSummaryChartData(
  data: readonly CollectionNicknameSummaryChartDatum[],
  filter: CollectionNicknameSummaryChartFilter,
): CollectionNicknameSummaryChartDatum[] {
  const normalizedQuery = filter.query.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-MY");
  const matchingRows = normalizedQuery
    ? data.filter((row) => row.nickname.toLocaleLowerCase("en-MY").includes(normalizedQuery))
    : [...data];
  const sortedRows = matchingRows.sort((left, right) => compareChartRows(left, right, filter.sortBy));

  if (filter.limit === "all") {
    return sortedRows;
  }

  return sortedRows.slice(0, Number(filter.limit));
}
