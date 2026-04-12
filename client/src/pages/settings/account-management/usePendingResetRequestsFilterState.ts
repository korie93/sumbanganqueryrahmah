import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import {
  getPendingResetEmptyMessage,
  normalizePendingResetStatusFilter,
} from "@/pages/settings/account-management/pending-reset-utils";
import {
  ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
  hasNormalizedSearchChanged,
  normalizeSearchValue,
  shouldSyncNormalizedSearch,
} from "@/pages/settings/account-management/utils";
import type { PendingResetRequestsQueryState } from "@/pages/settings/useSettingsManagedUserData";

type UsePendingResetRequestsFilterStateArgs = {
  loading: boolean;
  onQueryChange: (query: Partial<PendingResetRequestsQueryState>) => void;
  query: PendingResetRequestsQueryState;
  total: number;
};

export function usePendingResetRequestsFilterState({
  loading,
  onQueryChange,
  query,
  total,
}: UsePendingResetRequestsFilterStateArgs) {
  const [searchQuery, setSearchQuery] = useState(query.search);
  const [statusFilter, setStatusFilter] = useState(query.status);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedDeferredSearch = useMemo(
    () => normalizeSearchValue(deferredSearchQuery),
    [deferredSearchQuery],
  );
  const hasActiveFilters = normalizedDeferredSearch.length > 0 || statusFilter !== "all";

  const activeFilters = useMemo<ActiveFilterChip[]>(
    () => {
      const chips: Array<ActiveFilterChip | null> = [
        normalizedDeferredSearch
          ? {
              id: "pending-reset-search",
              label: `Search: ${deferredSearchQuery.trim()}`,
              onRemove: () => setSearchQuery(""),
            }
          : null,
        statusFilter !== "all"
          ? {
              id: "pending-reset-status",
              label: `Status: ${statusFilter}`,
              onRemove: () => {
                setStatusFilter("all");
                onQueryChange({
                  page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
                  status: "all",
                });
              },
            }
          : null,
      ];

      return chips.filter((item): item is ActiveFilterChip => item !== null);
    },
    [deferredSearchQuery, normalizedDeferredSearch, onQueryChange, statusFilter],
  );

  useEffect(() => {
    if (hasNormalizedSearchChanged(searchQuery, query.search)) {
      setSearchQuery(query.search);
    }
  }, [query.search, searchQuery]);

  useEffect(() => {
    if (statusFilter !== query.status) {
      setStatusFilter(query.status);
    }
  }, [query.status, statusFilter]);

  useEffect(() => {
    if (!shouldSyncNormalizedSearch(normalizedDeferredSearch, query.search)) {
      return;
    }
    onQueryChange({
      page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
      search: normalizedDeferredSearch,
    });
  }, [normalizedDeferredSearch, onQueryChange, query.search]);

  const emptyMessage = useMemo(
    () =>
      getPendingResetEmptyMessage({
        hasActiveFilters,
        loading,
        total,
      }),
    [hasActiveFilters, loading, total],
  );

  return {
    activeFilters,
    emptyMessage,
    hasActiveFilters,
    searchQuery,
    statusFilter,
    clearAllFilters: () => {
      setSearchQuery("");
      setStatusFilter("all");
      onQueryChange({
        page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
        search: "",
        status: "all",
      });
    },
    onSearchQueryChange: (value: string) => {
      setSearchQuery(value);
    },
    onStatusChange: (value: string) => {
      const nextStatus = normalizePendingResetStatusFilter(value);
      setStatusFilter(nextStatus);
      onQueryChange({
        page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
        status: nextStatus,
      });
    },
  };
}
