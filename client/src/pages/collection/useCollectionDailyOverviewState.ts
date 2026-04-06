import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCollectionDailyOverview,
  type CollectionDailyOverviewResponse,
} from "@/lib/api";
import {
  buildCollectionDailyOverviewCacheKey,
  createCollectionDailyOverviewCache,
} from "@/pages/collection/collection-daily-cache";
import {
  mapCollectionDailyEditableCalendarDays,
  shouldLoadCollectionDailyOverview,
} from "@/pages/collection/collection-daily-state-utils";
import { parseApiError } from "@/pages/collection/utils";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

type ToastFn = (options: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

type UseCollectionDailyOverviewStateOptions = {
  canManage: boolean;
  currentUsername: string;
  year: number;
  month: number;
  selectedUsernames: string[];
  selectedQueryUsers?: string[];
  canEditTarget: boolean;
  onClearSelection: () => void;
  toast: ToastFn;
};

type LoadCollectionDailyOverviewOptions = {
  preserveSelection?: boolean;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function useCollectionDailyOverviewState({
  canManage,
  currentUsername,
  year,
  month,
  selectedUsernames,
  selectedQueryUsers,
  canEditTarget,
  onClearSelection,
  toast,
}: UseCollectionDailyOverviewStateOptions) {
  const overviewRequestRef = useRef(0);
  const overviewAbortControllerRef = useRef<AbortController | null>(null);
  const overviewCacheRef = useRef(createCollectionDailyOverviewCache());
  const [overview, setOverview] = useState<CollectionDailyOverviewResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [monthlyTargetInput, setMonthlyTargetInput] = useState("0");
  const [calendarDays, setCalendarDays] = useState<EditableCalendarDay[]>([]);

  const abortOverviewRequest = useCallback(() => {
    if (overviewAbortControllerRef.current) {
      overviewAbortControllerRef.current.abort();
      overviewAbortControllerRef.current = null;
    }
  }, []);

  const clearOverviewCache = useCallback(() => {
    overviewCacheRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      abortOverviewRequest();
      clearOverviewCache();
    };
  }, [abortOverviewRequest, clearOverviewCache]);

  const loadOverview = useCallback(async (
    options: LoadCollectionDailyOverviewOptions = {},
  ): Promise<boolean> => {
    const preserveSelection = options.preserveSelection === true;
    if (
      !shouldLoadCollectionDailyOverview({
        canManage,
        currentUsername,
        selectedUsernames,
      })
    ) {
      setOverview(null);
      if (!preserveSelection) {
        onClearSelection();
      }
      return false;
    }

    const requestId = overviewRequestRef.current + 1;
    overviewRequestRef.current = requestId;
    const cacheKey = buildCollectionDailyOverviewCacheKey({
      year,
      month,
      usernames: selectedQueryUsers,
    });
    const cachedEntry = overviewCacheRef.current.get(cacheKey);

    if (cachedEntry) {
      abortOverviewRequest();
      setOverview(cachedEntry.overview);
      if (canEditTarget) {
        setMonthlyTargetInput(String(cachedEntry.overview.summary.monthlyTarget || 0));
      }
      setCalendarDays(mapCollectionDailyEditableCalendarDays(cachedEntry.overview));
      if (!preserveSelection) {
        onClearSelection();
      }
      setLoadingOverview(false);
      return true;
    }

    abortOverviewRequest();
    const controller = new AbortController();
    overviewAbortControllerRef.current = controller;
    setLoadingOverview(true);

    try {
      const response = await getCollectionDailyOverview(
        {
          year,
          month,
          usernames: selectedQueryUsers,
        },
        {
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted || overviewRequestRef.current !== requestId) return false;
      overviewCacheRef.current.set(cacheKey, { overview: response });
      setOverview(response);
      if (canEditTarget) {
        setMonthlyTargetInput(String(response.summary.monthlyTarget || 0));
      }
      setCalendarDays(mapCollectionDailyEditableCalendarDays(response));
      if (!preserveSelection) {
        onClearSelection();
      }
      return true;
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error)) return false;
      if (overviewRequestRef.current !== requestId) return false;
      setOverview(null);
      toast({
        title: "Failed to Load Collection Daily",
        description: parseApiError(error),
        variant: "destructive",
      });
      return false;
    } finally {
      if (overviewAbortControllerRef.current === controller) {
        overviewAbortControllerRef.current = null;
      }
      if (overviewRequestRef.current === requestId) {
        setLoadingOverview(false);
      }
    }
  }, [
    abortOverviewRequest,
    canEditTarget,
    canManage,
    currentUsername,
    month,
    onClearSelection,
    selectedQueryUsers,
    selectedUsernames,
    toast,
    year,
  ]);

  return {
    overview,
    loadingOverview,
    monthlyTargetInput,
    setMonthlyTargetInput,
    calendarDays,
    setCalendarDays,
    loadOverview,
    clearOverviewCache,
  };
}
