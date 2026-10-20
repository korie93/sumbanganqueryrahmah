import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { advancedSearchData, getSearchColumns, searchData } from "@/lib/api";
import { logClientError } from "@/lib/client-logger";
import type { FilterRow, SearchResultRow } from "@/pages/general-search/types";
import {
  buildGeneralSearchInputKey,
  buildGeneralSearchPageSizeOptions,
  clampGeneralSearchResultsPageSize,
  getValidGeneralSearchFilters,
  normalizeGeneralSearchResponse,
  resolveDefaultGeneralSearchPageSize,
  resolveGeneralSearchResultState,
  shouldAutomaticallyRefreshGeneralSearch,
} from "@/pages/general-search/general-search-state-utils";
import { collectSearchHeaders } from "@/pages/general-search/utils";

interface UseGeneralSearchDataStateParams {
  advancedMode: boolean;
  canSeeSourceFile: boolean;
  configuredSearchResultLimit: number;
  filters: FilterRow[];
  isLowSpecMode: boolean;
  logic: "AND" | "OR";
}

export function useGeneralSearchDataState({
  advancedMode,
  canSeeSourceFile,
  configuredSearchResultLimit,
  filters,
  isLowSpecMode,
  logic,
}: UseGeneralSearchDataStateParams) {
  const isMountedRef = useRef(true);
  const searchRequestIdRef = useRef(0);
  const columnsRequestIdRef = useRef(0);
  const previouslySearchedRef = useRef(false);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const columnsAbortControllerRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [successfulInputKey, setSuccessfulInputKey] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [totalResultsIsApproximate, setTotalResultsIsApproximate] = useState(false);
  const defaultResultsPerPage = useMemo(
    () =>
      resolveDefaultGeneralSearchPageSize(
        configuredSearchResultLimit,
        isLowSpecMode,
      ),
    [configuredSearchResultLimit, isLowSpecMode],
  );
  const [resultsPerPage, setResultsPerPage] = useState(defaultResultsPerPage);
  const [columns, setColumns] = useState<string[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const currentInputKey = useMemo(
    () => buildGeneralSearchInputKey(advancedMode
      ? { mode: "advanced", filters, logic }
      : { mode: "simple", query }),
    [advancedMode, filters, logic, query],
  );

  const pageSizeOptions = useMemo(
    () =>
      buildGeneralSearchPageSizeOptions(
        configuredSearchResultLimit,
        isLowSpecMode,
      ),
    [configuredSearchResultLimit, isLowSpecMode],
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
    setResultsPerPage((previous) => Math.min(previous, configuredSearchResultLimit));
    setCurrentPage(1);
  }, [configuredSearchResultLimit]);

  const updateSearchResults = useCallback(
    (
      nextResults: SearchResultRow[],
      total: number,
      totalIsApproximate: boolean,
      pageNumber: number,
      effectiveLimit: number,
    ) => {
      setTotalResults(total);
      setTotalResultsIsApproximate(totalIsApproximate);
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
      logClientError("Failed to load general-search columns:", loadError);
    } finally {
      if (columnsAbortControllerRef.current === controller) {
        columnsAbortControllerRef.current = null;
      }
      if (isMountedRef.current && requestId === columnsRequestIdRef.current) {
        setLoadingColumns(false);
      }
    }
  }, []);

  const handleSimpleSearch = useCallback(
    async (pageNumber = 1, limitOverride?: number) => {
      const trimmedQuery = query.trim();
      if (trimmedQuery.length < 2) {
        setError("Please enter at least 2 characters.");
        return;
      }
      const requestInputKey = buildGeneralSearchInputKey({ mode: "simple", query: trimmedQuery });

      const effectiveLimit = clampGeneralSearchResultsPageSize(
        limitOverride ?? resultsPerPage,
        configuredSearchResultLimit,
      );

      const requestId = ++searchRequestIdRef.current;
      searchAbortControllerRef.current?.abort();
      const controller = new AbortController();
      searchAbortControllerRef.current = controller;
      setLoading(true);
      setError("");
      setSearched(true);
      setSuccessfulInputKey(null);

      try {
        const response = await searchData(trimmedQuery, pageNumber, effectiveLimit, {
          signal: controller.signal,
        });
        if (!isMountedRef.current || requestId !== searchRequestIdRef.current) return;
        const { cappedTotal, nextResults, totalIsApproximate } = normalizeGeneralSearchResponse(
          response,
          configuredSearchResultLimit,
        );
        updateSearchResults(nextResults, cappedTotal, totalIsApproximate, pageNumber, effectiveLimit);
        setSuccessfulInputKey(requestInputKey);
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
        setTotalResultsIsApproximate(false);
      } finally {
        if (searchAbortControllerRef.current === controller) {
          searchAbortControllerRef.current = null;
        }
        if (isMountedRef.current && requestId === searchRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [configuredSearchResultLimit, query, resultsPerPage, updateSearchResults],
  );

  const handleAdvancedSearch = useCallback(
    async (pageNumber = 1, limitOverride?: number) => {
      const validFilters = getValidGeneralSearchFilters(filters);

      if (validFilters.length === 0) {
        setError("Please add at least one valid filter.");
        return;
      }
      const requestInputKey = buildGeneralSearchInputKey({ mode: "advanced", filters: validFilters, logic });

      const effectiveLimit = clampGeneralSearchResultsPageSize(
        limitOverride ?? resultsPerPage,
        configuredSearchResultLimit,
      );

      const requestId = ++searchRequestIdRef.current;
      searchAbortControllerRef.current?.abort();
      const controller = new AbortController();
      searchAbortControllerRef.current = controller;
      setLoading(true);
      setError("");
      setSearched(true);
      setSuccessfulInputKey(null);

      try {
        const response = await advancedSearchData(
          validFilters,
          logic,
          pageNumber,
          effectiveLimit,
          { signal: controller.signal },
        );
        if (!isMountedRef.current || requestId !== searchRequestIdRef.current) return;
        const { cappedTotal, nextResults, totalIsApproximate } = normalizeGeneralSearchResponse(
          response,
          configuredSearchResultLimit,
        );
        updateSearchResults(nextResults, cappedTotal, totalIsApproximate, pageNumber, effectiveLimit);
        setSuccessfulInputKey(requestInputKey);
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
        setTotalResultsIsApproximate(false);
      } finally {
        if (searchAbortControllerRef.current === controller) {
          searchAbortControllerRef.current = null;
        }
        if (isMountedRef.current && requestId === searchRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [configuredSearchResultLimit, filters, logic, resultsPerPage, updateSearchResults],
  );

  useEffect(() => {
    const previouslySearched = previouslySearchedRef.current;
    previouslySearchedRef.current = searched;
    // The first explicit submit already owns its request. Only later changes
    // to search inputs should refresh it, not the searched=false→true update.
    if (!shouldAutomaticallyRefreshGeneralSearch(searched, previouslySearched)) return;
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
      setLoading(false);
      setResults([]);
      setHeaders([]);
      setSearched(false);
      setSuccessfulInputKey(null);
      setError("");
      setTotalResults(0);
      setTotalResultsIsApproximate(false);
      setCurrentPage(1);
    }
  }, []);

  const resetSearchState = useCallback(() => {
    searchRequestIdRef.current += 1;
    searchAbortControllerRef.current?.abort();
    searchAbortControllerRef.current = null;
    setLoading(false);
    setQuery("");
    setResults([]);
    setHeaders([]);
    setError("");
    setSearched(false);
    setSuccessfulInputKey(null);
    setTotalResults(0);
    setTotalResultsIsApproximate(false);
    setCurrentPage(1);
  }, []);

  const handleResultsPerPageChange = useCallback((nextSize: number) => {
    setResultsPerPage(nextSize);
    setCurrentPage(1);
  }, []);

  const { hasCurrentSuccessfulSearch, showEmptyState } = resolveGeneralSearchResultState({
    currentInputKey,
    successfulInputKey,
    searched,
    loading,
    error,
    resultCount: results.length,
    totalResults,
  });

  return {
    state: {
      columns,
      currentPage,
      displayQuery: deferredQuery,
      error,
      headers,
      hasCurrentSuccessfulSearch,
      loading,
      loadingColumns,
      pageSizeOptions,
      query,
      results,
      resultsPerPage,
      searched,
      showEmptyState,
      totalResults,
      totalResultsIsApproximate,
    },
    actions: {
      handlePageChange,
      handleQueryChange,
      handleResultsPerPageChange,
      handleSearch,
      resetSearchState,
      setError,
    },
  };
}
