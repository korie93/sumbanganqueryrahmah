import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CollectionMonthlyComparisonResponse,
  CollectionStaffNickname,
} from "@/lib/api";
import { getCollectionMonthlyComparison } from "@/lib/api";
import {
  COLLECTION_DATA_CHANGED_EVENT,
  parseApiError,
} from "@/pages/collection/utils";
import {
  buildDefaultCollectionMonthlyComparisonRange,
  COLLECTION_MONTHLY_COMPARISON_MAX_RANGE_MONTHS,
  countCollectionMonthsInclusive,
  type CollectionMonthlyComparisonPresetRange,
} from "./collection-monthly-comparison-utils";

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function normalizeNicknameOptions(options: CollectionStaffNickname[]) {
  const byLower = new Map<string, string>();
  for (const option of options) {
    if (!option.isActive) {
      continue;
    }
    const nickname = String(option.nickname || "").trim();
    if (!nickname) {
      continue;
    }
    const key = nickname.toLowerCase();
    if (!byLower.has(key)) {
      byLower.set(key, nickname);
    }
  }
  return Array.from(byLower.values());
}

type UseCollectionMonthlyComparisonDataArgs = {
  canFilterByNickname: boolean;
  currentNickname: string;
  nicknameOptions: CollectionStaffNickname[];
};

export function useCollectionMonthlyComparisonData({
  canFilterByNickname,
  currentNickname,
  nicknameOptions,
}: UseCollectionMonthlyComparisonDataArgs) {
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);
  const defaultRange = useMemo(
    () => buildDefaultCollectionMonthlyComparisonRange(),
    [],
  );
  const currentNicknameValue = useMemo(
    () => String(currentNickname || "").trim(),
    [currentNickname],
  );
  const availableNicknames = useMemo(
    () => normalizeNicknameOptions(nicknameOptions),
    [nicknameOptions],
  );
  const defaultNickname = useMemo(() => {
    if (canFilterByNickname) {
      return availableNicknames[0] || "";
    }
    return currentNicknameValue;
  }, [availableNicknames, canFilterByNickname, currentNicknameValue]);

  const [selectedNickname, setSelectedNickname] = useState(defaultNickname);
  const [startMonth, setStartMonth] = useState(defaultRange.startMonth);
  const [endMonth, setEndMonth] = useState(defaultRange.endMonth);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<CollectionMonthlyComparisonResponse | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<{
    nickname: string;
    startMonth: string;
    endMonth: string;
  } | null>(null);

  const abortRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortRequest();
    };
  }, [abortRequest]);

  useEffect(() => {
    if (canFilterByNickname) {
      const availableLower = new Set(availableNicknames.map((value) => value.toLowerCase()));
      setSelectedNickname((previous) => {
        const normalizedPrevious = String(previous || "").trim();
        if (normalizedPrevious && availableLower.has(normalizedPrevious.toLowerCase())) {
          return previous;
        }
        return defaultNickname;
      });
      return;
    }

    setSelectedNickname(currentNicknameValue);
  }, [availableNicknames, canFilterByNickname, currentNicknameValue, defaultNickname]);

  const validateFilters = useCallback((overrides?: {
    nickname?: string | undefined;
    startMonth?: string | undefined;
    endMonth?: string | undefined;
  }) => {
    const effectiveNickname =
      overrides?.nickname ?? (canFilterByNickname ? selectedNickname : currentNicknameValue);
    const nextStartMonth = overrides?.startMonth ?? startMonth;
    const nextEndMonth = overrides?.endMonth ?? endMonth;

    if (!String(effectiveNickname || "").trim()) {
      return "Please choose a valid staff nickname first.";
    }
    if (canFilterByNickname) {
      const availableLower = new Set(availableNicknames.map((value) => value.toLowerCase()));
      if (!availableLower.has(String(effectiveNickname).trim().toLowerCase())) {
        return "Please choose a nickname that is visible to your account.";
      }
    }
    if (!nextStartMonth || !nextEndMonth) {
      return "Please choose both start month and end month.";
    }
    if (nextStartMonth > nextEndMonth) {
      return "Start month cannot be later than end month.";
    }
    if (
      countCollectionMonthsInclusive(nextStartMonth, nextEndMonth)
      > COLLECTION_MONTHLY_COMPARISON_MAX_RANGE_MONTHS
    ) {
      return "Monthly comparison range cannot exceed 24 months.";
    }
    return null;
  }, [availableNicknames, canFilterByNickname, currentNicknameValue, endMonth, selectedNickname, startMonth]);

  const loadComparison = useCallback(async (filters: {
    nickname: string;
    startMonth: string;
    endMonth: string;
  }) => {
    const requestId = ++requestIdRef.current;
    abortRequest();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await getCollectionMonthlyComparison(filters, {
        signal: controller.signal,
      });
      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
      setData(response);
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
      setData(null);
      setErrorMessage(parseApiError(error));
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (isMountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [abortRequest]);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    if (!defaultNickname || !startMonth || !endMonth) {
      return;
    }
    initializedRef.current = true;
    setAppliedFilters({
      nickname: defaultNickname,
      startMonth,
      endMonth,
    });
  }, [defaultNickname, endMonth, startMonth]);

  useEffect(() => {
    if (!appliedFilters) {
      return;
    }
    void loadComparison(appliedFilters);
  }, [appliedFilters, loadComparison]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleCollectionDataChanged = () => {
      if (!appliedFilters) {
        return;
      }
      void loadComparison(appliedFilters);
    };

    window.addEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    return () => {
      window.removeEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    };
  }, [appliedFilters, loadComparison]);

  const apply = useCallback(() => {
    const validationMessage = validateFilters();
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setAppliedFilters({
      nickname: (canFilterByNickname ? selectedNickname : currentNicknameValue).trim(),
      startMonth,
      endMonth,
    });
  }, [canFilterByNickname, currentNicknameValue, endMonth, selectedNickname, startMonth, validateFilters]);

  const applyRangePreset = useCallback((preset: CollectionMonthlyComparisonPresetRange) => {
    const nextStartMonth = preset.startMonth;
    const nextEndMonth = preset.endMonth;
    const effectiveNickname = (canFilterByNickname ? selectedNickname : currentNicknameValue).trim();

    setStartMonth(nextStartMonth);
    setEndMonth(nextEndMonth);

    const validationMessage = validateFilters({
      nickname: effectiveNickname,
      startMonth: nextStartMonth,
      endMonth: nextEndMonth,
    });
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage(null);
    setAppliedFilters({
      nickname: effectiveNickname,
      startMonth: nextStartMonth,
      endMonth: nextEndMonth,
    });
  }, [canFilterByNickname, currentNicknameValue, selectedNickname, validateFilters]);

  const reset = useCallback(() => {
    const nextNickname = defaultNickname;
    setSelectedNickname(nextNickname);
    setStartMonth(defaultRange.startMonth);
    setEndMonth(defaultRange.endMonth);
    setErrorMessage(null);
    if (!nextNickname) {
      setData(null);
      setAppliedFilters(null);
      return;
    }
    setAppliedFilters({
      nickname: nextNickname,
      startMonth: defaultRange.startMonth,
      endMonth: defaultRange.endMonth,
    });
  }, [defaultNickname, defaultRange.endMonth, defaultRange.startMonth]);

  return {
    availableNicknames,
    selectedNickname,
    startMonth,
    endMonth,
    loading,
    errorMessage,
    data,
    hasAvailableNickname: Boolean(defaultNickname),
    setSelectedNickname,
    setStartMonth,
    setEndMonth,
    apply,
    applyRangePreset,
    reset,
  };
}
