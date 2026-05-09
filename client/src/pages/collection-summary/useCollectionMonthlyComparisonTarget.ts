import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { getCollectionMonthlyTarget } from "@/lib/api";
import { parseApiError } from "@/pages/collection/utils";
import {
  normalizeCollectionMonthlyComparisonTargetAmount,
  parseCollectionMonthKey,
  type CollectionMonthlyComparisonTargetLookup,
} from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonTargetState = {
  monthlyTargetAmount: number | null;
  targetsByMonth: CollectionMonthlyComparisonTargetLookup;
  loading: boolean;
  errorMessage: string | null;
  sourceLabel: string | null;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function resolveTargetRequest(params: {
  nickname: string;
  targetMonth: string;
  targetLabel: string;
  months: string[];
}) {
  const targetMonth = String(params.targetMonth || "").trim();
  const nickname = String(params.nickname || "").trim();
  if (!targetMonth || !nickname) {
    return null;
  }

  const parsed = parseCollectionMonthKey(targetMonth);
  if (!parsed) {
    return null;
  }

  return {
    nickname,
    targetMonth,
    targetLabel: String(params.targetLabel || "").trim() || targetMonth,
    months: params.months
      .map((month) => String(month || "").trim())
      .filter((month, index, list) => Boolean(parseCollectionMonthKey(month)) && list.indexOf(month) === index),
  };
}

export function useCollectionMonthlyComparisonTarget(
  data: CollectionMonthlyComparisonResponse | null,
): CollectionMonthlyComparisonTargetState {
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [monthlyTargetAmount, setMonthlyTargetAmount] = useState<number | null>(null);
  const [targetsByMonth, setTargetsByMonth] = useState<CollectionMonthlyComparisonTargetLookup>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dataNickname = data?.nickname || "";
  const dataTargetMonth = data?.comparison.targetMonth || data?.endMonth || "";
  const dataTargetLabel = data?.comparison.targetLabel || dataTargetMonth;
  const dataMonthsKey = data?.months.map((month) => month.month).join("|") || "";
  const targetRequest = useMemo(
    () => resolveTargetRequest({
      nickname: dataNickname,
      targetMonth: dataTargetMonth,
      targetLabel: dataTargetLabel,
      months: data?.months.map((month) => month.month) || [],
    }),
    [data?.months, dataNickname, dataTargetLabel, dataTargetMonth],
  );
  const targetRequestKey = targetRequest
    ? `${targetRequest.nickname.toLowerCase()}|${targetRequest.targetMonth}|${dataMonthsKey}`
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
      setTargetsByMonth({});
      setErrorMessage(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    abortTargetRequest();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setMonthlyTargetAmount(null);
    setTargetsByMonth({});
    setLoading(true);
    setErrorMessage(null);

    try {
      const months = targetRequest.months.length > 0
        ? targetRequest.months
        : [targetRequest.targetMonth];
      const results = await Promise.all(months.map(async (month) => {
        try {
          const response = await getCollectionMonthlyTarget(
            {
              month,
              nickname: targetRequest.nickname,
            },
            {
              signal: controller.signal,
            },
          );
          return {
            month,
            target: normalizeCollectionMonthlyComparisonTargetAmount(response.monthlyTarget),
            error: null as string | null,
          };
        } catch (error: unknown) {
          if (controller.signal.aborted || isAbortError(error)) {
            throw error;
          }
          return {
            month,
            target: null,
            error: parseApiError(error),
          };
        }
      }));

      if (controller.signal.aborted || requestIdRef.current !== requestId) {
        return;
      }

      const nextTargetsByMonth = results.reduce<CollectionMonthlyComparisonTargetLookup>((lookup, result) => {
        lookup[result.month] = result.target;
        return lookup;
      }, {});
      const firstError = results.find((result) => result.error)?.error || null;
      setTargetsByMonth(nextTargetsByMonth);
      setMonthlyTargetAmount(nextTargetsByMonth[targetRequest.targetMonth] ?? null);
      setErrorMessage(firstError);
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      if (requestIdRef.current !== requestId) {
        return;
      }
      setMonthlyTargetAmount(null);
      setTargetsByMonth({});
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
    targetsByMonth,
    loading,
    errorMessage,
    sourceLabel: targetRequest?.targetLabel ?? null,
  };
}
