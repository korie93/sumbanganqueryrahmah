import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { getImports } from "@/lib/api";
import type { SavedWorkspaceView } from "@/pages/saved/saved-workspace";
import type { ImportItem } from "@/pages/saved/types";
import { isSavedAbortError, readSavedErrorMessage } from "@/pages/saved/saved-state-utils";

const DEFAULT_PAGE_SIZE = 20;

function parseOptionalRowCount(value: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function useSavedDataState() {
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [totalImports, setTotalImports] = useState(0);
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTermState] = useState("");
  const [uploaderFilter, setUploaderFilterState] = useState("");
  const [dateFilter, setDateFilterState] = useState<Date | undefined>(undefined);
  const [minRowsFilter, setMinRowsFilterState] = useState("");
  const [maxRowsFilter, setMaxRowsFilterState] = useState("");
  const [workspaceView, setWorkspaceViewState] = useState<SavedWorkspaceView>("all");

  const mountedRef = useRef(true);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const fetchRequestIdRef = useRef(0);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const deferredUploaderFilter = useDeferredValue(uploaderFilter);

  const activeCreatedOn = useMemo(() => {
    if (!dateFilter) return undefined;
    return [
      dateFilter.getFullYear(),
      String(dateFilter.getMonth() + 1).padStart(2, "0"),
      String(dateFilter.getDate()).padStart(2, "0"),
    ].join("-");
  }, [dateFilter]);
  const minRows = useMemo(() => parseOptionalRowCount(minRowsFilter), [minRowsFilter]);
  const maxRows = useMemo(() => parseOptionalRowCount(maxRowsFilter), [maxRowsFilter]);
  const hasActiveFilters =
    searchTerm.trim() !== ""
    || uploaderFilter.trim() !== ""
    || dateFilter !== undefined
    || minRowsFilter.trim() !== ""
    || maxRowsFilter.trim() !== "";

  const fetchImports = useCallback(async () => {
    fetchAbortControllerRef.current?.abort();
    const controller = new AbortController();
    fetchAbortControllerRef.current = controller;
    const requestId = ++fetchRequestIdRef.current;
    setError("");
    setLoading(true);

    try {
      const data = await getImports({
        page,
        pageSize,
        search: deferredSearchTerm,
        createdBy: deferredUploaderFilter,
        createdOn: activeCreatedOn,
        minRows,
        maxRows,
        view: workspaceView,
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== fetchRequestIdRef.current || !mountedRef.current) {
        return;
      }
      if (data.pagination.mode !== "offset") {
        throw new Error("Saved imports returned an unsupported pagination mode.");
      }

      setImports(Array.isArray(data.imports) ? data.imports : []);
      setTotalImports(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
      setPageState(data.pagination.page);
    } catch (fetchError: unknown) {
      if (isSavedAbortError(fetchError) || requestId !== fetchRequestIdRef.current || !mountedRef.current) {
        return;
      }
      setError(readSavedErrorMessage(fetchError, "Failed to load saved imports."));
      setImports([]);
      setTotalImports(0);
      setTotalPages(1);
    } finally {
      if (fetchAbortControllerRef.current === controller) {
        fetchAbortControllerRef.current = null;
      }
      if (requestId === fetchRequestIdRef.current && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [
    activeCreatedOn,
    deferredSearchTerm,
    deferredUploaderFilter,
    maxRows,
    minRows,
    page,
    pageSize,
    workspaceView,
  ]);

  useEffect(() => {
    void fetchImports();
  }, [fetchImports]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      fetchAbortControllerRef.current?.abort();
      fetchRequestIdRef.current += 1;
    };
  }, []);

  const resetPage = useCallback(() => setPageState(1), []);
  const setSearchTerm = useCallback((value: string) => {
    resetPage();
    setSearchTermState(value);
  }, [resetPage]);
  const setUploaderFilter = useCallback((value: string) => {
    resetPage();
    setUploaderFilterState(value);
  }, [resetPage]);
  const setDateFilter = useCallback((value?: Date) => {
    resetPage();
    setDateFilterState(value);
  }, [resetPage]);
  const setMinRowsFilter = useCallback((value: string) => {
    resetPage();
    setMinRowsFilterState(value);
  }, [resetPage]);
  const setMaxRowsFilter = useCallback((value: string) => {
    resetPage();
    setMaxRowsFilterState(value);
  }, [resetPage]);
  const setWorkspaceView = useCallback((value: SavedWorkspaceView) => {
    resetPage();
    setWorkspaceViewState(value);
  }, [resetPage]);
  const setPage = useCallback((value: number) => {
    setPageState(Math.max(1, Math.trunc(value)));
  }, []);
  const setPageSize = useCallback((value: number) => {
    setPageState(1);
    setPageSizeState(Math.max(1, Math.trunc(value)));
  }, []);

  const clearFilters = useCallback(() => {
    setPageState(1);
    setSearchTermState("");
    setUploaderFilterState("");
    setDateFilterState(undefined);
    setMinRowsFilterState("");
    setMaxRowsFilterState("");
  }, []);

  const replaceImportName = useCallback((importId: string, nextName: string) => {
    setImports((previous) =>
      previous.map((item) => (item.id === importId ? { ...item, name: nextName } : item)),
    );
  }, []);

  const removeImports = useCallback((importIds: string[]) => {
    if (importIds.length === 0) return;
    const removedIds = new Set(importIds);
    setImports((previous) => previous.filter((item) => !removedIds.has(item.id)));
    setTotalImports((previous) => Math.max(0, previous - importIds.length));
    void fetchImports();
  }, [fetchImports]);

  return {
    imports,
    totalImports,
    page,
    pageSize,
    totalPages,
    hasMoreImports: page < totalPages,
    loading,
    error,
    searchTerm,
    uploaderFilter,
    dateFilter,
    minRowsFilter,
    maxRowsFilter,
    workspaceView,
    hasActiveFilters,
    setSearchTerm,
    setUploaderFilter,
    setDateFilter,
    setMinRowsFilter,
    setMaxRowsFilter,
    setWorkspaceView,
    setPage,
    setPageSize,
    clearFilters,
    refresh: fetchImports,
    replaceImportName,
    removeImports,
  };
}
