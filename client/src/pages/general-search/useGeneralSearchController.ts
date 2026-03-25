import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { advancedSearchData, getSearchColumns, searchData } from "@/lib/api";
import type { FilterRow, SearchResultRow } from "@/pages/general-search/types";
import { resolveGeneralSearchExportBlockReason } from "@/pages/general-search/export-guards";
import {
  collectSearchHeaders,
  createEmptyFilterRow,
  downloadSearchResultsAsCsv,
  getActiveFiltersCount,
} from "@/pages/general-search/utils";

interface UseGeneralSearchControllerParams {
  searchResultLimit?: number;
  userRole?: string;
}

export function useGeneralSearchController({
  searchResultLimit,
  userRole,
}: UseGeneralSearchControllerParams) {
  const isMountedRef = useRef(true);
  const searchRequestIdRef = useRef(0);
  const columnsRequestIdRef = useRef(0);
  const exportInFlightRef = useRef(false);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const columnsAbortControllerRef = useRef<AbortController | null>(null);

  const isLowSpecMode =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("low-spec");
  const configuredSearchResultLimit = useMemo(() => {
    const parsed = Number(searchResultLimit);
    if (!Number.isFinite(parsed)) return 200;
    return Math.min(5000, Math.max(10, Math.floor(parsed)));
  }, [searchResultLimit]);
  const canSeeSourceFile = userRole === "superuser" || userRole === "admin";
  const canExport = userRole === "superuser";

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [resultsPerPage, setResultsPerPage] = useState(configuredSearchResultLimit);
  const [selectedRecord, setSelectedRecord] = useState<SearchResultRow | null>(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [filters, setFilters] = useState<FilterRow[]>([createEmptyFilterRow()]);
  const [logic, setLogic] = useState<"AND" | "OR">("AND");
  const [columns, setColumns] = useState<string[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  const pageSizeOptions = useMemo(() => {
    const base = isLowSpecMode ? [20, 40, 80] : [25, 50, 100, 200, 500, 1000];
    const withinLimit = base.filter((value) => value <= configuredSearchResultLimit);
    const withConfigured = Array.from(
      new Set([...withinLimit, configuredSearchResultLimit]),
    );
    return withConfigured.sort((left, right) => left - right);
  }, [configuredSearchResultLimit, isLowSpecMode]);

  const activeFiltersCount = useMemo(
    () => getActiveFiltersCount(filters),
    [filters],
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      searchRequestIdRef.current += 1;
      columnsRequestIdRef.current += 1;
      searchAbortControllerRef.current?.abort();
      searchAbortControllerRef.current = null;
      columnsAbortControllerRef.current?.abort();
      columnsAbortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    setResultsPerPage((previous) =>
      previous === configuredSearchResultLimit ? previous : configuredSearchResultLimit,
    );
    setCurrentPage(1);
  }, [configuredSearchResultLimit]);

  const updateSearchResults = useCallback(
    (
      nextResults: SearchResultRow[],
      total: number,
      pageNumber: number,
      effectiveLimit: number,
    ) => {
      setTotalResults(total);
      setCurrentPage(pageNumber);
      setHeaders(
        nextResults.length > 0
          ? collectSearchHeaders(nextResults, canSeeSourceFile)
          : [],
      );
      setResults(nextResults.slice(0, effectiveLimit));
    },
    [canSeeSourceFile],
  );

  const loadColumns = useCallback(async () => {
    const requestId = ++columnsRequestIdRef.current;
    columnsAbortControllerRef.current?.abort();
    const controller = new AbortController();
    columnsAbortControllerRef.current = controller;
    setLoadingColumns(true);
    try {
      const response = await getSearchColumns({ signal: controller.signal });
      if (!isMountedRef.current || requestId !== columnsRequestIdRef.current) return;
      setColumns(Array.isArray(response) ? response : []);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }
      if (!isMountedRef.current || requestId !== columnsRequestIdRef.current) return;
      console.error("Failed to load columns:", loadError);
    } finally {
      if (columnsAbortControllerRef.current === controller) {
        columnsAbortControllerRef.current = null;
      }
      if (!isMountedRef.current || requestId !== columnsRequestIdRef.current) return;
      setLoadingColumns(false);
    }
  }, []);

  const handleSimpleSearch = useCallback(
    async (pageNumber = 1, limitOverride?: number) => {
      const trimmedQuery = query.trim();
      if (trimmedQuery.length < 2) {
        setError("Please enter at least 2 characters.");
        return;
      }

      const effectiveLimit = Math.min(
        configuredSearchResultLimit,
        Math.max(
          10,
          Number(limitOverride ?? resultsPerPage) || configuredSearchResultLimit,
        ),
      );

      const requestId = ++searchRequestIdRef.current;
      searchAbortControllerRef.current?.abort();
      const controller = new AbortController();
      searchAbortControllerRef.current = controller;
      setLoading(true);
      setError("");
      setSearched(true);

      try {
        const response = await searchData(trimmedQuery, pageNumber, effectiveLimit, {
          signal: controller.signal,
        });
        if (!isMountedRef.current || requestId !== searchRequestIdRef.current) return;
        const nextResults = (response.results || response.rows || []) as SearchResultRow[];
        const cappedTotal = Math.min(
          Number(response.total || nextResults.length),
          configuredSearchResultLimit,
        );

        updateSearchResults(nextResults, cappedTotal, pageNumber, effectiveLimit);
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") {
          return;
        }
        if (!isMountedRef.current || requestId !== searchRequestIdRef.current) return;
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Failed to search data.",
        );
        setResults([]);
        setHeaders([]);
      } finally {
        if (searchAbortControllerRef.current === controller) {
          searchAbortControllerRef.current = null;
        }
        if (!isMountedRef.current || requestId !== searchRequestIdRef.current) return;
        setLoading(false);
      }
    },
    [configuredSearchResultLimit, query, resultsPerPage, updateSearchResults],
  );

  const handleAdvancedSearch = useCallback(
    async (pageNumber = 1, limitOverride?: number) => {
      const validFilters = filters.filter(
        (filter) =>
          filter.field &&
          (filter.operator === "isEmpty" ||
            filter.operator === "isNotEmpty" ||
            filter.value.trim()),
      );

      if (validFilters.length === 0) {
        setError("Please add at least one valid filter.");
        return;
      }

      const effectiveLimit = Math.min(
        configuredSearchResultLimit,
        Math.max(
          10,
          Number(limitOverride ?? resultsPerPage) || configuredSearchResultLimit,
        ),
      );

      const requestId = ++searchRequestIdRef.current;
      searchAbortControllerRef.current?.abort();
      const controller = new AbortController();
      searchAbortControllerRef.current = controller;
      setLoading(true);
      setError("");
      setSearched(true);

      try {
        const response = await advancedSearchData(
          validFilters,
          logic,
          pageNumber,
          effectiveLimit,
          { signal: controller.signal },
        );
        if (!isMountedRef.current || requestId !== searchRequestIdRef.current) return;
        const nextResults = (response.results || response.rows || []) as SearchResultRow[];
        const cappedTotal = Math.min(
          Number(response.total || nextResults.length),
          configuredSearchResultLimit,
        );

        updateSearchResults(nextResults, cappedTotal, pageNumber, effectiveLimit);
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") {
          return;
        }
        if (!isMountedRef.current || requestId !== searchRequestIdRef.current) return;
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Advanced search failed.",
        );
        setResults([]);
        setHeaders([]);
      } finally {
        if (searchAbortControllerRef.current === controller) {
          searchAbortControllerRef.current = null;
        }
        if (!isMountedRef.current || requestId !== searchRequestIdRef.current) return;
        setLoading(false);
      }
    },
    [configuredSearchResultLimit, filters, logic, resultsPerPage, updateSearchResults],
  );

  useEffect(() => {
    if (!searched) return;
    if (advancedMode) {
      void handleAdvancedSearch(1);
      return;
    }
    void handleSimpleSearch(1);
  }, [advancedMode, handleAdvancedSearch, handleSimpleSearch, resultsPerPage, searched]);

  useEffect(() => {
    if (!advancedMode || columns.length > 0) return;
    void loadColumns();
  }, [advancedMode, columns.length, loadColumns]);

  const handleSearch = useCallback(() => {
    setCurrentPage(1);
    if (advancedMode) {
      void handleAdvancedSearch(1);
      return;
    }
    void handleSimpleSearch(1);
  }, [advancedMode, handleAdvancedSearch, handleSimpleSearch]);

  const handlePageChange = useCallback(
    (pageNumber: number) => {
      if (advancedMode) {
        void handleAdvancedSearch(pageNumber);
        return;
      }
      void handleSimpleSearch(pageNumber);
    },
    [advancedMode, handleAdvancedSearch, handleSimpleSearch],
  );

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (value.trim().length === 0) {
      searchRequestIdRef.current += 1;
      searchAbortControllerRef.current?.abort();
      searchAbortControllerRef.current = null;
      setResults([]);
      setHeaders([]);
      setSearched(false);
      setError("");
      setTotalResults(0);
      setCurrentPage(1);
    }
  }, []);

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

  const exportToCSV = useCallback(() => {
    if (results.length === 0) return;
    const exportName = `SQR-search-results-${
      advancedMode ? "advanced" : query
    }-${new Date().toISOString().split("T")[0]}.csv`;
    downloadSearchResultsAsCsv(headers, results, exportName);
  }, [advancedMode, headers, query, results]);

  const exportToPDF = useCallback(async () => {
    const blockReason = resolveGeneralSearchExportBlockReason({
      resultsLength: results.length,
      exportingPdf,
    });
    if (blockReason === "busy" || exportInFlightRef.current) return;
    if (blockReason === "no_data") return;

    exportInFlightRef.current = true;
    setExportingPdf(true);
    try {
      const { exportSearchResultsToPdf } = await import(
        "@/pages/general-search/export"
      );
      await exportSearchResultsToPdf({
        advancedMode,
        activeFiltersCount,
        headers,
        query,
        results,
      });
    } catch (exportError) {
      setError(
        `Failed to export PDF: ${
          exportError instanceof Error ? exportError.message : "Unknown error"
        }`,
      );
    } finally {
      exportInFlightRef.current = false;
      if (!isMountedRef.current) return;
      setExportingPdf(false);
    }
  }, [activeFiltersCount, advancedMode, exportingPdf, headers, query, results]);

  const handleReset = useCallback(() => {
    searchRequestIdRef.current += 1;
    searchAbortControllerRef.current?.abort();
    searchAbortControllerRef.current = null;
    setQuery("");
    setResults([]);
    setHeaders([]);
    setError("");
    setSearched(false);
    setTotalResults(0);
    setCurrentPage(1);
    setFilters([createEmptyFilterRow()]);
    setLogic("AND");
  }, []);

  const handleResultsPerPageChange = useCallback((nextSize: number) => {
    setResultsPerPage(nextSize);
    setCurrentPage(1);
  }, []);

  return {
    canExport,
    canSeeSourceFile,
    isLowSpecMode,
    state: {
      query,
      displayQuery: deferredQuery,
      results,
      headers,
      loading,
      error,
      searched,
      exportingPdf,
      currentPage,
      totalResults,
      resultsPerPage,
      selectedRecord,
      advancedMode,
      filters,
      logic,
      columns,
      loadingColumns,
      activeFiltersCount,
      pageSizeOptions,
    },
    actions: {
      setAdvancedMode,
      setLogic,
      setResultsPerPage,
      setSelectedRecord,
      handleSearch,
      handlePageChange,
      handleQueryChange,
      addFilter,
      removeFilter,
      updateFilter,
      exportToCSV,
      exportToPDF: () => void exportToPDF(),
      handleReset,
      handleResultsPerPageChange,
    },
  };
}
