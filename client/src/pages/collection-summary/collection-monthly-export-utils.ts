type CollectionMonthlyComparisonEscapableValue = string | number | null | undefined;

export function escapeCollectionMonthlyComparisonCsvValue(
  value: CollectionMonthlyComparisonEscapableValue,
) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function escapeCollectionMonthlyComparisonHtml(
  value: CollectionMonthlyComparisonEscapableValue,
): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatCollectionMonthlyComparisonReportDate(date: Date): string {
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
