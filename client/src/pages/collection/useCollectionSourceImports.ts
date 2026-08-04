import { useCallback, useEffect, useRef, useState } from "react";
import { getImports } from "@/lib/api";
import type { ImportsListResponse } from "@shared/api-contracts";

export type CollectionSourceImport = Pick<
  ImportsListResponse["imports"][number],
  "filename" | "id" | "name" | "rowCount"
>;

const SOURCE_IMPORT_PAGE_SIZE = 25;
const SOURCE_IMPORT_SEARCH_DELAY_MS = 250;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useCollectionSourceImports() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [imports, setImports] = useState<CollectionSourceImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SOURCE_IMPORT_SEARCH_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");

    void getImports({
      page: 1,
      pageSize: SOURCE_IMPORT_PAGE_SIZE,
      search: debouncedSearch,
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setImports(response.imports);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current || isAbortError(loadError)) {
          return;
        }
        setImports([]);
        setError(loadError instanceof Error ? loadError.message : "Failed to load Saved files.");
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === requestIdRef.current) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [debouncedSearch, reloadToken]);

  const retry = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  return {
    error,
    imports,
    loading,
    retry,
    search,
    setSearch,
  };
}
