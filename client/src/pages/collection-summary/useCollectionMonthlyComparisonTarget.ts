import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { getCollectionDailyOverview } from "@/lib/api";
import { parseApiError } from "@/pages/collection/utils";
import { parseCollectionMonthKey } from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonTargetState = {
  monthlyTargetAmount: number | null;
  loading: boolean;
  errorMessage: string | null;
  sourceLabel: string | null;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function resolveTargetRequest(data: CollectionMonthlyComparisonResponse | null) {
  if (!data) {
    return null;
  }

  const targetMonth = data.comparison.targetMonth || data.endMonth;
  const parsed = parseCollectionMonthKey(targetMonth);
  const nickname = String(data.nickname || "").trim();
  if (!parsed || !nickname) {
    return null;
  }

  return {
    nickname,
    targetMonth,
    targetLabel: data.comparison.targetLabel || targetMonth,
    year: parsed.year,
    month: parsed.month,
  };
}

export function useCollectionMonthlyComparisonTarget(
  data: CollectionMonthlyComparisonResponse | null,
): CollectionMonthlyComparisonTargetState {
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [monthlyTargetAmount, setMonthlyTargetAmount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const targetRequest = useMemo(() => resolveTargetRequest(data), [data]);
  const targetRequestKey = targetRequest
    ? `${targetRequest.nickname.toLowerCase()}|${targetRequest.targetMonth}`
    : "";

  const abortTargetRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const loadTarget = useCallback(async () => {
    if (!targetRequest) {
      abortTargetRequest();
      setMonthlyTargetAmount(null);
      setErrorMessage(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    abortTargetRequest();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setMonthlyTargetAmount(null);
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await getCollectionDailyOverview(
        {
          year: targetRequest.year,
          month: targetRequest.month,
          usernames: [targetRequest.nickname],
        },
        {
          signal: controller.signal,
        },
      );

      if (controller.signal.aborted || requestIdRef.current !== requestId) {
        return;
      }

      const configuredTarget = Number(response.summary.monthlyTarget || 0);
      setMonthlyTargetAmount(Number.isFinite(configuredTarget) && configuredTarget > 0
        ? configuredTarget
        : null);
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      if (requestIdRef.current !== requestId) {
        return;
      }
      setMonthlyTargetAmount(null);
      setErrorMessage(parseApiError(error));
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [abortTargetRequest, targetRequest]);

  useEffect(() => {
    void loadTarget();
    return () => {
      abortTargetRequest();
    };
  }, [abortTargetRequest, loadTarget, targetRequestKey]);

  return {
    monthlyTargetAmount,
    loading,
    errorMessage,
    sourceLabel: targetRequest?.targetLabel ?? null,
  };
}
