import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getImportData } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import { withReadDeadline } from "@/lib/read-deadline";
import { buildViewerQueryKey, isViewerRetryableError } from "@/pages/viewer/viewer-retry-policy";
import {
  appendViewerFilter,
  ensureViewerFilterIds,
  removeViewerFilterAt,
  updateViewerFilterAt,
} from "@/pages/viewer/viewer-filter-state-utils";
import {
  normalizeViewerPageResult,
  resolveViewerPageHeaders,
  resolveViewerImportName,
} from "@/pages/viewer/page-utils";
import type { ColumnFilter, DataRowWithId, ViewerFilterMutableField } from "@/pages/viewer/types";
import {
  createViewerClearedState,
  createViewerImportResetState,
  createViewerSearchTooShortState,
  getViewerActiveColumnFilters,
  reconcileViewerColumnFilters,
  type ViewerStatePatch,
} from "@/pages/viewer/viewer-state-utils";

export const VIEWER_MIN_SEARCH_LENGTH = 2;
const VIEWER_SEARCH_DEBOUNCE_MS = 300;

type ViewerReadRequest = {
  key: string; importId: string; page: number; cursor: string | null;
  pageSize: number; search: string; columnFilters: ColumnFilter[];
};

type UseViewerDataStateOptions = {
  importId?: string | undefined;
  initialSearch?: string | undefined;
  rowsPerPage: number;
  onSelectionReset: () => void;
};

export function useViewerDataState({
  importId,
  initialSearch = "",
  rowsPerPage,
  onSelectionReset,
}: UseViewerDataStateOptions) {
  const [rows, setRows] = useState<DataRowWithId[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [headersLocked, setHeadersLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const [error, setError] = useState("");
  const [importName, setImportName] = useState("Data Viewer");
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch.trim());
  const [debouncedColumnFilters, setDebouncedColumnFilters] = useState<ColumnFilter[]>([]);
  const [emptyHint, setEmptyHint] = useState("");
  const [isCleared, setIsCleared] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(rowsPerPage);
  const [totalRows, setTotalRows] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [failedRequest, setFailedRequest] = useState<ViewerReadRequest | null>(null);
  const [retrying, setRetrying] = useState(false);

  const contextKey = buildViewerQueryKey(importId, rowsPerPage, search, columnFilters, isCleared);
  const requestKey = buildViewerQueryKey(importId, rowsPerPage, debouncedSearch, debouncedColumnFilters, isCleared);
  const queryReady = !isCleared && Boolean(importId) && contextKey === requestKey
    && (search.trim().length === 0 || search.trim().length >= VIEWER_MIN_SEARCH_LENGTH);

  const mountedRef = useRef(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<DataRowWithId[]>([]);
  const activeRequestIdRef = useRef(0);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const headersLockedRef = useRef(headersLocked);
  const pageCursorHistoryRef = useRef<Array<string | null>>([null]);
  const initializedImportRef = useRef<{ id: string | undefined } | null>(null);
  const currentQueryRef = useRef({ key: contextKey, ready: queryReady });
  const activeRequestContextRef = useRef("");
  const failedRequestRef = useRef<ViewerReadRequest | null>(null);
  const loadedQueryKeyRef = useRef<string | null>(null);
  currentQueryRef.current = { key: contextKey, ready: queryReady };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestIdRef.current += 1;
      fetchAbortControllerRef.current?.abort();
      fetchAbortControllerRef.current = null;
      failedRequestRef.current = null;
    };
  }, []);

  useEffect(() => {
    headersLockedRef.current = headersLocked;
  }, [headersLocked]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, VIEWER_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [search]);

  const cancelActiveFetch = useCallback(() => {
    fetchAbortControllerRef.current?.abort();
    fetchAbortControllerRef.current = null;
  }, []);

  const isActiveViewerFetchRequest = useCallback((
    controller: AbortController,
    requestId: number,
  ) => (
    mountedRef.current
    && !controller.signal.aborted
    && fetchAbortControllerRef.current === controller
    && requestId === activeRequestIdRef.current
    && activeRequestContextRef.current === currentQueryRef.current.key
    && currentQueryRef.current.ready
  ), []);

  useEffect(() => {
    failedRequestRef.current = null;
    setFailedRequest(null);
    setError("");
    setRetrying(false);
    return cancelActiveFetch;
  }, [cancelActiveFetch, contextKey]);

  const applyViewerStatePatch = useCallback((patch: ViewerStatePatch) => {
    if (patch.rows !== undefined) setRows(patch.rows);
    if (patch.headers !== undefined) setHeaders(patch.headers);
    if (patch.headersLocked !== undefined) {
      setHeadersLocked(patch.headersLocked);
      headersLockedRef.current = patch.headersLocked;
    }
    if (patch.columnFilters !== undefined) setColumnFilters(ensureViewerFilterIds(patch.columnFilters));
    if (patch.search !== undefined) setSearch(patch.search);
    if (patch.importName !== undefined) setImportName(patch.importName);
    if (patch.emptyHint !== undefined) setEmptyHint(patch.emptyHint);
    if (patch.isCleared !== undefined) setIsCleared(patch.isCleared);
    if (patch.currentPage !== undefined) setCurrentPage(patch.currentPage);
    if (patch.currentPageSize !== undefined) setCurrentPageSize(patch.currentPageSize);
    if (patch.totalRows !== undefined) setTotalRows(patch.totalRows);
    if (patch.nextCursor !== undefined) setNextCursor(patch.nextCursor);
    if (patch.pageCursorHistory !== undefined) pageCursorHistoryRef.current = patch.pageCursorHistory;
    if (patch.loading !== undefined) setLoading(patch.loading);
    if (patch.loadingMore !== undefined) setLoadingMore(patch.loadingMore);
  }, []);

  const fetchData = useCallback(async (
    id: string,
    options?: {
      page?: number;
      cursor?: string | null;
      retryRequest?: ViewerReadRequest;
    },
  ) => {
    if (!id || !mountedRef.current || !currentQueryRef.current.ready
      || requestKey !== currentQueryRef.current.key) return;
    const targetPage = Math.max(1, options?.page ?? 1);
    const requestCursor = options?.cursor ?? null;
    const read = options?.retryRequest ?? {
      key: requestKey, importId: id, page: targetPage, cursor: requestCursor,
      pageSize: rowsPerPage, search: debouncedSearch,
      columnFilters: debouncedColumnFilters.map((filter) => ({ ...filter })),
    };
    if (read.key !== currentQueryRef.current.key || read.importId !== id) return;

    cancelActiveFetch();
    const requestId = ++activeRequestIdRef.current;
    const controller = new AbortController();
    fetchAbortControllerRef.current = controller;
    activeRequestContextRef.current = requestKey;
    failedRequestRef.current = null;
    setFailedRequest(null);
    setRetrying(Boolean(options?.retryRequest));

    if (targetPage === 1 && rowsRef.current.length === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    if (!options?.retryRequest) setError("");

    try {
      const response = await withReadDeadline((signal) => getImportData(id, targetPage, read.pageSize, read.search, {
        signal,
        cursor: requestCursor || undefined,
        columnFilters: read.columnFilters,
      }), controller.signal);
      if (!isActiveViewerFetchRequest(controller, requestId)) {
        return;
      }

      const normalizedPage = normalizeViewerPageResult(response ?? {}, targetPage, read.pageSize);

      if (normalizedPage.page === 1 && !headersLockedRef.current) {
        const detectedHeaders = resolveViewerPageHeaders(response ?? {}, normalizedPage.rows);
        if (detectedHeaders.length > 0) {
          setHeaders(detectedHeaders);
          headersLockedRef.current = true;
          setHeadersLocked(true);
        }
      }

      setRows(normalizedPage.rows);
      loadedQueryKeyRef.current = requestKey;
      setError("");
      setCurrentPage(normalizedPage.page);
      setCurrentPageSize(normalizedPage.limit);
      setTotalRows(normalizedPage.total);
      setNextCursor(normalizedPage.nextCursor);
      pageCursorHistoryRef.current = [
        ...pageCursorHistoryRef.current.slice(0, normalizedPage.page - 1),
      ];
      pageCursorHistoryRef.current[normalizedPage.page - 1] = requestCursor;
    } catch (fetchError) {
      if (!isActiveViewerFetchRequest(controller, requestId)) {
        return;
      }

      // Never offer export/download of rows from a read that has failed.
      setRows([]);
      setTotalRows(0);
      loadedQueryKeyRef.current = null;
      const failed = isViewerRetryableError(fetchError) ? read : null;
      failedRequestRef.current = failed;
      setFailedRequest(failed);
      setError(getApiErrorMessage(fetchError, "Failed to fetch data."));
    } finally {
      const shouldFinalizeRequest = isActiveViewerFetchRequest(controller, requestId);
      if (fetchAbortControllerRef.current === controller) {
        fetchAbortControllerRef.current = null;
      }
      if (shouldFinalizeRequest) {
        setLoading(false);
        setLoadingMore(false);
        setRetrying(false);
      }
    }
  }, [
    cancelActiveFetch,
    debouncedColumnFilters,
    debouncedSearch,
    isActiveViewerFetchRequest,
    rowsPerPage,
    requestKey,
  ]);

  const handleRetry = useCallback(() => {
    const failed = failedRequestRef.current;
    if (!mountedRef.current || !failed || fetchAbortControllerRef.current
      || !currentQueryRef.current.ready || failed.key !== currentQueryRef.current.key) return;
    onSelectionReset();
    void fetchData(failed.importId, { page: failed.page, cursor: failed.cursor, retryRequest: failed });
  }, [fetchData, onSelectionReset]);

  const canExport = useCallback(() => mountedRef.current && currentQueryRef.current.ready
    && loadedQueryKeyRef.current === currentQueryRef.current.key
    && !fetchAbortControllerRef.current && !failedRequestRef.current, []);

  useEffect(() => {
    // Only changing the import resets headers/columns. A page-size change is
    // handled by the page-one fetch below and must preserve search and filters.
    if (initializedImportRef.current?.id === importId && initializedImportRef.current !== null) return;
    initializedImportRef.current = { id: importId };
    if (importId) {
      cancelActiveFetch();
      applyViewerStatePatch(
        createViewerImportResetState(resolveViewerImportName(), rowsPerPage),
      );
      onSelectionReset();
      return;
    }

    cancelActiveFetch();
    failedRequestRef.current = null;
    setFailedRequest(null);
    setError("");
    setRetrying(false);
    loadedQueryKeyRef.current = null;
    activeRequestIdRef.current += 1;
    onSelectionReset();
    applyViewerStatePatch(createViewerClearedState(rowsPerPage));
  }, [applyViewerStatePatch, cancelActiveFetch, importId, onSelectionReset, rowsPerPage]);

  useEffect(() => {
    onSelectionReset();
  }, [columnFilters, onSelectionReset]);

  const activeColumnFilters = useMemo(
    () => getViewerActiveColumnFilters(columnFilters),
    [columnFilters],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedColumnFilters((previous) => reconcileViewerColumnFilters(previous, activeColumnFilters));
    }, VIEWER_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [activeColumnFilters]);

  useEffect(() => {
    setCurrentPage(1);
    setCurrentPageSize(rowsPerPage);
    onSelectionReset();

    if (isCleared || !importId) {
      return;
    }

    if (debouncedSearch && debouncedSearch.length < VIEWER_MIN_SEARCH_LENGTH) {
      cancelActiveFetch();
      activeRequestIdRef.current += 1;
      applyViewerStatePatch(createViewerSearchTooShortState(rowsPerPage));
      return;
    }

    if (!queryReady) return;

    setNextCursor(null);
    pageCursorHistoryRef.current = [null];
    void fetchData(importId, { page: 1, cursor: null });
  }, [
    applyViewerStatePatch,
    cancelActiveFetch,
    debouncedColumnFilters,
    debouncedSearch,
    fetchData,
    importId,
    isCleared,
    onSelectionReset,
    rowsPerPage,
    queryReady,
  ]);

  const handlePrevPage = useCallback(() => {
    if (!importId || loadingMore || currentPage <= 1) return;
    onSelectionReset();
    const previousCursor = pageCursorHistoryRef.current[currentPage - 2] ?? null;
    void fetchData(importId, { page: currentPage - 1, cursor: previousCursor });
  }, [currentPage, fetchData, importId, loadingMore, onSelectionReset]);

  const handleNextPage = useCallback(() => {
    if (!importId || loadingMore || !nextCursor) return;
    onSelectionReset();
    void fetchData(importId, { page: currentPage + 1, cursor: nextCursor });
  }, [currentPage, fetchData, importId, loadingMore, nextCursor, onSelectionReset]);

  const addFilter = useCallback(() => {
    setColumnFilters((previous) => appendViewerFilter(previous, headers));
  }, [headers]);

  const updateFilter = useCallback((index: number, field: ViewerFilterMutableField, value: string) => {
    setColumnFilters((previous) => updateViewerFilterAt(previous, index, field, value));
  }, []);

  const removeFilter = useCallback((index: number) => {
    setColumnFilters((previous) => removeViewerFilterAt(previous, index));
  }, []);

  const clearAllFilters = useCallback(() => {
    setColumnFilters([]);
    setSearch("");
    setCurrentPage(1);
  }, []);

  const clearAllData = useCallback(() => {
    cancelActiveFetch();
    failedRequestRef.current = null;
    setFailedRequest(null);
    setError("");
    setRetrying(false);
    loadedQueryKeyRef.current = null;
    activeRequestIdRef.current += 1;
    onSelectionReset();
    applyViewerStatePatch(createViewerClearedState(rowsPerPage));
  }, [applyViewerStatePatch, cancelActiveFetch, onSelectionReset, rowsPerPage]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setCurrentPage(1);
  }, []);

  return {
    rows,
    headers,
    columnFilters,
    activeColumnFilters,
    error,
    canRetry: queryReady && failedRequest?.key === contextKey && !loading && !loadingMore,
    retrying,
    handleRetry,
    canExport,
    exportReady: queryReady && loadedQueryKeyRef.current === contextKey && !loading && !loadingMore && !error,
    importName,
    search,
    debouncedSearch,
    debouncedColumnFilters,
    emptyHint,
    isCleared,
    currentPage,
    currentPageSize,
    totalRows,
    nextCursor,
    loading,
    loadingMore,
    searchInputRef,
    addFilter,
    updateFilter,
    removeFilter,
    clearAllFilters,
    clearAllData,
    handleSearchChange,
    handlePrevPage,
    handleNextPage,
    minSearchLength: VIEWER_MIN_SEARCH_LENGTH,
  };
}
