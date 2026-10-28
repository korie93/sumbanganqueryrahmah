import { useCallback, useEffect, useRef, useState } from "react";
import { getImportSummary } from "@/lib/api";
import { isAbortError } from "@/lib/api-client-retry";
import { isReadDeadlineError, withReadDeadline } from "@/lib/read-deadline";
import { isSavedRetryableReadError } from "@/pages/saved/saved-refresh-policy";
import type { SavedImportSummary } from "@/pages/saved/types";

type DetailState = {
  importId: string | null;
  summary: SavedImportSummary | null;
  loading: boolean;
  error: string;
  retrying: boolean;
};
type DetailRequest = { importId: string; controller: AbortController };
const emptyState: DetailState = {
  importId: null, summary: null, loading: false, error: "", retrying: false,
};

export function useSavedImportDetailState(importId: string | null) {
  const [state, setState] = useState<DetailState>(emptyState);
  const mountedRef = useRef(false);
  const currentImportRef = useRef(importId);
  const requestRef = useRef<DetailRequest | null>(null);
  const failedImportRef = useRef<string | null>(null);
  currentImportRef.current = importId;

  const load = useCallback((id: string, retrying = false) => {
    if (!mountedRef.current || currentImportRef.current !== id || requestRef.current) return;
    const controller = new AbortController();
    const request = { importId: id, controller };
    requestRef.current = request;
    const ownsRequest = () => mountedRef.current
      && currentImportRef.current === id
      && requestRef.current === request
      && !controller.signal.aborted;

    setState((previous) => ({
      importId: id, summary: null, loading: true, retrying,
      error: retrying && previous.importId === id ? previous.error : "",
    }));
    void withReadDeadline((signal) => getImportSummary(id, { signal, retry: false }), controller.signal)
      .then((summary) => {
        if (!ownsRequest()) return;
        failedImportRef.current = null;
        setState({ importId: id, summary, loading: false, error: "", retrying: false });
      })
      .catch((error: unknown) => {
        if (!ownsRequest() || isAbortError(error)) return;
        failedImportRef.current = isSavedRetryableReadError(error) ? id : null;
        setState({
          importId: id, summary: null, loading: false, retrying: false,
          error: isReadDeadlineError(error) ? error.message : "Butiran fail belum dapat dimuatkan.",
        });
      })
      .finally(() => {
        if (requestRef.current === request) requestRef.current = null;
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    failedImportRef.current = null;
    if (importId) load(importId);
    else setState(emptyState);
    return () => {
      requestRef.current?.controller.abort();
      requestRef.current = null;
      failedImportRef.current = null;
    };
  }, [importId, load]);

  const retry = useCallback(() => {
    const id = failedImportRef.current;
    if (id && id === currentImportRef.current) load(id, true);
  }, [load]);

  // Hide an earlier file synchronously, before its effect cleanup runs.
  const visible = state.importId === importId;
  return {
    summary: visible ? state.summary : null,
    loading: visible ? state.loading : Boolean(importId),
    error: visible ? state.error : "",
    retrying: visible && state.retrying,
    canRetry: visible && Boolean(importId && state.error && failedImportRef.current === importId),
    retry,
  };
}
