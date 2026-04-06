import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBackups } from "@/lib/api";
import type { BackupsResponse } from "@/pages/backup-restore/types";
import { getBackupDateRange, normalizeBackup } from "@/pages/backup-restore/utils";
import {
  buildBackupQueryParams,
  getBackupPaginationFallback,
  hasActiveBackupFilters,
} from "@/pages/backup-restore/backup-state-utils";

export function useBackupListState() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [backupsOpen, setBackupsOpen] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [createdByFilter, setCreatedByFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [datePreset, setDatePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const deferredSearchName = useDeferredValue(searchName.trim());
  const dateRange = useMemo(
    () => getBackupDateRange(datePreset, dateFrom, dateTo),
    [datePreset, dateFrom, dateTo],
  );

  const backupQueryParams = useMemo(
    () =>
      buildBackupQueryParams({
        page,
        pageSize,
        deferredSearchName,
        createdByFilter,
        sortBy,
        dateRange,
      }),
    [page, pageSize, deferredSearchName, createdByFilter, sortBy, dateRange],
  );

  const query = useQuery<BackupsResponse>({
    queryKey: ["/api/backups", backupQueryParams],
    queryFn: async () => {
      const response = await getBackups(backupQueryParams);
      const list = Array.isArray(response?.backups) ? response.backups : [];
      const normalizedBackups = list.map(normalizeBackup);
      const total = Math.max(0, Number(response?.pagination?.total || normalizedBackups.length));
      const totalPages = Math.max(1, Number(response?.pagination?.totalPages || Math.ceil(total / pageSize) || 1));
      return {
        backups: normalizedBackups,
        pagination: {
          page: Math.max(1, Number(response?.pagination?.page || page)),
          pageSize: Math.max(1, Number(response?.pagination?.pageSize || pageSize)),
          total,
          totalPages,
        },
      };
    },
    retry: 1,
  });

  const backups = query.data?.backups || [];
  const pagination = getBackupPaginationFallback(page, pageSize, backups, query.data);
  const loading = query.isLoading || query.isRefetching;
  const hasActiveFilters = hasActiveBackupFilters({
    createdByFilter,
    dateFrom,
    datePreset,
    dateTo,
    searchName,
    sortBy,
  });

  useEffect(() => {
    if (page > pagination.totalPages) {
      setPage(pagination.totalPages);
    }
  }, [page, pagination.totalPages]);

  const clearAllFilters = useCallback(() => {
    setSearchName("");
    setCreatedByFilter("");
    setSortBy("newest");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }, []);

  const updateSearchName = useCallback((value: string) => {
    setSearchName(value);
    setPage(1);
  }, []);

  const updateCreatedByFilter = useCallback((value: string) => {
    setCreatedByFilter(value);
    setPage(1);
  }, []);

  const updateDatePreset = useCallback((value: string) => {
    setDatePreset(value);
    if (value !== "custom") {
      setDateFrom("");
      setDateTo("");
    }
    setPage(1);
  }, []);

  const updateDateFrom = useCallback((value: string) => {
    setDateFrom(value);
    setPage(1);
  }, []);

  const updateDateTo = useCallback((value: string) => {
    setDateTo(value);
    setPage(1);
  }, []);

  const updateSortBy = useCallback((value: string) => {
    setSortBy(value);
    setPage(1);
  }, []);

  const updatePageSize = useCallback((nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
  }, []);

  return {
    backups,
    pagination,
    loading,
    error: query.error,
    filtersOpen,
    backupsOpen,
    searchName,
    createdByFilter,
    sortBy,
    datePreset,
    dateFrom,
    dateTo,
    hasActiveFilters,
    setFiltersOpen,
    setBackupsOpen,
    setPage,
    updatePageSize,
    updateSearchName,
    updateCreatedByFilter,
    updateDatePreset,
    updateDateFrom,
    updateDateTo,
    updateSortBy,
    clearAllFilters,
    refetch: query.refetch,
  };
}
