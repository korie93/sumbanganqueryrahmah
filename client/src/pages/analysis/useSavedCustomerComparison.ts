import { useCallback, useEffect, useRef, useState } from "react";
import { compareSavedImports } from "@/lib/api";
import type {
  ImportComparisonCategory,
  ImportComparisonResponse,
} from "@shared/common/import-comparison-contract";

const COMPARISON_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useSavedCustomerComparison(
  baselineId: string,
  currentId: string,
) {
  const [category, setCategoryState] = useState<ImportComparisonCategory>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ImportComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");

    void compareSavedImports(baselineId, currentId, {
      category,
      search,
      page,
      pageSize: COMPARISON_PAGE_SIZE,
      signal: controller.signal,
    })
      .then((result) => {
        if (
          controller.signal.aborted
          || requestControllerRef.current !== controller
          || requestIdRef.current !== requestId
        ) {
          return;
        }
        setData(result);
        if (result.pagination.page !== page) {
          setPage(result.pagination.page);
        }
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted || isAbortError(requestError)) return;
        if (
          requestControllerRef.current === controller
          && requestIdRef.current === requestId
        ) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to compare customer records.",
          );
        }
      })
      .finally(() => {
        if (
          requestControllerRef.current === controller
          && requestIdRef.current === requestId
        ) {
          requestControllerRef.current = null;
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
    };
  }, [baselineId, category, currentId, page, refreshKey, search]);

  useEffect(() => () => {
    requestControllerRef.current?.abort();
    requestIdRef.current += 1;
  }, []);

  const setCategory = useCallback((value: ImportComparisonCategory) => {
    setCategoryState(value);
    setPage(1);
  }, []);

  const retry = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  return {
    category,
    data,
    error,
    loading,
    page,
    searchInput,
    retry,
    setCategory,
    setPage,
    setSearchInput,
  };
}
