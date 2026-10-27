import { useCallback, useEffect, useRef, useState } from "react";
import { getImports } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import { isSavedAbortError } from "@/pages/saved/saved-state-utils";
import { shouldRetainSavedPage } from "@/pages/saved/saved-refresh-policy";
import type { SavedWorkspaceView } from "@/pages/saved/saved-workspace";
import type { ImportItem } from "@/pages/saved/types";

type SavedImportPageOptions = {
  contextKey: string;
  queryReady: boolean;
  page: number;
  pageSize: number;
  search: string;
  createdBy: string;
  createdOn: string | undefined;
  minRows: number | undefined;
  maxRows: number | undefined;
  view: SavedWorkspaceView;
  onPageResolved: (page: number) => void;
};
type Snapshot = { imports: ImportItem[]; totalImports: number; totalPages: number };
type PageState = { key: string; snapshot: Snapshot | null; loading: boolean; error: string; isStale: boolean };
type PageRequest = { key: string; controller: AbortController };
const EMPTY_IMPORTS: ImportItem[] = [];

export function useSavedImportPage({
  contextKey, queryReady, page, pageSize, search, createdBy, createdOn,
  minRows, maxRows, view, onPageResolved,
}: SavedImportPageOptions) {
  const [state, setState] = useState<PageState>({
    key: contextKey, snapshot: null, loading: true, error: "", isStale: false,
  });
  const mountedRef = useRef(true);
  const requestRef = useRef<PageRequest | null>(null);
  const currentQueryRef = useRef({ key: contextKey, ready: queryReady });
  const stateRef = useRef(state);
  currentQueryRef.current = { key: contextKey, ready: queryReady };
  stateRef.current = state;

  const fetchPage = useCallback(async (force = false) => {
    if (!mountedRef.current || !queryReady || currentQueryRef.current.key !== contextKey) return;
    if (!force && requestRef.current?.key === contextKey && !requestRef.current.controller.signal.aborted) return;
    requestRef.current?.controller.abort();
    const request = { key: contextKey, controller: new AbortController() };
    requestRef.current = request;
    const ownsRequest = () => mountedRef.current
      && !request.controller.signal.aborted && requestRef.current === request
      && currentQueryRef.current.key === request.key && currentQueryRef.current.ready;
    setState((previous) => ({
      key: contextKey, snapshot: previous.key === contextKey ? previous.snapshot : null,
      loading: true, error: "", isStale: false,
    }));
    try {
      const data = await getImports({
        page, pageSize, search, createdBy, createdOn, minRows, maxRows, view,
        signal: request.controller.signal,
      });
      if (!ownsRequest()) return;
      if (data.pagination.mode !== "offset") {
        throw new Error("Saved imports returned an unsupported pagination mode.");
      }
      setState({
        key: contextKey,
        snapshot: { imports: data.imports, totalImports: data.pagination.total, totalPages: data.pagination.totalPages },
        loading: false, error: "", isStale: false,
      });
      onPageResolved(data.pagination.page);
    } catch (error: unknown) {
      if (isSavedAbortError(error) || !ownsRequest()) return;
      const message = getApiErrorMessage(error, "Failed to load saved imports.");
      setState((previous) => {
        const retain = shouldRetainSavedPage({
          error, loadedKey: previous.snapshot ? previous.key : null,
          requestKey: request.key, currentKey: currentQueryRef.current.key,
        });
        return {
          key: contextKey, snapshot: retain ? previous.snapshot : null,
          loading: false, error: message, isStale: retain,
        };
      });
    } finally {
      if (requestRef.current === request) requestRef.current = null;
    }
  }, [contextKey, queryReady, page, pageSize, search, createdBy, createdOn, minRows, maxRows, view, onPageResolved]);
  const refreshRef = useRef(fetchPage);
  refreshRef.current = fetchPage;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.controller.abort();
      requestRef.current = null;
    };
  }, []);
  useEffect(() => {
    setState((previous) => previous.key === contextKey ? previous : {
      key: contextKey, snapshot: null, loading: true, error: "", isStale: false,
    });
    void fetchPage();
    return () => {
      requestRef.current?.controller.abort();
      requestRef.current = null;
    };
  }, [contextKey, fetchPage]);

  const canMutate = useCallback(() => {
    const current = stateRef.current;
    return mountedRef.current && currentQueryRef.current.ready
      && current.key === currentQueryRef.current.key && current.snapshot !== null
      && !current.loading && !current.isStale && !current.error && !requestRef.current;
  }, []);
  const replaceImportName = useCallback((id: string, name: string) => {
    setState((previous) => previous.key !== currentQueryRef.current.key || !previous.snapshot ? previous : {
      ...previous, snapshot: { ...previous.snapshot, imports: previous.snapshot.imports.map((item) => item.id === id ? { ...item, name } : item) },
    });
  }, []);
  const removeImports = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const removed = new Set(ids);
    setState((previous) => {
      if (previous.key !== currentQueryRef.current.key || !previous.snapshot) return previous;
      const imports = previous.snapshot.imports.filter((item) => !removed.has(item.id));
      const visibleRemoved = previous.snapshot.imports.length - imports.length;
      return { ...previous, snapshot: {
        ...previous.snapshot, imports,
        totalImports: Math.max(0, previous.snapshot.totalImports - visibleRemoved),
      } };
    });
    // A post-mutation read must supersede an older in-flight list response.
    void refreshRef.current(true);
  }, []);

  const matching = state.key === contextKey && queryReady;
  const snapshot = matching ? state.snapshot : null;
  const loading = !matching || state.loading;
  return {
    imports: snapshot?.imports ?? EMPTY_IMPORTS,
    totalImports: snapshot?.totalImports ?? 0,
    totalPages: snapshot?.totalPages ?? 1,
    loading, error: matching ? state.error : "",
    hasPage: snapshot !== null,
    refreshing: snapshot !== null && loading,
    isStale: snapshot !== null && state.isStale,
    canMutate, refresh: fetchPage, replaceImportName, removeImports,
  };
}
