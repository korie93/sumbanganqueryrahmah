import { normalizeAuditLogsPagination } from "@/pages/audit-logs/audit-log-page-state-utils";
import type { AuditLogsPaginationState } from "@/pages/audit-logs/audit-log-page-state-utils";
import type { AuditLogFilters, AuditLogRecord, AuditLogsResponse } from "@/pages/audit-logs/types";

export type AuditLogsReadState = {
  requestId: number;
  queryKey: string | null;
  status: "idle" | "loading" | "success" | "error";
  error: string;
  result: {
    queryKey: string;
    logs: AuditLogRecord[];
    pagination: AuditLogsPaginationState;
  } | null;
};

type AuditLogsReadAction =
  | { type: "loading"; requestId: number; queryKey: string }
  | { type: "success"; requestId: number; queryKey: string; response: AuditLogsResponse; page: number; pageSize: number }
  | { type: "error"; requestId: number; queryKey: string; error: string };

export function createAuditLogsReadState(): AuditLogsReadState {
  return { requestId: 0, queryKey: null, status: "idle", error: "", result: null };
}

// Include refresh identity so a retry cannot inherit the previous success.
export function buildAuditLogsReadKey(
  filters: AuditLogFilters,
  page: number,
  pageSize: number,
  refreshNonce: number,
  searchText = filters.searchText.trim(),
) {
  return JSON.stringify([
    page, pageSize, refreshNonce, searchText, filters.performedByFilter.trim(),
    filters.targetUserFilter.trim(), filters.actionFilter, filters.riskFilter,
    filters.categoryFilter, filters.datePreset, filters.dateFrom, filters.dateTo,
  ]);
}

export function reduceAuditLogsReadState(state: AuditLogsReadState, action: AuditLogsReadAction): AuditLogsReadState {
  if (action.type === "loading") {
    if (action.requestId <= state.requestId) return state;
    return { ...state, requestId: action.requestId, queryKey: action.queryKey, status: "loading", error: "" };
  }
  if (action.requestId !== state.requestId || action.queryKey !== state.queryKey) return state;
  if (action.type === "error") return { ...state, status: "error", error: action.error };
  const logs = Array.isArray(action.response.logs) ? action.response.logs : [];
  return {
    ...state,
    status: "success",
    error: "",
    result: {
      queryKey: action.queryKey,
      logs,
      pagination: normalizeAuditLogsPagination(action.response.pagination, action.page, action.pageSize, logs.length),
    },
  };
}

export function selectAuditLogsReadView(state: AuditLogsReadState, queryKey: string, page: number, pageSize: number) {
  const hasCurrentResults = state.queryKey === queryKey && state.status === "success" && state.result?.queryKey === queryKey;
  const error = state.queryKey === queryKey && state.status === "error" ? state.error : "";
  return {
    logs: hasCurrentResults && state.result ? state.result.logs : [],
    pagination: hasCurrentResults && state.result ? state.result.pagination : { page, pageSize, total: 0, totalPages: Math.max(1, page) },
    hasCurrentResults,
    error,
    loading: !hasCurrentResults && !error,
    hasPreviousResults: Boolean(state.result) && !hasCurrentResults,
  };
}
