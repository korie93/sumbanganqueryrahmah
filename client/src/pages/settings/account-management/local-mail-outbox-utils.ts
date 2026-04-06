export function normalizeLocalMailOutboxSortDirection(value: string): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

export function getLocalMailOutboxEmptyMessage(options: {
  hasSearchFilter: boolean;
  loading: boolean;
  total: number;
}) {
  if (options.loading) {
    return "Loading local mail previews...";
  }

  if (options.total === 0 && !options.hasSearchFilter) {
    return "No local email previews captured yet.";
  }

  return "No email previews match the current filters.";
}
