import { formatOperationalDateTime } from "@/lib/date-format";

export function resolveDashboardLatestUpdatedAt(values: readonly number[]) {
  const validValues = values.filter((value) => Number.isFinite(value) && value > 0);
  return validValues.length > 0 ? Math.max(...validValues) : null;
}

export function formatDashboardFreshnessLabel(updatedAt: number | null | undefined) {
  if (!updatedAt) {
    return "Data belum dimuat";
  }

  return `Data ${formatOperationalDateTime(updatedAt, { fallback: "masa tidak diketahui" })}`;
}

export function resolveDashboardFreshnessStatusMessage(options: {
  hasDashboardErrors: boolean;
  latestUpdatedAt: number | null;
  refreshing: boolean;
}) {
  const freshnessLabel = formatDashboardFreshnessLabel(options.latestUpdatedAt);

  if (options.refreshing) {
    return `${freshnessLabel}. Refresh sedang berjalan.`;
  }

  if (options.hasDashboardErrors) {
    return `${freshnessLabel}. Sebahagian data dashboard gagal dimuat.`;
  }

  if (options.latestUpdatedAt) {
    return `${freshnessLabel}. Auto refresh aktif.`;
  }

  return "Data dashboard belum dimuat. Auto refresh akan bermula selepas data tersedia.";
}
