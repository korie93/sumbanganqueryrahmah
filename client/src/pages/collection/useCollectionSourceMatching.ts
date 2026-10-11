import { useCallback, useEffect, useRef, useState } from "react";
import { getCollectionSourceMatches, type CollectionSourceMatch } from "@/lib/api";
import {
  classifyCollectionMatchingError,
  COLLECTION_MATCHING_DEBOUNCE_MS,
  COLLECTION_MATCHING_TIMEOUT_MS,
  normalizeCollectionMatchingInput,
  type CollectionMatchingErrorKind,
  type CollectionMatchingStatus,
  type CollectionSourceMatchingInput,
} from "./collection-source-matching-policy";

type MatchingResult = {
  contextKey: string;
  status: "checking" | "matched" | "no-match" | "error";
  matches: CollectionSourceMatch[];
  error: string;
  errorKind: CollectionMatchingErrorKind | null;
  retryAt: number;
};

type MatchingOptions = {
  enabled?: boolean;
  paused?: boolean;
  scopeKey?: string;
};

export function useCollectionSourceMatching(
  identity: CollectionSourceMatchingInput,
  { enabled = true, paused = false, scopeKey = "" }: MatchingOptions = {},
) {
  const input = normalizeCollectionMatchingInput(identity);
  const contextKey = enabled && input ? JSON.stringify([scopeKey, input]) : null;
  const contextRef = useRef({ contextKey, input, paused });
  contextRef.current = { contextKey, input, paused };

  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultRef = useRef<MatchingResult | null>(null);
  const [result, setResult] = useState<MatchingResult | null>(null);
  const [retryClock, setRetryClock] = useState(0);

  const updateResult = useCallback((next: MatchingResult | null) => {
    resultRef.current = next;
    setResult(next);
  }, []);

  const clearMatchingResources = useCallback(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    debounceRef.current = null;
    timeoutRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestIdRef.current += 1;
  }, []);

  const resetMatches = useCallback(() => {
    clearMatchingResources();
    updateResult(null);
  }, [clearMatchingResources, updateResult]);

  const runMatching = useCallback(async (expectedContextKey?: string) => {
    const current = contextRef.current;
    if (
      !current.contextKey || !current.input || current.paused
      || (expectedContextKey !== undefined && expectedContextKey !== current.contextKey)
    ) return;
    clearMatchingResources();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = requestIdRef.current;
    const requestContextKey = current.contextKey;
    const pending: MatchingResult = {
      contextKey: requestContextKey,
      status: "checking",
      matches: [],
      error: "",
      errorKind: null,
      retryAt: 0,
    };
    updateResult(pending);

    const isCurrentRequest = () => (
      !controller.signal.aborted
      && requestId === requestIdRef.current
      && requestContextKey === contextRef.current.contextKey
      && !contextRef.current.paused
    );
    const finish = (next: MatchingResult) => {
      if (!isCurrentRequest()) return;
      clearMatchingResources();
      updateResult(next);
    };
    const fail = (error: unknown) => {
      const failure = classifyCollectionMatchingError(error);
      finish({
        ...pending,
        status: failure.errorKind === "no-match" ? "no-match" : "error",
        error: failure.message,
        errorKind: failure.errorKind,
        retryAt: Date.now() + failure.retryAfterMs,
      });
    };

    // The API leaves timeouts to callers that supply an AbortSignal.
    timeoutRef.current = setTimeout(() => {
      fail(new DOMException("Matching request timed out", "TimeoutError"));
    }, COLLECTION_MATCHING_TIMEOUT_MS);

    try {
      const response = await getCollectionSourceMatches(current.input, { signal: controller.signal });
      if (response.matches.length > 1) {
        finish({ ...pending, status: "error", errorKind: "ambiguous" });
      } else {
        finish({
          ...pending,
          status: response.matches.length === 1 ? "matched" : "no-match",
          matches: response.matches,
          errorKind: response.matches.length === 0 ? "no-match" : null,
        });
      }
    } catch (error: unknown) {
      if (isCurrentRequest()) fail(error);
    }
  }, [clearMatchingResources, updateResult]);

  useEffect(() => {
    clearMatchingResources();
    const previous = resultRef.current;
    const completed = previous?.contextKey === contextKey && previous.status !== "checking";
    if (!completed) updateResult(null);
    if (contextKey && !paused && !completed) {
      debounceRef.current = setTimeout(() => void runMatching(contextKey), COLLECTION_MATCHING_DEBOUNCE_MS);
    }
    return clearMatchingResources;
  }, [contextKey, paused, clearMatchingResources, runMatching, updateResult]);

  // Suppress the old context during render, before effect cleanup can run.
  const visibleResult = contextKey && result?.contextKey === contextKey ? result : null;
  const status: CollectionMatchingStatus = !enabled ? "paused" : !contextKey
    ? "incomplete"
    : paused ? "paused" : visibleResult?.status ?? "waiting";
  const retryAt = visibleResult?.retryAt ?? 0;
  useEffect(() => {
    if (status !== "error" || visibleResult?.errorKind !== "transient" || retryAt <= Date.now()) return;
    // This timer only enables the button. It never retries a request.
    const timer = setTimeout(() => setRetryClock(Date.now()), Math.min(retryAt - Date.now(), 2_147_483_647));
    return () => clearTimeout(timer);
  }, [status, visibleResult?.errorKind, retryAt, retryClock]);

  const canRetry = status === "error"
    && visibleResult?.errorKind === "transient"
    && retryAt <= Date.now();
  const retryMatching = useCallback(() => {
    const current = contextRef.current;
    const previous = resultRef.current;
    if (
      !current.contextKey || current.paused
      || previous?.contextKey !== current.contextKey
      || previous.status !== "error" || previous.errorKind !== "transient"
      || previous.retryAt > Date.now()
    ) return;
    void runMatching();
  }, [runMatching]);

  const matches = visibleResult?.matches ?? [];
  return {
    status,
    error: visibleResult?.error ?? "",
    errorKind: visibleResult?.errorKind ?? null,
    canRetry,
    retryMatching,
    resetMatches,
    matches,
    selectedMatch: matches.length === 1 ? matches[0]! : null,
    loading: status === "checking",
    hasSearched: Boolean(visibleResult && visibleResult.status !== "checking"),
  };
}
