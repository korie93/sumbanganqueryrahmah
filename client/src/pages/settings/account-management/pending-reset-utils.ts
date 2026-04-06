export function normalizePendingResetStatusFilter(
  value: string,
): "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned" {
  return value === "active"
    || value === "pending_activation"
    || value === "suspended"
    || value === "disabled"
    || value === "locked"
    || value === "banned"
    ? value
    : "all";
}

export function getPendingResetEmptyMessage(options: {
  hasActiveFilters: boolean;
  loading: boolean;
  total: number;
}) {
  if (options.loading) {
    return "Loading reset requests...";
  }

  if (options.total === 0 && !options.hasActiveFilters) {
    return "No pending reset requests.";
  }

  return "No reset requests match the current filters.";
}
