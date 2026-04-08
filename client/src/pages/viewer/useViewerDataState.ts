import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getImportData } from "@/lib/api";
import {
  appendViewerFilter,
  removeViewerFilterAt,
  updateViewerFilterAt,
} from "@/pages/viewer/viewer-filter-state-utils";
import {
  normalizeViewerPageResult,
  resolveViewerPageHeaders,
  resolveViewerImportName,
} from "@/pages/viewer/page-utils";
import type { ColumnFilter, DataRowWithId } from "@/pages/viewer/types";
import {
  createViewerClearedState,
  createViewerImportResetState,
  createViewerSearchTooShortState,
  getViewerActiveColumnFilters,
  type ViewerStatePatch,
} from "@/pages/viewer/viewer-state-utils";

export const VIEWER_MIN_SEARCH_LENGTH = 2;
const VIEWER_SEARCH_DEBOUNCE_MS = 300;

type UseViewerDataStateOptions = {
  importId?: string | undefined;
  rowsPerPage: number;
  onSelectionReset: () => void;
};

export function useViewerDataState({
  importId,
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
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debouncedColumnFilters, setDebouncedColumnFilters] = useState<ColumnFilter[]>([]);
  const [emptyHint, setEmptyHint] = useState("");
  const [isCleared, setIsCleared] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(rowsPerPage);
  const [totalRows, setTotalRows] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<DataRowWithId[]>([]);
  const activeRequestIdRef = useRef(0);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const headersLockedRef = useRef(headersLocked);
  const pageCursorHistoryRef = useRef<Array<string | null>>([null]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestIdRef.current += 1;
      fetchAbortControllerRef.current?.abort();
      fetchAbortControllerRef.current = null;
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

  const applyViewerStatePatch = useCallback((patch: ViewerStatePatch) => {
    if (patch.rows !== undefined) setRows(patch.rows);
    if (patch.headers !== undefined) setHeaders(patch.headers);
    if (patch.headersLocked !== undefined) {
      setHeadersLocked(patch.headersLocked);
      headersLockedRef.current = patch.headersLocked;
    }
    if (patch.columnFilters !== undefined) setColumnFilters(patch.columnFilters);
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
    },
  ) => {
    if (!id) return;
    const targetPage = Math.max(1, options?.page ?? 1);
    const requestCursor = options?.cursor ?? null;

    cancelActiveFetch();
    const requestId = ++activeRequestIdRef.current;
    const controller = new AbortController();
    fetchAbortControllerRef.current = controller;

    if (targetPage === 1 && rowsRef.current.length === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    setError("");

    try {
      const response = await getImportData(id, targetPage, rowsPerPage, debouncedSearch, {
        signal: controller.signal,
        cursor: requestCursor || undefined,
        columnFilters: debouncedColumnFilters,
      });
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        requestId !== activeRequestIdRef.current
      ) {
        return;
      }

      const normalizedPage = normalizeViewerPageResult(response ?? {}, targetPage, rowsPerPage);

      if (normalizedPage.page === 1 && !headersLockedRef.current) {
        const detectedHeaders = resolveViewerPageHeaders(response ?? {}, normalizedPage.rows);
        if (detectedHeaders.length > 0) {
          setHeaders(detectedHeaders);
          headersLockedRef.current = true;
          setHeadersLocked(true);
        }
      }

      setRows(normalizedPage.rows);
      setCurrentPage(normalizedPage.page);
      setCurrentPageSize(normalizedPage.limit);
      setTotalRows(normalizedPage.total);
      setNextCursor(normalizedPage.nextCursor);
      pageCursorHistoryRef.current = [
        ...pageCursorHistoryRef.current.slice(0, normalizedPage.page - 1),
      ];
      pageCursorHistoryRef.current[normalizedPage.page - 1] = requestCursor;
    } catch (fetchError) {
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        requestId !== activeRequestIdRef.current
      ) {
        return;
      }

      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch data");
    } finally {
      if (fetchAbortControllerRef.current === controller) {
        fetchAbortControllerRef.current = null;
      }
      if (mountedRef.current && requestId === activeRequestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [cancelActiveFetch, debouncedColumnFilters, debouncedSearch, rowsPerPage]);

  useEffect(() => {
    if (importId) {
      cancelActiveFetch();
      applyViewerStatePatch(
        createViewerImportResetState(resolveViewerImportName(), rowsPerPage),
      );
      onSelectionReset();
      return;
    }

    cancelActiveFetch();
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
      setDebouncedColumnFilters(activeColumnFilters);
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

  const updateFilter = useCallback((index: number, field: keyof ColumnFilter, value: string) => {
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
