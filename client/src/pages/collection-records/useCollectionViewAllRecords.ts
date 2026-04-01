import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionRecords,
  type CollectionRecord,
} from "@/lib/api";
import type { CollectionRecordFilters } from "@/pages/collection-records/types";
import {
  COLLECTION_DATA_CHANGED_EVENT,
  parseApiError,
} from "@/pages/collection/utils";
import {
  buildCollectionRecordsCacheKey,
  createCollectionRecordsCache,
} from "@/pages/collection-records/records-query-cache";

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function getCachedRecordTotalAmount(records: CollectionRecord[]) {
  return records.reduce((total, record) => {
    const nextAmount = Number(record.amount);
    return Number.isFinite(nextAmount) ? total + nextAmount : total;
  }, 0);
}

type UseCollectionViewAllRecordsArgs = {
  buildCurrentFilters: (
    searchValue?: string,
    limit?: number,
    offset?: number,
  ) => CollectionRecordFilters;
  searchInput: string;
};

export function useCollectionViewAllRecords({
  buildCurrentFilters,
  searchInput,
}: UseCollectionViewAllRecordsArgs) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const viewAllRequestIdRef = useRef(0);
  const viewAllAbortControllerRef = useRef<AbortController | null>(null);
  const viewAllCacheRef = useRef(createCollectionRecordsCache(12));

  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [viewAllLoading, setViewAllLoading] = useState(false);
  const [viewAllRecords, setViewAllRecords] = useState<CollectionRecord[]>([]);
  const [viewAllFiltersSnapshot, setViewAllFiltersSnapshot] =
    useState<CollectionRecordFilters | null>(null);
  const [viewAllPage, setViewAllPage] = useState(1);
  const [viewAllPageSize, setViewAllPageSize] = useState(10);
  const [viewAllTotalRecords, setViewAllTotalRecords] = useState(0);
  const [viewAllTotalAmount, setViewAllTotalAmount] = useState(0);
  const [viewAllRefreshToken, setViewAllRefreshToken] = useState(0);

  const viewAllTotalPages = useMemo(
    () => Math.max(1, Math.ceil(viewAllTotalRecords / viewAllPageSize)),
    [viewAllPageSize, viewAllTotalRecords],
  );

  const abortViewAllRequest = useCallback(() => {
    if (viewAllAbortControllerRef.current) {
      viewAllAbortControllerRef.current.abort();
      viewAllAbortControllerRef.current = null;
    }
  }, []);

  const closeViewAll = useCallback(() => {
    viewAllRequestIdRef.current += 1;
    abortViewAllRequest();
    setViewAllOpen(false);
    setViewAllLoading(false);
    setViewAllRecords([]);
    setViewAllFiltersSnapshot(null);
    setViewAllPage(1);
    setViewAllPageSize(10);
    setViewAllTotalRecords(0);
    setViewAllTotalAmount(0);
  }, [abortViewAllRequest]);

  const handleOpenViewAll = useCallback(() => {
    if (viewAllLoading) return;
    setViewAllPage(1);
    setViewAllFiltersSnapshot(buildCurrentFilters(searchInput.trim()));
    setViewAllOpen(true);
  }, [buildCurrentFilters, searchInput, viewAllLoading, viewAllPageSize]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      viewAllRequestIdRef.current += 1;
      abortViewAllRequest();
      viewAllCacheRef.current.clear();
    };
  }, [abortViewAllRequest]);

  useEffect(() => {
    if (!viewAllOpen || !viewAllFiltersSnapshot) return;

    const requestId = ++viewAllRequestIdRef.current;
    const requestFilters = {
      from: viewAllFiltersSnapshot.from,
      to: viewAllFiltersSnapshot.to,
      search: viewAllFiltersSnapshot.search,
      nickname: viewAllFiltersSnapshot.nickname,
      page: viewAllPage,
      pageSize: viewAllPageSize,
    };
    const cacheKey = buildCollectionRecordsCacheKey(requestFilters);
    const cachedEntry = viewAllCacheRef.current.get(cacheKey);

    if (cachedEntry) {
      abortViewAllRequest();
      setViewAllRecords(cachedEntry.records);
      setViewAllTotalRecords(
        typeof cachedEntry.totalRecords === "number"
          ? cachedEntry.totalRecords
          : cachedEntry.records.length,
      );
      setViewAllTotalAmount(
        typeof cachedEntry.totalAmount === "number"
          ? cachedEntry.totalAmount
          : getCachedRecordTotalAmount(cachedEntry.records),
      );
      setViewAllLoading(false);
      return;
    }

    setViewAllLoading(true);
    abortViewAllRequest();
    const controller = new AbortController();
    viewAllAbortControllerRef.current = controller;

    const loadViewAllPage = async () => {
      try {
        const response = await getCollectionRecords(requestFilters, { signal: controller.signal });
        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          requestId !== viewAllRequestIdRef.current
        ) return;
        const nextRecords = Array.isArray(response?.records) ? response.records : [];
        const nextTotalRecords = Number((response?.pagination?.total ?? response?.total) || 0);
        const nextTotalAmount = Number(response?.totalAmount || 0);
        viewAllCacheRef.current.set(cacheKey, {
          records: nextRecords,
          totalRecords: nextTotalRecords,
          totalAmount: nextTotalAmount,
        });
        setViewAllRecords(nextRecords);
        setViewAllTotalRecords(nextTotalRecords);
        setViewAllTotalAmount(nextTotalAmount);
      } catch (error: unknown) {
        if (
          controller.signal.aborted ||
          isAbortError(error) ||
          !isMountedRef.current ||
          requestId !== viewAllRequestIdRef.current
        ) return;
        setViewAllRecords([]);
        setViewAllTotalRecords(0);
        setViewAllTotalAmount(0);
        toast({
          title: "Failed to Load Full Records",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        if (viewAllAbortControllerRef.current === controller) {
          viewAllAbortControllerRef.current = null;
        }
        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          requestId !== viewAllRequestIdRef.current
        ) return;
        setViewAllLoading(false);
      }
    };

    void loadViewAllPage();
  }, [
    abortViewAllRequest,
    toast,
    viewAllFiltersSnapshot,
    viewAllOpen,
    viewAllPage,
    viewAllPageSize,
    viewAllRefreshToken,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleCollectionDataChanged = () => {
      viewAllCacheRef.current.clear();
      if (!viewAllOpen || !viewAllFiltersSnapshot) return;
      setViewAllRefreshToken((previous) => previous + 1);
    };

    window.addEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    return () => {
      window.removeEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    };
  }, [viewAllFiltersSnapshot, viewAllOpen]);

  return {
    handleOpenViewAll,
    viewAllLoading,
    viewAll: {
      open: viewAllOpen,
      loading: viewAllLoading,
      fromDate: viewAllFiltersSnapshot?.from || "",
      toDate: viewAllFiltersSnapshot?.to || "",
      records: viewAllRecords,
      summary: {
        totalRecords: viewAllTotalRecords,
        totalAmount: viewAllTotalAmount,
      },
      page: viewAllPage,
      pageSize: viewAllPageSize,
      totalPages: viewAllTotalPages,
      onOpenChange: (open: boolean) => {
        if (!open) {
          closeViewAll();
        } else {
          setViewAllOpen(true);
        }
      },
      onPageChange: setViewAllPage,
      onPageSizeChange: (nextPageSize: number) => {
        setViewAllPageSize(nextPageSize);
        setViewAllPage(1);
      },
    },
  };
}
