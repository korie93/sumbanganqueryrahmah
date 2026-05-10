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
  normalizeCollectionSameDayPaceDayRange,
  parseCollectionMonthKey,
  resolveCollectionSameDayPaceComparisonMonthKey,
  resolveCollectionSameDayPaceMaxDay,
  resolveCollectionMonthlyComparisonTargetForMonth,
  shiftCollectionMonthInput,
  type CollectionMonthlyComparisonTargetLookup,
  type CollectionSameDayPaceComparison,
  type CollectionSameDayPaceComparisonMode,
  type CollectionSameDayPaceDayRange,
} from "./collection-monthly-comparison-utils";

type SameDayPaceRequest = {
  nickname: string;
  currentMonthKey: string;
  previousMonthKey: string;
  maxDay: number;
  defaultDayRange: CollectionSameDayPaceDayRange;
};

type UseCollectionMonthlySameDayPaceArgs = {
  data: CollectionMonthlyComparisonResponse | null;
  monthlyTargetAmount?: number | null | undefined;
  monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function buildSameDayPaceRequest(
  data: CollectionMonthlyComparisonResponse | null,
  comparisonMode: CollectionSameDayPaceComparisonMode,
): SameDayPaceRequest | null {
  if (!data) {
    return null;
  }

  const nickname = String(data.nickname || "").trim();
  if (!nickname) {
    return null;
  }

  const comparison = data.comparison || null;
  const currentMonthKey = comparison?.targetMonth || data.endMonth;
  const previousMonthKey = resolveCollectionSameDayPaceComparisonMonthKey({
    currentMonthKey,
    selectedBaseMonthKey: comparison?.baseMonth || shiftCollectionMonthInput(currentMonthKey, -1),
    comparisonMode,
  });
  if (!previousMonthKey) {
    return null;
  }
  const currentMonth = parseCollectionMonthKey(currentMonthKey);
  const previousMonth = parseCollectionMonthKey(previousMonthKey);
  if (!currentMonth || !previousMonth) {
    return null;
  }

  const maxDay = resolveCollectionSameDayPaceMaxDay({
    currentMonthKey,
    comparisonMonthKey: previousMonthKey,
  });

  return {
    nickname,
    currentMonthKey,
    previousMonthKey,
    maxDay,
    defaultDayRange: {
      startDay: 1,
      endDay: maxDay,
    },
  };
}

export function useCollectionMonthlySameDayPace({
  data,
  monthlyTargetAmount,
  monthlyTargetsByMonth,
}: UseCollectionMonthlySameDayPaceArgs): {
  pace: CollectionSameDayPaceComparison | null;
  loading: boolean;
  errorMessage: string | null;
  unavailableReason: string | null;
  dayRange: CollectionSameDayPaceDayRange | null;
  maxDay: number | null;
  comparisonMode: CollectionSameDayPaceComparisonMode;
  setDayRange: (range: CollectionSameDayPaceDayRange) => void;
  setComparisonMode: (mode: CollectionSameDayPaceComparisonMode) => void;
} {
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const overviewCacheRef = useRef(createCollectionDailyOverviewCache());
  const [currentOverview, setCurrentOverview] = useState<CollectionDailyOverviewResponse | null>(null);
  const [previousOverview, setPreviousOverview] = useState<CollectionDailyOverviewResponse | null>(null);
  const [selectedDayRange, setSelectedDayRange] = useState<CollectionSameDayPaceDayRange | null>(null);
  const [comparisonMode, setComparisonMode] =
    useState<CollectionSameDayPaceComparisonMode>("selected-start-month");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const request = useMemo(() => buildSameDayPaceRequest(data, comparisonMode), [comparisonMode, data]);
  const requestKey = request
    ? `${request.nickname}|${request.currentMonthKey}|${request.previousMonthKey}|${comparisonMode}`
    : "";
  const dayRange = useMemo(() => (
    request ? normalizeCollectionSameDayPaceDayRange(selectedDayRange ?? request.defaultDayRange, request.maxDay) : null
  ), [request, selectedDayRange]);

  const handleDayRangeChange = useCallback((range: CollectionSameDayPaceDayRange) => {
    setSelectedDayRange(range);
  }, []);

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
    setSelectedDayRange(null);
  }, [requestKey]);

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
    const configuredCurrentTarget = resolveCollectionMonthlyComparisonTargetForMonth(
      request.currentMonthKey,
      monthlyTargetsByMonth ?? monthlyTargetAmount,
    );
    const configuredPreviousTarget = resolveCollectionMonthlyComparisonTargetForMonth(
      request.previousMonthKey,
      monthlyTargetsByMonth,
    );
    const previousOverviewTarget = Number(previousOverview.summary.monthlyTarget || 0);
    const effectiveMonthlyTarget = Number.isFinite(currentOverviewTarget) && currentOverviewTarget > 0
      ? currentOverviewTarget
      : configuredCurrentTarget !== null
        ? configuredCurrentTarget
      : monthlyTargetAmount;
    const effectivePreviousMonthlyTarget = Number.isFinite(previousOverviewTarget) && previousOverviewTarget > 0
      ? previousOverviewTarget
      : configuredPreviousTarget;

    return buildCollectionSameDayPaceComparison({
      currentMonthKey: request.currentMonthKey,
      previousMonthKey: request.previousMonthKey,
      currentDaily: currentOverview.days,
      previousDaily: previousOverview.days,
      monthlyTargetAmount: effectiveMonthlyTarget,
      previousMonthlyTargetAmount: effectivePreviousMonthlyTarget,
      dayRange,
    });
  }, [currentOverview, dayRange, monthlyTargetAmount, monthlyTargetsByMonth, previousOverview, request]);

  const unavailableReason = data && !request
    ? "Same-day pace needs a valid selected target month and comparison month."
    : null;

  return {
    pace,
    loading,
    errorMessage,
    unavailableReason,
    dayRange,
    maxDay: request?.maxDay ?? null,
    comparisonMode,
    setDayRange: handleDayRangeChange,
    setComparisonMode,
  };
}
