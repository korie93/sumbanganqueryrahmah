import { useCallback, useMemo, useState } from "react";
import type { FilterRow, SearchResultRow } from "@/pages/general-search/types";
import { resolveConfiguredSearchResultLimit } from "@/pages/general-search/general-search-state-utils";
import { useGeneralSearchDataState } from "@/pages/general-search/useGeneralSearchDataState";
import { useGeneralSearchExportState } from "@/pages/general-search/useGeneralSearchExportState";
import {
  buildSearchFilterSummaries,
  createEmptyFilterRow,
  getActiveFiltersCount,
} from "@/pages/general-search/utils";

interface UseGeneralSearchControllerParams {
  searchResultLimit?: number | undefined;
  userRole?: string | undefined;
}

export function useGeneralSearchController({
  searchResultLimit,
  userRole,
}: UseGeneralSearchControllerParams) {
  const isLowSpecMode =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("low-spec");
  const configuredSearchResultLimit = useMemo(
    () => resolveConfiguredSearchResultLimit(searchResultLimit),
    [searchResultLimit],
  );
  const canSeeSourceFile = userRole === "superuser" || userRole === "admin";
  const canExport = userRole === "superuser";

  const [selectedRecord, setSelectedRecord] = useState<SearchResultRow | null>(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [filters, setFilters] = useState<FilterRow[]>([createEmptyFilterRow()]);
  const [logic, setLogic] = useState<"AND" | "OR">("AND");

  const activeFiltersCount = useMemo(
    () => getActiveFiltersCount(filters),
    [filters],
  );
  const activeFilterSummaries = useMemo(
    () => buildSearchFilterSummaries(filters),
    [filters],
  );

  const dataState = useGeneralSearchDataState({
    advancedMode,
    canSeeSourceFile,
    configuredSearchResultLimit,
    filters,
    isLowSpecMode,
    logic,
  });
  const exportState = useGeneralSearchExportState({
    activeFiltersCount,
    advancedMode,
    headers: dataState.state.headers,
    onError: dataState.actions.setError,
    query: dataState.state.query,
    results: dataState.state.results,
  });

  const addFilter = useCallback(() => {
    setFilters((previous) => [...previous, createEmptyFilterRow(Date.now().toString())]);
  }, []);

  const removeFilter = useCallback((id: string) => {
    setFilters((previous) =>
      previous.length > 1 ? previous.filter((filter) => filter.id !== id) : previous,
    );
  }, []);

  const updateFilter = useCallback((id: string, updates: Partial<FilterRow>) => {
    setFilters((previous) =>
      previous.map((filter) => (filter.id === id ? { ...filter, ...updates } : filter)),
    );
  }, []);

  const handleReset = useCallback(() => {
    dataState.actions.resetSearchState();
    setFilters([createEmptyFilterRow()]);
    setLogic("AND");
  }, [dataState.actions]);

  return {
    canExport,
    canSeeSourceFile,
    isLowSpecMode,
    state: {
      ...dataState.state,
      ...exportState.state,
      activeFilterSummaries,
      activeFiltersCount,
      advancedMode,
      filters,
      logic,
      selectedRecord,
    },
    actions: {
      addFilter,
      exportToCSV: exportState.actions.exportToCSV,
      exportToPDF: exportState.actions.exportToPDF,
      handlePageChange: dataState.actions.handlePageChange,
      handleQueryChange: dataState.actions.handleQueryChange,
      handleReset,
      handleResultsPerPageChange: dataState.actions.handleResultsPerPageChange,
      handleSearch: dataState.actions.handleSearch,
      removeFilter,
      setAdvancedMode,
      setLogic,
      setResultsPerPage: dataState.actions.handleResultsPerPageChange,
      setSelectedRecord,
      updateFilter,
    },
  };
}
