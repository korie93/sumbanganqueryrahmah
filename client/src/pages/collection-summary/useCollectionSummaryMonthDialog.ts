import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionRecords,
  type CollectionMonthlySummary,
  type CollectionRecord,
} from "@/lib/api";
import { parseApiError } from "@/pages/collection/utils";
import { buildMonthRange, toDisplayDate } from "@/pages/collection-summary/utils";

const MONTH_DIALOG_PAGE_SIZE = 10;

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

type UseCollectionSummaryMonthDialogArgs = {
  canFilterByNickname: boolean;
  selectedYear: string;
  selectedNicknames: string[];
  summaryRows: CollectionMonthlySummary[];
};

export function useCollectionSummaryMonthDialog({
  canFilterByNickname,
  selectedYear,
  selectedNicknames,
  summaryRows,
}: UseCollectionSummaryMonthDialogArgs) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const monthRecordsRequestIdRef = useRef(0);
  const monthRecordsAbortControllerRef = useRef<AbortController | null>(null);

  const [monthDialogOpen, setMonthDialogOpen] = useState(false);
  const [activeMonth, setActiveMonth] = useState<number | null>(null);
  const [monthDialogPage, setMonthDialogPage] = useState(1);
  const [monthDialogPageSize, setMonthDialogPageSize] =
    useState(MONTH_DIALOG_PAGE_SIZE);
  const [monthRecords, setMonthRecords] = useState<CollectionRecord[]>([]);
  const [monthRecordsTotal, setMonthRecordsTotal] = useState(0);
  const [loadingMonthRecords, setLoadingMonthRecords] = useState(false);

  const abortMonthRecordsRequest = useCallback(() => {
    if (monthRecordsAbortControllerRef.current) {
      monthRecordsAbortControllerRef.current.abort();
      monthRecordsAbortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      monthRecordsRequestIdRef.current += 1;
      abortMonthRecordsRequest();
    };
  }, [abortMonthRecordsRequest]);

  const resetMonthDialog = useCallback(() => {
    monthRecordsRequestIdRef.current += 1;
    abortMonthRecordsRequest();
    setMonthDialogOpen(false);
    setActiveMonth(null);
    setMonthDialogPage(1);
    setMonthDialogPageSize(MONTH_DIALOG_PAGE_SIZE);
    setMonthRecords([]);
    setMonthRecordsTotal(0);
    setLoadingMonthRecords(false);
  }, [abortMonthRecordsRequest]);

  const loadMonthRecords = useCallback(
    async (
      year: number,
      month: number,
      page: number,
      pageSize: number,
      nicknames?: string[],
    ) => {
      const requestId = ++monthRecordsRequestIdRef.current;
      const range = buildMonthRange(year, month);
      const normalizedFilters =
        Array.isArray(nicknames) && nicknames.length > 0
          ? Array.from(
              new Set(nicknames.map((value) => String(value || "").trim()).filter(Boolean)),
            )
          : [];

      setLoadingMonthRecords(true);
      setMonthRecords([]);
      abortMonthRecordsRequest();
      const controller = new AbortController();
      monthRecordsAbortControllerRef.current = controller;

      try {
        const response = await getCollectionRecords({
          from: range.from,
          to: range.to,
          nickname: normalizedFilters.length === 1 ? normalizedFilters[0] : undefined,
          nicknames: normalizedFilters.length > 1 ? normalizedFilters : undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }, { signal: controller.signal });

        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          requestId !== monthRecordsRequestIdRef.current
        ) return;

        setMonthRecords(Array.isArray(response?.records) ? response.records : []);
        setMonthRecordsTotal(Number(response?.total || 0));
      } catch (error: unknown) {
        if (
          controller.signal.aborted ||
          isAbortError(error) ||
          !isMountedRef.current ||
          requestId !== monthRecordsRequestIdRef.current
        ) return;
        setMonthRecords([]);
        setMonthRecordsTotal(0);
        toast({
          title: "Failed to Load Monthly Records",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        if (monthRecordsAbortControllerRef.current === controller) {
          monthRecordsAbortControllerRef.current = null;
        }
        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          requestId !== monthRecordsRequestIdRef.current
        ) return;
        setLoadingMonthRecords(false);
      }
    },
    [abortMonthRecordsRequest, toast],
  );

  useEffect(() => {
    if (!monthDialogOpen || activeMonth === null) {
      return;
    }

    const year = Number(selectedYear);
    if (!Number.isInteger(year) || activeMonth < 1 || activeMonth > 12) {
      setMonthRecords([]);
      setMonthRecordsTotal(0);
      return;
    }

    const nicknames =
      canFilterByNickname && selectedNicknames.length > 0
        ? selectedNicknames
        : undefined;
    void loadMonthRecords(
      year,
      activeMonth,
      monthDialogPage,
      monthDialogPageSize,
      nicknames,
    );
  }, [
    activeMonth,
    canFilterByNickname,
    loadMonthRecords,
    monthDialogOpen,
    monthDialogPage,
    monthDialogPageSize,
    selectedNicknames,
    selectedYear,
  ]);

  const activeMonthSummary = useMemo(() => {
    if (activeMonth === null) return null;
    return summaryRows.find((item) => item.month === activeMonth) || null;
  }, [summaryRows, activeMonth]);

  const activeMonthRange = useMemo(() => {
    if (activeMonth === null) return null;
    const year = Number(selectedYear);
    if (!Number.isInteger(year)) return null;
    const range = buildMonthRange(year, activeMonth);
    return {
      from: range.from,
      to: range.to,
      label: `Dari ${toDisplayDate(range.from)} hingga ${toDisplayDate(range.to)}`,
    };
  }, [selectedYear, activeMonth]);

  const monthDialogTotalPages = Math.max(
    1,
    Math.ceil(monthRecordsTotal / monthDialogPageSize),
  );

  const handleSelectMonth = useCallback((month: number) => {
    setActiveMonth(month);
    setMonthDialogPage(1);
    setMonthDialogOpen(true);
  }, []);

  return {
    handleSelectMonth,
    monthDialog: {
      open: monthDialogOpen,
      loading: loadingMonthRecords,
      selectedYear,
      selectedMonthSummary: activeMonthSummary,
      selectedMonthRange: activeMonthRange,
      records: monthRecords,
      totalRecords: monthRecordsTotal,
      page: monthDialogPage,
      pageSize: monthDialogPageSize,
      totalPages: monthDialogTotalPages,
      onOpenChange: (open: boolean) => {
        if (!open) {
          resetMonthDialog();
        } else {
          setMonthDialogOpen(true);
        }
      },
      onPageChange: setMonthDialogPage,
      onPageSizeChange: (nextPageSize: number) => {
        setMonthDialogPageSize(nextPageSize);
        setMonthDialogPage(1);
      },
      toDisplayDate,
    },
    selectedMonth: monthDialogOpen ? activeMonth : null,
  };
}
