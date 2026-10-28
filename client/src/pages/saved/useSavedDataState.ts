import { useCallback, useMemo, useState } from "react";
import type { SavedWorkspaceView } from "@/pages/saved/saved-workspace";
import { useSavedImportPage } from "@/pages/saved/useSavedImportPage";
import { useSavedSearchQuery } from "@/pages/saved/useSavedSearchQuery";
import { parseSavedReturnDate, type SavedReturnQuery } from "@/pages/saved/saved-return-context";

const DEFAULT_PAGE_SIZE = 20;

function parseOptionalRowCount(value: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function useSavedDataState(initialQuery?: SavedReturnQuery) {
  const [page, setPageState] = useState(initialQuery?.page ?? 1);
  const [pageSize, setPageSizeState] = useState(initialQuery?.pageSize ?? DEFAULT_PAGE_SIZE);
  const query = useSavedSearchQuery(initialQuery);
  const { searchTerm, uploaderFilter, setSearchTerm: updateSearch, setUploaderFilter: updateUploader,
    flush, reset: resetSearch } = query;
  const [dateFilter, setDateFilterState] = useState(() => parseSavedReturnDate(initialQuery?.createdOn));
  const [minRowsFilter, setMinRowsFilterState] = useState(initialQuery?.minRowsFilter ?? "");
  const [maxRowsFilter, setMaxRowsFilterState] = useState(initialQuery?.maxRowsFilter ?? "");
  const [workspaceView, setWorkspaceViewState] = useState<SavedWorkspaceView>(initialQuery?.workspaceView ?? "all");

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
    contextKey, queryReady: query.queryReady,
    page, pageSize, search: query.submitted.searchTerm, createdBy: query.submitted.uploaderFilter,
    createdOn: activeCreatedOn, minRows, maxRows, view: workspaceView,
    onPageResolved: setPageState,
  });

  const resetPage = useCallback(() => setPageState(1), []);
  const setSearchTerm = useCallback((value: string) => {
    resetPage();
    updateSearch(value);
  }, [resetPage, updateSearch]);
  const setUploaderFilter = useCallback((value: string) => {
    resetPage();
    updateUploader(value);
  }, [resetPage, updateUploader]);
  const setDateFilter = useCallback((value?: Date) => {
    resetPage();
    flush();
    setDateFilterState(value);
  }, [flush, resetPage]);
  const setMinRowsFilter = useCallback((value: string) => {
    resetPage();
    flush();
    setMinRowsFilterState(value);
  }, [flush, resetPage]);
  const setMaxRowsFilter = useCallback((value: string) => {
    resetPage();
    flush();
    setMaxRowsFilterState(value);
  }, [flush, resetPage]);
  const setWorkspaceView = useCallback((value: SavedWorkspaceView) => {
    resetPage();
    flush();
    setWorkspaceViewState(value);
  }, [flush, resetPage]);
  const setPage = useCallback((value: number) => {
    flush();
    setPageState(Math.max(1, Math.trunc(value)));
  }, [flush]);
  const setPageSize = useCallback((value: number) => {
    flush();
    setPageState(1);
    setPageSizeState(Math.max(1, Math.trunc(value)));
  }, [flush]);

  const clearFilters = useCallback(() => {
    setPageState(1);
    resetSearch();
    setDateFilterState(undefined);
    setMinRowsFilterState("");
    setMaxRowsFilterState("");
  }, [resetSearch]);

  const refresh = useCallback(() => {
    if (flush()) void data.refresh();
  }, [data.refresh, flush]);

  return {
    ...data,
    refresh,
    searchPending: !query.queryReady,
    searchComposing: query.composing,
    submitSearch: flush,
    setSearchComposing: query.setSearchComposing,
    setUploaderComposing: query.setUploaderComposing,
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
