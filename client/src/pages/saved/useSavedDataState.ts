import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { getImports } from "@/lib/api";
import type { ImportItem } from "@/pages/saved/types";
import { isSavedAbortError, mergeSavedImportPages, readSavedErrorMessage } from "@/pages/saved/saved-state-utils";

type SavedFetchOptions = {
  cursor?: string | null;
  reset?: boolean;
};

export function useSavedDataState() {
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [totalImports, setTotalImports] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);

  const mountedRef = useRef(true);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const fetchRequestIdRef = useRef(0);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const hasActiveFilters = searchTerm.trim() !== "" || dateFilter !== undefined;
  const activeCreatedOn = useMemo(
    () => (dateFilter ? dateFilter.toISOString().slice(0, 10) : undefined),
    [dateFilter],
  );
  const hasMoreImports = nextCursor !== null;

  const fetchImports = useCallback(
    async (options?: SavedFetchOptions) => {
      const reset = options?.reset !== false;
      fetchAbortControllerRef.current?.abort();
      const controller = new AbortController();
      fetchAbortControllerRef.current = controller;
      const requestId = ++fetchRequestIdRef.current;
      setError("");

      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const data = await getImports({
          cursor: options?.cursor || undefined,
          limit: 100,
          search: deferredSearchTerm,
          createdOn: activeCreatedOn,
          signal: controller.signal,
        });

        if (controller.signal.aborted || requestId !== fetchRequestIdRef.current || !mountedRef.current) {
          return;
        }

        const nextItems = Array.isArray(data?.imports) ? data.imports : [];
        const nextTotal = typeof data?.pagination?.total === "number" ? data.pagination.total : nextItems.length;
        const nextPageCursor = typeof data?.pagination?.nextCursor === "string" ? data.pagination.nextCursor : null;

        setTotalImports(nextTotal);
        setNextCursor(nextPageCursor);
        setImports((previous) => (reset ? nextItems : mergeSavedImportPages(previous, nextItems)));
      } catch (error: unknown) {
        if (isSavedAbortError(error) || requestId !== fetchRequestIdRef.current || !mountedRef.current) {
          return;
        }

        setError(readSavedErrorMessage(error, "Failed to load data."));
        if (reset) {
          setImports([]);
          setTotalImports(0);
          setNextCursor(null);
        }
      } finally {
        if (fetchAbortControllerRef.current === controller) {
          fetchAbortControllerRef.current = null;
        }
        if (requestId === fetchRequestIdRef.current && mountedRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [activeCreatedOn, deferredSearchTerm],
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      fetchAbortControllerRef.current?.abort();
      fetchRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      return;
    }
    void fetchImports({ reset: true });
  }, [fetchImports]);

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setDateFilter(undefined);
  }, []);

  const refresh = useCallback(async () => {
    await fetchImports({ reset: true });
  }, [fetchImports]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) {
      return;
    }
    await fetchImports({ cursor: nextCursor, reset: false });
  }, [fetchImports, nextCursor]);

  const replaceImportName = useCallback((importId: string, nextName: string) => {
    setImports((previous) =>
      previous.map((item) => (item.id === importId ? { ...item, name: nextName } : item)),
    );
  }, []);

  const removeImports = useCallback((importIds: string[]) => {
    if (importIds.length === 0) {
      return;
    }

    const removedIds = new Set(importIds);
    setImports((previous) => previous.filter((item) => !removedIds.has(item.id)));
    setTotalImports((previous) => Math.max(0, previous - importIds.length));
  }, []);

  return {
    imports,
    totalImports,
    nextCursor,
    hasMoreImports,
    loading,
    loadingMore,
    error,
    searchTerm,
    dateFilter,
    hasActiveFilters,
    setSearchTerm,
    setDateFilter,
    clearFilters,
    refresh,
    loadMore,
    replaceImportName,
    removeImports,
  };
}
