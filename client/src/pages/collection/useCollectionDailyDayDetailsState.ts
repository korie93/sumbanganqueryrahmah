import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCollectionDailyDayDetails,
  type CollectionDailyDayDetailsResponse,
} from "@/lib/api";
import {
  buildCollectionDailyDayDetailsCacheKey,
  createCollectionDailyDayDetailsCache,
} from "@/pages/collection/collection-daily-cache";
import { COLLECTION_DAILY_DAY_DETAILS_PAGE_SIZE } from "@/pages/collection/collection-daily-state-utils";
import { parseApiError } from "@/pages/collection/utils";

type ToastFn = (options: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetails, setDayDetails] = useState<CollectionDailyDayDetailsResponse | null>(null);
  const [loadingDayDetails, setLoadingDayDetails] = useState(false);

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
      abortDayDetailsRequest();
      clearDayDetailsCache();
    };
  }, [abortDayDetailsRequest, clearDayDetailsCache]);

  const loadDayDetails = useCallback(
    async (date: string, page = 1) => {
      const requestId = dayDetailsRequestRef.current + 1;
      dayDetailsRequestRef.current = requestId;
      const cacheKey = buildCollectionDailyDayDetailsCacheKey({
        date,
        usernames: selectedQueryUsers,
        page,
        pageSize: COLLECTION_DAILY_DAY_DETAILS_PAGE_SIZE,
      });
      const cachedEntry = dayDetailsCacheRef.current.get(cacheKey);

      setSelectedDate(date);

      if (cachedEntry) {
        abortDayDetailsRequest();
        setDayDetails(cachedEntry.dayDetails);
        setLoadingDayDetails(false);
        return;
      }

      abortDayDetailsRequest();
      const controller = new AbortController();
      dayDetailsAbortControllerRef.current = controller;
      setLoadingDayDetails(true);

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
        dayDetailsCacheRef.current.set(cacheKey, { dayDetails: response });
        setDayDetails(response);
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) return;
        if (dayDetailsRequestRef.current !== requestId) return;
        setDayDetails(null);
        toast({
          title: "Failed to Load Day Details",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        if (dayDetailsAbortControllerRef.current === controller) {
          dayDetailsAbortControllerRef.current = null;
        }
        if (dayDetailsRequestRef.current === requestId) {
          setLoadingDayDetails(false);
        }
      }
    },
    [abortDayDetailsRequest, selectedQueryUsers, toast],
  );

  const clearSelection = useCallback(() => {
    abortDayDetailsRequest();
    setSelectedDate(null);
    setDayDetails(null);
    onCloseRelatedUi();
  }, [abortDayDetailsRequest, onCloseRelatedUi]);

  return {
    selectedDate,
    dayDetails,
    loadingDayDetails,
    loadDayDetails,
    clearSelection,
    clearDayDetailsCache,
  };
}
