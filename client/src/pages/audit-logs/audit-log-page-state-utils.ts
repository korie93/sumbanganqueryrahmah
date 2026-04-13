import { getAuditDateRange } from "@/pages/audit-logs/utils";
import { isMobileViewportWidth } from "@/lib/responsive";
import type { AuditLogFilters, AuditLogsResponse } from "@/pages/audit-logs/types";

export type AuditLogsPaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function resolveInitialAuditLogsLayoutState(width?: number) {
  const isMobileViewport = isMobileViewportWidth(width);

  return {
    filtersOpen: false,
    recordsOpen: true,
    cleanupOpen: !isMobileViewport,
  };
}

export function normalizeAuditLogsPagination(
  pagination: Pick<AuditLogsResponse["pagination"], "page" | "pageSize" | "total" | "totalPages"> | null | undefined,
  fallbackPage: number,
  fallbackPageSize: number,
  itemCount: number,
): AuditLogsPaginationState {
  const total = Number(pagination?.total || itemCount);

  return {
    page: Math.max(1, Number(pagination?.page || fallbackPage)),
    pageSize: Math.max(1, Number(pagination?.pageSize || fallbackPageSize)),
    total: Math.max(0, total),
    totalPages: Math.max(1, Number(pagination?.totalPages || 1)),
  };
}

export function hasActiveAuditLogFilters(filters: AuditLogFilters) {
  return Boolean(filters.searchText)
    || Boolean(filters.performedByFilter)
    || Boolean(filters.targetUserFilter)
    || filters.actionFilter !== "all"
    || filters.datePreset !== "all";
}

export function buildAuditLogsRequestParams(
  filters: AuditLogFilters,
  page: number,
  pageSize: number,
  deferredSearchText: string,
) {
  const dateRange = getAuditDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);

  return {
    page,
    pageSize,
    action: filters.actionFilter === "all" ? undefined : filters.actionFilter,
    performedBy: filters.performedByFilter.trim() || undefined,
    targetUser: filters.targetUserFilter.trim() || undefined,
    search: deferredSearchText || undefined,
    dateFrom: dateRange.from ? dateRange.from.toISOString() : undefined,
    dateTo: dateRange.to ? dateRange.to.toISOString() : undefined,
    sortBy: "newest" as const,
  };
}
