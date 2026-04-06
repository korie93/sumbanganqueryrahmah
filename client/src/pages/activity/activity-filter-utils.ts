import type { ActivityFilters } from "@/lib/api";

export function hasActiveActivityFilters(filters: ActivityFilters) {
  return Boolean(
    (filters.status && filters.status.length > 0) ||
    filters.username ||
    filters.ipAddress ||
    filters.browser ||
    filters.dateFrom ||
    filters.dateTo,
  );
}

export function getActivityFilterCount(filters: ActivityFilters) {
  return (
    (filters.status?.length || 0) +
    (filters.username ? 1 : 0) +
    (filters.ipAddress ? 1 : 0) +
    (filters.browser ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0)
  );
}
