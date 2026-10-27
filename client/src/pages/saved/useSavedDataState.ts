import { useCallback, useDeferredValue, useMemo, useState } from "react";
import type { SavedWorkspaceView } from "@/pages/saved/saved-workspace";
import { useSavedImportPage } from "@/pages/saved/useSavedImportPage";

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
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [searchTerm, setSearchTermState] = useState("");
  const [uploaderFilter, setUploaderFilterState] = useState("");
  const [dateFilter, setDateFilterState] = useState<Date | undefined>(undefined);
  const [minRowsFilter, setMinRowsFilterState] = useState("");
  const [maxRowsFilter, setMaxRowsFilterState] = useState("");
  const [workspaceView, setWorkspaceViewState] = useState<SavedWorkspaceView>("all");

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

  const contextKey = JSON.stringify([
    page, pageSize, searchTerm, uploaderFilter, activeCreatedOn,
    minRowsFilter, maxRowsFilter, workspaceView,
  ]);
  const data = useSavedImportPage({
    contextKey, queryReady: deferredSearchTerm === searchTerm && deferredUploaderFilter === uploaderFilter,
    page, pageSize, search: deferredSearchTerm, createdBy: deferredUploaderFilter,
    createdOn: activeCreatedOn, minRows, maxRows, view: workspaceView,
    onPageResolved: setPageState,
  });

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

  return {
    ...data,
    page,
    pageSize,
    hasMoreImports: page < data.totalPages,
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
  };
}
