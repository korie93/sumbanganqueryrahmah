import type { CollectionNicknameTargetBenchmark } from "@/pages/collection-nickname-summary/collection-nickname-target-benchmarks";

const TARGET_MONTH_FORMATTER = new Intl.DateTimeFormat("ms-MY", {
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const TARGET_AUDIT_TIME_FORMATTER = new Intl.DateTimeFormat("ms-MY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kuala_Lumpur",
});

export function formatCollectionNicknameTargetMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || "").trim());
  if (!match) {
    return String(month || "-");
  }
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return Number.isFinite(parsed.getTime()) ? TARGET_MONTH_FORMATTER.format(parsed) : month;
}

export function formatCollectionNicknameTargetUpdatedAt(value: string | null): string {
  if (!value) {
    return "Tidak direkodkan";
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? TARGET_AUDIT_TIME_FORMATTER.format(parsed)
    : "Tidak direkodkan";
}

export function buildCollectionNicknameTargetMonthExportText(
  benchmark: CollectionNicknameTargetBenchmark,
): string {
  if (benchmark.months.length === 0) {
    return benchmark.missingMonths > 0
      ? `${benchmark.missingMonths} bulan tanpa target`
      : "";
  }
  return benchmark.months.map((month) => (
    month.configured
      ? `${month.month}=${month.amount.toFixed(2)}`
      : `${month.month}=TIADA`
  )).join("; ");
}

export function buildCollectionNicknameTargetMissingMonthText(
  benchmark: CollectionNicknameTargetBenchmark,
): string {
  const missingMonths = benchmark.months
    .filter((month) => !month.configured)
    .map((month) => month.month);
  if (missingMonths.length > 0) {
    return missingMonths.join(", ");
  }
  return benchmark.missingMonths > 0 ? `${benchmark.missingMonths} bulan` : "";
}
