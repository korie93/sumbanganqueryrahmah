import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCollectionDailyOverview,
  type CollectionDailyOverviewResponse,
  type CollectionMonthlyComparisonResponse,
} from "@/lib/api";
import {
  buildCollectionDailyOverviewCacheKey,
  createCollectionDailyOverviewCache,
} from "@/pages/collection/collection-daily-cache";
import {
  COLLECTION_DATA_CHANGED_EVENT,
  parseApiError,
} from "@/pages/collection/utils";
import {
  buildCollectionSameDayPaceComparison,
  formatCollectionMonthInput,
  parseCollectionMonthKey,
  shiftCollectionMonthInput,
  type CollectionSameDayPaceComparison,
} from "./collection-monthly-comparison-utils";

type SameDayPaceRequest = {
  nickname: string;
  currentMonthKey: string;
  previousMonthKey: string;
  referenceDate: Date;
};

type UseCollectionMonthlySameDayPaceArgs = {
  data: CollectionMonthlyComparisonResponse | null;
  monthlyTargetAmount?: number | null | undefined;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function buildSameDayPaceRequest(
  data: CollectionMonthlyComparisonResponse | null,
): SameDayPaceRequest | null {
  if (!data) {
    return null;
  }

  const nickname = String(data.nickname || "").trim();
  if (!nickname) {
    return null;
  }

  const referenceDate = new Date();
  const currentMonthKey = formatCollectionMonthInput(referenceDate);
  const previousMonthKey = shiftCollectionMonthInput(currentMonthKey, -1);
  const currentMonthInRange = data.months.some((month) => month.month === currentMonthKey);
  if (!currentMonthInRange) {
    return null;
  }

  return {
    nickname,
    currentMonthKey,
    previousMonthKey,
    referenceDate,
  };
}

export function useCollectionMonthlySameDayPace({
  data,
  monthlyTargetAmount,
}: UseCollectionMonthlySameDayPaceArgs): {
  pace: CollectionSameDayPaceComparison | null;
  loading: boolean;
  errorMessage: string | null;
  unavailableReason: string | null;
} {
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const overviewCacheRef = useRef(createCollectionDailyOverviewCache());
  const [currentOverview, setCurrentOverview] = useState<CollectionDailyOverviewResponse | null>(null);
  const [previousOverview, setPreviousOverview] = useState<CollectionDailyOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const request = useMemo(() => buildSameDayPaceRequest(data), [data]);
  const requestKey = request
    ? `${request.nickname}|${request.currentMonthKey}|${request.previousMonthKey}`
    : "";

  const abortRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const loadOverviewFromCacheOrApi = useCallback(async (
    params: {
      monthKey: string;
      nickname: string;
      signal: AbortSignal;
    },
  ) => {
    const parsed = parseCollectionMonthKey(params.monthKey);
    if (!parsed) {
      throw new Error("Invalid same-day comparison month.");
    }

    const usernames = [params.nickname];
    const cacheKey = buildCollectionDailyOverviewCacheKey({
      year: parsed.year,
      month: parsed.month,
      usernames,
    });
    const cached = overviewCacheRef.current.get(cacheKey);
    if (cached) {
      return cached.overview;
    }

    const overview = await getCollectionDailyOverview(
      {
        year: parsed.year,
        month: parsed.month,
        usernames,
      },
      { signal: params.signal },
    );
    overviewCacheRef.current.set(cacheKey, { overview });
    return overview;
  }, []);

  const loadSameDayPace = useCallback(async () => {
    if (!request) {
      abortRequest();
      setCurrentOverview(null);
      setPreviousOverview(null);
      setLoading(false);
      setErrorMessage(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortRequest();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setErrorMessage(null);

    try {
      const [currentResponse, previousResponse] = await Promise.all([
        loadOverviewFromCacheOrApi({
          monthKey: request.currentMonthKey,
          nickname: request.nickname,
          signal: controller.signal,
        }),
        loadOverviewFromCacheOrApi({
          monthKey: request.previousMonthKey,
          nickname: request.nickname,
          signal: controller.signal,
        }),
      ]);

      if (controller.signal.aborted || requestIdRef.current !== requestId) {
        return;
      }

      setCurrentOverview(currentResponse);
      setPreviousOverview(previousResponse);
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      if (requestIdRef.current !== requestId) {
        return;
      }
      setCurrentOverview(null);
      setPreviousOverview(null);
      setErrorMessage(parseApiError(error));
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [abortRequest, loadOverviewFromCacheOrApi, request]);

  useEffect(() => {
    void loadSameDayPace();
    return undefined;
  }, [loadSameDayPace, requestKey]);

  useEffect(() => {
    return () => {
      abortRequest();
      overviewCacheRef.current.clear();
    };
  }, [abortRequest]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleCollectionDataChanged = () => {
      void loadSameDayPace();
    };

    window.addEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    return () => {
      window.removeEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    };
  }, [loadSameDayPace]);

  const pace = useMemo(() => {
    if (!request || !currentOverview || !previousOverview) {
      return null;
    }
    const currentOverviewTarget = Number(currentOverview.summary.monthlyTarget || 0);
    const effectiveMonthlyTarget = Number.isFinite(currentOverviewTarget) && currentOverviewTarget > 0
      ? currentOverviewTarget
      : monthlyTargetAmount;

    return buildCollectionSameDayPaceComparison({
      currentMonthKey: request.currentMonthKey,
      previousMonthKey: request.previousMonthKey,
      currentDaily: currentOverview.days,
      previousDaily: previousOverview.days,
      monthlyTargetAmount: effectiveMonthlyTarget,
      referenceDate: request.referenceDate,
    });
  }, [currentOverview, monthlyTargetAmount, previousOverview, request]);

  const unavailableReason = data && !request
    ? "Same-day pace appears only when the selected range includes the current month."
    : null;

  return {
    pace,
    loading,
    errorMessage,
    unavailableReason,
  };
}
