import { useCallback, useEffect, useReducer, useRef } from "react";
import { getCollectionDailyDayDetails } from "@/lib/api";
import {
  buildCollectionDailyDayDetailsCacheKey,
  createCollectionDailyDayDetailsCache,
  normalizeCollectionDailyCacheUsers,
} from "@/pages/collection/collection-daily-cache";
import {
  collectionDailyDayDetailsReducer,
  initialCollectionDailyDayDetailsState,
} from "@/pages/collection/collection-daily-day-details-state";
import { COLLECTION_DAILY_DAY_DETAILS_PAGE_SIZE } from "@/pages/collection/collection-daily-state-utils";
import { parseApiError } from "@/pages/collection/utils";

type ToastFn = (options: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void | { dismiss: () => void };

type UseCollectionDailyDayDetailsStateOptions = {
  selectedQueryUsers?: string[] | undefined;
  onCloseRelatedUi: () => void;
  toast: ToastFn;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function useCollectionDailyDayDetailsState({
  selectedQueryUsers,
  onCloseRelatedUi,
  toast,
}: UseCollectionDailyDayDetailsStateOptions) {
  const dayDetailsRequestRef = useRef(0);
  const dayDetailsAbortControllerRef = useRef<AbortController | null>(null);
  const dayDetailsCacheRef = useRef(createCollectionDailyDayDetailsCache());
  const errorToastDismissRef = useRef<(() => void) | null>(null);
  const [state, dispatch] = useReducer(collectionDailyDayDetailsReducer, initialCollectionDailyDayDetailsState);
  const retryRequestRef = useRef<{ date: string; page: number; scopeKey: string } | null>(null);
  const scopeKey = JSON.stringify(normalizeCollectionDailyCacheUsers(selectedQueryUsers));

  const dismissDayDetailsErrorToast = useCallback(() => {
    const dismiss = errorToastDismissRef.current;
    errorToastDismissRef.current = null;
    dismiss?.();
  }, []);

  const abortDayDetailsRequest = useCallback(() => {
    if (dayDetailsAbortControllerRef.current) {
      dayDetailsAbortControllerRef.current.abort();
      dayDetailsAbortControllerRef.current = null;
    }
  }, []);

  const clearDayDetailsCache = useCallback(() => {
    dayDetailsCacheRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      dayDetailsRequestRef.current += 1;
      abortDayDetailsRequest();
      clearDayDetailsCache();
      dismissDayDetailsErrorToast();
    };
  }, [abortDayDetailsRequest, clearDayDetailsCache, dismissDayDetailsErrorToast]);

  const loadDayDetails = useCallback(
    async (date: string, page = 1) => {
      // The old failure is superseded by this request. Dismiss only its toast,
      // keeping notification history and unrelated alerts intact. Otherwise its
      // newer Radix layer can consume Escape after the inline retry succeeds.
      dismissDayDetailsErrorToast();
      const requestId = dayDetailsRequestRef.current + 1;
      dayDetailsRequestRef.current = requestId;
      const cacheKey = buildCollectionDailyDayDetailsCacheKey({
        date,
        usernames: selectedQueryUsers,
        page,
        pageSize: COLLECTION_DAILY_DAY_DETAILS_PAGE_SIZE,
      });
      const cachedEntry = dayDetailsCacheRef.current.get(cacheKey);

      retryRequestRef.current = { date, page, scopeKey };
      dispatch({
        type: "begin",
        requestId,
        scopeKey,
        date,
        ...(cachedEntry ? { cachedDetails: cachedEntry.dayDetails } : {}),
      });

      if (cachedEntry) {
        abortDayDetailsRequest();
        return;
      }

      abortDayDetailsRequest();
      const controller = new AbortController();
      dayDetailsAbortControllerRef.current = controller;

      try {
        const response = await getCollectionDailyDayDetails(
          {
            date,
            usernames: selectedQueryUsers,
            page,
            pageSize: COLLECTION_DAILY_DAY_DETAILS_PAGE_SIZE,
          },
          {
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted || dayDetailsRequestRef.current !== requestId) return;
        if (response.date !== date) throw new Error("Maklumat yang diterima tidak sepadan dengan tarikh dipilih.");
        dayDetailsCacheRef.current.set(cacheKey, { dayDetails: response });
        dispatch({ type: "success", requestId, details: response });
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) return;
        if (dayDetailsRequestRef.current !== requestId) return;
        const message = parseApiError(error);
        dispatch({ type: "failure", requestId, message });
        const notification = toast({
          title: "Failed to Load Day Details",
          description: message,
          variant: "destructive",
        });
        errorToastDismissRef.current = notification?.dismiss ?? null;
      } finally {
        if (dayDetailsAbortControllerRef.current === controller) {
          dayDetailsAbortControllerRef.current = null;
        }
      }
    },
    [abortDayDetailsRequest, dismissDayDetailsErrorToast, scopeKey, selectedQueryUsers, toast],
  );

  const clearSelection = useCallback(() => {
    const requestId = ++dayDetailsRequestRef.current;
    abortDayDetailsRequest();
    dismissDayDetailsErrorToast();
    retryRequestRef.current = null;
    dispatch({ type: "clear", requestId });
    onCloseRelatedUi();
  }, [abortDayDetailsRequest, dismissDayDetailsErrorToast, onCloseRelatedUi]);

  useEffect(() => {
    clearSelection();
  }, [clearSelection, scopeKey]);

  const retryDayDetails = useCallback(() => {
    const request = retryRequestRef.current;
    if (request?.scopeKey === scopeKey) void loadDayDetails(request.date, request.page);
  }, [loadDayDetails, scopeKey]);

  // A staff-scope change must never paint the previous scope while effects settle.
  const visibleState = state.scopeKey === scopeKey ? state : initialCollectionDailyDayDetailsState;

  return {
    selectedDate: visibleState.selectedDate,
    dayDetails: visibleState.dayDetails,
    loadingDayDetails: visibleState.loadingDayDetails,
    dayDetailsError: visibleState.dayDetailsError,
    retryDayDetails,
    loadDayDetails,
    clearSelection,
    clearDayDetailsCache,
  };
}
