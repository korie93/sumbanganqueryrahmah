import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { getAuditLogs, getAuditLogStats } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import { logClientError } from "@/lib/client-logger";
import {
  buildAuditLogsRequestParams,
  DEFAULT_AUDIT_LOG_FILTERS,
  hasActiveAuditLogFilters,
} from "@/pages/audit-logs/audit-log-page-state-utils";
import { buildAuditLogsReadKey, createAuditLogsReadState, reduceAuditLogsReadState, selectAuditLogsReadView } from "@/pages/audit-logs/audit-logs-read-state";
import type { AuditLogFilters, AuditLogRecord, AuditLogsResponse, AuditLogStats } from "@/pages/audit-logs/types";

export function useAuditLogsDataState() {
  const [readState, dispatchRead] = useReducer(reduceAuditLogsReadState, undefined, createAuditLogsReadState);
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [filters, setFilters] = useState<AuditLogFilters>(DEFAULT_AUDIT_LOG_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const deferredSearchText = useDeferredValue(filters.searchText.trim());
  const mountedRef = useRef(true);
  const logsRequestIdRef = useRef(0);
  const statsRequestIdRef = useRef(0);
  const queryKey = buildAuditLogsReadKey(filters, page, pageSize, refreshNonce);
  const requestKey = buildAuditLogsReadKey(filters, page, pageSize, refreshNonce, deferredSearchText);
  const currentReadRef = useRef({ state: readState, queryKey, page, pageSize });
  currentReadRef.current = { state: readState, queryKey, page, pageSize };
  const view = selectAuditLogsReadView(readState, queryKey, page, pageSize);
  const { logs, pagination, loading, error, hasCurrentResults, hasPreviousResults } = view;
  const getExportLogs = useCallback((): AuditLogRecord[] | null => {
    const current = currentReadRef.current;
    const currentView = selectAuditLogsReadView(current.state, current.queryKey, current.page, current.pageSize);
    return mountedRef.current && currentView.hasCurrentResults ? currentView.logs : null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      logsRequestIdRef.current += 1;
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
      logClientError("Failed to fetch audit log stats:", error);
    }
  }, []);

  useEffect(() => {
    if (queryKey !== requestKey) return;
    const requestId = ++logsRequestIdRef.current;
    let active = true;
    const isCurrent = () => active && mountedRef.current && requestId === logsRequestIdRef.current
      && currentReadRef.current.queryKey === requestKey;
    const run = async () => {
      dispatchRead({ type: "loading", requestId, queryKey: requestKey });
      try {
        const response = await getAuditLogs(
          buildAuditLogsRequestParams(filters, page, pageSize, deferredSearchText),
        ) as AuditLogsResponse;
        if (!isCurrent()) {
          return;
        }

        dispatchRead({ type: "success", requestId, queryKey: requestKey, response, page, pageSize });
      } catch (error) {
        if (!isCurrent()) {
          return;
        }
        logClientError("Failed to fetch audit logs:", error);
        dispatchRead({ type: "error", requestId, queryKey: requestKey, error: getApiErrorMessage(error, "Audit records could not be loaded. Please try again.") });
      }
    };

    void run();
    return () => { active = false; };
  }, [deferredSearchText, filters, page, pageSize, queryKey, requestKey]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (hasCurrentResults && page > pagination.totalPages) {
      setPage(pagination.totalPages);
    }
  }, [hasCurrentResults, page, pagination.totalPages]);

  const clearAllFilters = useCallback(() => {
    setFilters(DEFAULT_AUDIT_LOG_FILTERS);
    setPage(1);
  }, []);

  const applyFilters = useCallback((nextFilters: AuditLogFilters) => {
    setFilters(nextFilters);
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

  const setRiskFilter = useCallback((value: string) => {
    updateFilters((current) => ({ ...current, riskFilter: value }));
  }, [updateFilters]);

  const setCategoryFilter = useCallback((value: string) => {
    updateFilters((current) => ({ ...current, categoryFilter: value }));
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
    error,
    hasCurrentResults,
    hasPreviousResults,
    getExportLogs,
    page,
    setPage,
    pageSize,
    pagination,
    searchText: filters.searchText,
    performedByFilter: filters.performedByFilter,
    targetUserFilter: filters.targetUserFilter,
    actionFilter: filters.actionFilter,
    riskFilter: filters.riskFilter,
    categoryFilter: filters.categoryFilter,
    datePreset: filters.datePreset,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    filters,
    hasActiveFilters,
    applyFilters,
    clearAllFilters,
    refreshNow,
    fetchStats,
    setSearchText,
    setPerformedByFilter,
    setTargetUserFilter,
    setActionFilter,
    setRiskFilter,
    setCategoryFilter,
    setDatePreset,
    setDateFrom,
    setDateTo,
    handlePageSizeChange,
  };
}
