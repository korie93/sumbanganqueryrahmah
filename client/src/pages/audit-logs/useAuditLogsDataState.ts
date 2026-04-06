import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { getAuditLogs, getAuditLogStats } from "@/lib/api";
import {
  buildAuditLogsRequestParams,
  hasActiveAuditLogFilters,
  normalizeAuditLogsPagination,
} from "@/pages/audit-logs/audit-log-page-state-utils";
import type { AuditLogFilters, AuditLogRecord, AuditLogsResponse, AuditLogStats } from "@/pages/audit-logs/types";

const initialFilters: AuditLogFilters = {
  actionFilter: "all",
  dateFrom: "",
  datePreset: "all",
  dateTo: "",
  performedByFilter: "",
  searchText: "",
  targetUserFilter: "",
};

const initialPagination = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1,
};

export function useAuditLogsDataState() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AuditLogFilters>(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState(initialPagination);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const deferredSearchText = useDeferredValue(filters.searchText.trim());
  const mountedRef = useRef(true);
  const logsRequestIdRef = useRef(0);
  const statsRequestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchStats = useCallback(async () => {
    const requestId = ++statsRequestIdRef.current;
    try {
      const response = await getAuditLogStats();
      if (!mountedRef.current || requestId !== statsRequestIdRef.current) {
        return;
      }
      setStats(response);
    } catch (error) {
      if (!mountedRef.current || requestId !== statsRequestIdRef.current) {
        return;
      }
      console.error("Failed to fetch audit log stats:", error);
    }
  }, []);

  useEffect(() => {
    const requestId = ++logsRequestIdRef.current;
    const run = async () => {
      setLoading(true);
      try {
        const response = await getAuditLogs(
          buildAuditLogsRequestParams(filters, page, pageSize, deferredSearchText),
        ) as AuditLogsResponse;
        if (!mountedRef.current || requestId !== logsRequestIdRef.current) {
          return;
        }

        const items = Array.isArray(response?.logs) ? response.logs : [];
        setLogs(items);
        setPagination(
          normalizeAuditLogsPagination(response?.pagination, page, pageSize, items.length),
        );
      } catch (error) {
        if (!mountedRef.current || requestId !== logsRequestIdRef.current) {
          return;
        }
        console.error("Failed to fetch audit logs:", error);
      } finally {
        if (mountedRef.current && requestId === logsRequestIdRef.current) {
          setLoading(false);
        }
      }
    };

    void run();
  }, [deferredSearchText, filters, page, pageSize, refreshNonce]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (page > pagination.totalPages) {
      setPage(pagination.totalPages);
    }
  }, [page, pagination.totalPages]);

  const clearAllFilters = useCallback(() => {
    setFilters(initialFilters);
    setPage(1);
  }, []);

  const refreshNow = useCallback(() => {
    setRefreshNonce((value) => value + 1);
  }, []);

  const updateFilters = useCallback((updater: (current: AuditLogFilters) => AuditLogFilters) => {
    setFilters((current) => updater(current));
    setPage(1);
  }, []);

  const setSearchText = useCallback((value: string) => {
    updateFilters((current) => ({ ...current, searchText: value }));
  }, [updateFilters]);

  const setPerformedByFilter = useCallback((value: string) => {
    updateFilters((current) => ({ ...current, performedByFilter: value }));
  }, [updateFilters]);

  const setTargetUserFilter = useCallback((value: string) => {
    updateFilters((current) => ({ ...current, targetUserFilter: value }));
  }, [updateFilters]);

  const setActionFilter = useCallback((value: string) => {
    updateFilters((current) => ({ ...current, actionFilter: value }));
  }, [updateFilters]);

  const setDatePreset = useCallback((value: string) => {
    updateFilters((current) => ({
      ...current,
      datePreset: value,
      dateFrom: value !== "custom" ? "" : current.dateFrom,
      dateTo: value !== "custom" ? "" : current.dateTo,
    }));
  }, [updateFilters]);

  const setDateFrom = useCallback((value: string) => {
    updateFilters((current) => ({ ...current, dateFrom: value }));
  }, [updateFilters]);

  const setDateTo = useCallback((value: string) => {
    updateFilters((current) => ({ ...current, dateTo: value }));
  }, [updateFilters]);

  const handlePageSizeChange = useCallback((nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
  }, []);

  const hasActiveFilters = useMemo(
    () => hasActiveAuditLogFilters(filters),
    [filters],
  );

  return {
    logs,
    stats,
    loading,
    page,
    setPage,
    pageSize,
    pagination,
    searchText: filters.searchText,
    performedByFilter: filters.performedByFilter,
    targetUserFilter: filters.targetUserFilter,
    actionFilter: filters.actionFilter,
    datePreset: filters.datePreset,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    hasActiveFilters,
    clearAllFilters,
    refreshNow,
    fetchStats,
    setSearchText,
    setPerformedByFilter,
    setTargetUserFilter,
    setActionFilter,
    setDatePreset,
    setDateFrom,
    setDateTo,
    handlePageSizeChange,
  };
}
