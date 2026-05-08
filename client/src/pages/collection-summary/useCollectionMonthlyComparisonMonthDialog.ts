import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionRecords,
  type CollectionRecord,
} from "@/lib/api";
import type { CollectionMonthDetailsDialogProps } from "@/pages/collection-summary/CollectionMonthDetailsDialog";
import {
  COLLECTION_DATA_CHANGED_EVENT,
  parseApiError,
} from "@/pages/collection/utils";
import { buildMonthRange, toDisplayDate } from "@/pages/collection-summary/utils";
import {
  buildCollectionMonthDialogCacheKey,
  createCollectionMonthDialogCache,
} from "@/pages/collection-summary/month-dialog-cache";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import {
  formatCollectionMonthName,
  parseCollectionMonthKey,
} from "./collection-monthly-comparison-utils";

const MONTH_DIALOG_PAGE_SIZE = 10;

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

type UseCollectionMonthlyComparisonMonthDialogArgs = {
  data: CollectionMonthlyComparisonResponse | null;
};

export function useCollectionMonthlyComparisonMonthDialog({
  data,
}: UseCollectionMonthlyComparisonMonthDialogArgs) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const monthRecordsCacheRef = useRef(createCollectionMonthDialogCache());

  const [open, setOpen] = useState(false);
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(MONTH_DIALOG_PAGE_SIZE);
  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);

  const abortRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const monthRecordsCache = monthRecordsCacheRef.current;

    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
      abortRequest();
      monthRecordsCache.clear();
    };
  }, [abortRequest]);

  const resetDialog = useCallback(() => {
    requestIdRef.current += 1;
    abortRequest();
    setOpen(false);
    setActiveMonthKey(null);
    setPage(1);
    setPageSize(MONTH_DIALOG_PAGE_SIZE);
    setRecords([]);
    setTotalRecords(0);
    setLoading(false);
  }, [abortRequest]);

  const loadMonthRecords = useCallback(async (
    monthKey: string,
    nickname: string,
    nextPage: number,
    nextPageSize: number,
  ) => {
    const parsed = parseCollectionMonthKey(monthKey);
    const normalizedNickname = String(nickname || "").trim();
    if (!parsed || !normalizedNickname) {
      setRecords([]);
      setTotalRecords(0);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const range = buildMonthRange(parsed.year, parsed.month);
    const cacheKey = buildCollectionMonthDialogCacheKey({
      year: parsed.year,
      month: parsed.month,
      page: nextPage,
      pageSize: nextPageSize,
      nicknames: [normalizedNickname],
    });
    const cachedEntry = monthRecordsCacheRef.current.get(cacheKey);

    if (cachedEntry) {
      abortRequest();
      setRecords(cachedEntry.records);
      setTotalRecords(cachedEntry.totalRecords);
      setLoading(false);
      return;
    }

    setLoading(true);
    abortRequest();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await getCollectionRecords({
        from: range.from,
        to: range.to,
        nickname: normalizedNickname,
        page: nextPage,
        pageSize: nextPageSize,
      }, { signal: controller.signal });

      if (
        controller.signal.aborted ||
        !isMountedRef.current ||
        requestId !== requestIdRef.current
      ) {
        return;
      }

      const cacheEntry = {
        records: Array.isArray(response?.records) ? response.records : [],
        totalRecords: Number((response?.pagination?.total ?? response?.total) || 0),
      };
      monthRecordsCacheRef.current.set(cacheKey, cacheEntry);
      setRecords(cacheEntry.records);
      setTotalRecords(cacheEntry.totalRecords);
    } catch (error: unknown) {
      if (
        controller.signal.aborted ||
        isAbortError(error) ||
        !isMountedRef.current ||
        requestId !== requestIdRef.current
      ) {
        return;
      }
      setRecords([]);
      setTotalRecords(0);
      toast({
        title: "Failed to Load Monthly Records",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (
        !controller.signal.aborted &&
        isMountedRef.current &&
        requestId === requestIdRef.current
      ) {
        setLoading(false);
      }
    }
  }, [abortRequest, toast]);

  useEffect(() => {
    if (!open || !activeMonthKey || !data?.nickname) {
      return;
    }
    void loadMonthRecords(activeMonthKey, data.nickname, page, pageSize);
  }, [activeMonthKey, data?.nickname, loadMonthRecords, open, page, pageSize]);

  useEffect(() => {
    if (!activeMonthKey || !data) {
      return;
    }
    if (!data.months.some((month) => month.month === activeMonthKey)) {
      resetDialog();
    }
  }, [activeMonthKey, data, resetDialog]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleCollectionDataChanged = () => {
      monthRecordsCacheRef.current.clear();
      if (!open || !activeMonthKey || !data?.nickname) {
        return;
      }
      void loadMonthRecords(activeMonthKey, data.nickname, page, pageSize);
    };

    window.addEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    return () => {
      window.removeEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    };
  }, [activeMonthKey, data?.nickname, loadMonthRecords, open, page, pageSize]);

  const selectedMonthSummary = useMemo(() => {
    if (!activeMonthKey) return null;
    const parsed = parseCollectionMonthKey(activeMonthKey);
    if (!parsed) return null;
    const month = data?.months.find((entry) => entry.month === activeMonthKey);
    return {
      month: parsed.month,
      monthName: formatCollectionMonthName(parsed.month),
      totalRecords: Number(month?.recordCount || 0),
      totalAmount: Number(month?.totalCollection || 0),
    };
  }, [activeMonthKey, data?.months]);

  const selectedMonthRange = useMemo(() => {
    if (!activeMonthKey) return null;
    const parsed = parseCollectionMonthKey(activeMonthKey);
    if (!parsed) return null;
    const range = buildMonthRange(parsed.year, parsed.month);
    return {
      from: range.from,
      to: range.to,
      label: `Dari ${toDisplayDate(range.from)} hingga ${toDisplayDate(range.to)}`,
    };
  }, [activeMonthKey]);

  const selectedYear = useMemo(() => {
    if (!activeMonthKey) return "";
    return String(parseCollectionMonthKey(activeMonthKey)?.year || "");
  }, [activeMonthKey]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  const handleSelectMonth = useCallback((monthKey: string) => {
    if (!parseCollectionMonthKey(monthKey)) {
      return;
    }
    setActiveMonthKey(monthKey);
    setPage(1);
    setOpen(true);
  }, []);

  const monthDialog = {
    open,
    loading,
    selectedYear,
    selectedMonthSummary,
    selectedMonthRange,
    records,
    totalRecords,
    page,
    pageSize,
    totalPages,
    onOpenChange: (nextOpen: boolean) => {
      if (!nextOpen) {
        resetDialog();
      } else {
        setOpen(true);
      }
    },
    onPageChange: setPage,
    onPageSizeChange: (nextPageSize: number) => {
      setPageSize(nextPageSize);
      setPage(1);
    },
    toDisplayDate,
  } satisfies CollectionMonthDetailsDialogProps;

  return {
    handleSelectMonth,
    monthDialog,
  };
}
