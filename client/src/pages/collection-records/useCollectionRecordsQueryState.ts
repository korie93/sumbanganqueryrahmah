import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionNicknames,
  getCollectionRecords,
  type CollectionRecord,
  type CollectionStaffNickname,
} from "@/lib/api";
import {
  buildCollectionRecordsCacheKey,
  createCollectionRecordsCache,
} from "@/pages/collection-records/records-query-cache";
import type { CollectionRecordFilters } from "@/pages/collection-records/types";
import {
  buildCollectionRecordsPaginationState,
  clampCollectionRecordsPageSize,
  DEFAULT_COLLECTION_RECORDS_PAGE_SIZE,
  isCollectionRecordsAbortError,
} from "@/pages/collection-records/collection-records-data-utils";
import { parseApiError } from "@/pages/collection/utils";
import { parseCollectionAmountMyrNumber } from "@shared/collection-amount-types";

type FetchCollectionRecordsPageParams = {
  cursor: string | null;
  filters: CollectionRecordFilters;
  page: number;
  pageSize: number;
  resetHistory?: boolean;
};

export function useCollectionRecordsQueryState() {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const recordsRequestIdRef = useRef(0);
  const nicknamesRequestIdRef = useRef(0);
  const recordsAbortControllerRef = useRef<AbortController | null>(null);
  const nicknamesAbortControllerRef = useRef<AbortController | null>(null);
  const recordsCacheRef = useRef(createCollectionRecordsCache());
  const appliedFiltersRef = useRef<CollectionRecordFilters>({});
  const cursorHistoryRef = useRef<Array<string | null>>([null]);

  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [nicknameOptions, setNicknameOptions] = useState<CollectionStaffNickname[]>([]);
  const [loadingNicknames, setLoadingNicknames] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_COLLECTION_RECORDS_PAGE_SIZE);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const abortRecordsRequest = useCallback(() => {
    if (recordsAbortControllerRef.current) {
      recordsAbortControllerRef.current.abort();
      recordsAbortControllerRef.current = null;
    }
  }, []);

  const abortNicknamesRequest = useCallback(() => {
    if (nicknamesAbortControllerRef.current) {
      nicknamesAbortControllerRef.current.abort();
      nicknamesAbortControllerRef.current = null;
    }
  }, []);

  const clearRecordsCache = useCallback(() => {
    recordsCacheRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      recordsRequestIdRef.current += 1;
      nicknamesRequestIdRef.current += 1;
      abortRecordsRequest();
      abortNicknamesRequest();
      clearRecordsCache();
    };
  }, [abortNicknamesRequest, abortRecordsRequest, clearRecordsCache]);

  const loadNicknames = useCallback(async (options?: { signal?: AbortSignal | undefined }) => {
    const requestId = ++nicknamesRequestIdRef.current;
    abortNicknamesRequest();
    const controller = new AbortController();
    nicknamesAbortControllerRef.current = controller;
    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort(options.signal.reason);
      } else {
        options.signal.addEventListener("abort", () => {
          controller.abort(options.signal?.reason);
        }, { once: true });
      }
    }
    setLoadingNicknames(true);
    try {
      const response = await getCollectionNicknames(undefined, { signal: controller.signal });
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      const options = Array.isArray(response?.nicknames) ? response.nicknames : [];
      setNicknameOptions(options);
      return options;
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      if (isCollectionRecordsAbortError(error)) {
        return undefined;
      }
      toast({
        title: "Failed to Load Nicknames",
        description: parseApiError(error),
        variant: "destructive",
      });
      return undefined;
    } finally {
      if (nicknamesAbortControllerRef.current === controller) {
        nicknamesAbortControllerRef.current = null;
      }
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      setLoadingNicknames(false);
    }
  }, [abortNicknamesRequest, toast]);

  const fetchRecordsPage = useCallback(
    async ({
      cursor,
      filters,
      page,
      pageSize,
      resetHistory = false,
    }: FetchCollectionRecordsPageParams) => {
      const requestId = ++recordsRequestIdRef.current;
      const safePageSize = clampCollectionRecordsPageSize(pageSize);
      const requestFilters: CollectionRecordFilters = {
        from: filters.from,
        to: filters.to,
        search: filters.search,
        nickname: filters.nickname,
        limit: safePageSize,
        cursor,
      };
      const cacheKey = buildCollectionRecordsCacheKey(requestFilters);
      const cachedEntry = recordsCacheRef.current.get(cacheKey);

      if (cachedEntry) {
        abortRecordsRequest();
        if (!isMountedRef.current || requestId !== recordsRequestIdRef.current) {
          return;
        }
        appliedFiltersRef.current = {
          from: requestFilters.from,
          to: requestFilters.to,
          search: requestFilters.search,
          nickname: requestFilters.nickname,
        };
        cursorHistoryRef.current = cursorHistoryRef.current.slice(0, Math.max(0, page - 1));
        cursorHistoryRef.current[page - 1] = cursor;
        if (resetHistory) {
          cursorHistoryRef.current = [cursor];
        }
        setRecords(cachedEntry.records);
        setTotalRecords(
          typeof cachedEntry.totalRecords === "number"
            ? cachedEntry.totalRecords
            : cachedEntry.records.length,
        );
        setTotalAmount(
          typeof cachedEntry.totalAmount === "number"
            ? cachedEntry.totalAmount
            : 0,
        );
        setNextCursor(
          typeof cachedEntry.nextCursor === "string" || cachedEntry.nextCursor === null
            ? cachedEntry.nextCursor
            : null,
        );
        setPage(page);
        setPageSize(safePageSize);
        setLoadingRecords(false);
        return;
      }

      setLoadingRecords(true);
      try {
        abortRecordsRequest();
        const controller = new AbortController();
        recordsAbortControllerRef.current = controller;
        const response = await getCollectionRecords(requestFilters, { signal: controller.signal });
        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          requestId !== recordsRequestIdRef.current
        ) return;

        const nextRecords = Array.isArray(response?.records) ? response.records : [];
        const nextTotalRecords = Number((response?.pagination?.total ?? response?.total) || 0);
        const nextTotalAmount = parseCollectionAmountMyrNumber(response?.totalAmount);
        const nextCursorValue =
          typeof response?.pagination?.nextCursor === "string"
            ? response.pagination.nextCursor
            : typeof response?.nextCursor === "string"
              ? response.nextCursor
              : null;

        recordsCacheRef.current.set(cacheKey, {
          records: nextRecords,
          totalRecords: nextTotalRecords,
          totalAmount: nextTotalAmount,
          nextCursor: nextCursorValue,
        });
        appliedFiltersRef.current = {
          from: requestFilters.from,
          to: requestFilters.to,
          search: requestFilters.search,
          nickname: requestFilters.nickname,
        };
        cursorHistoryRef.current = cursorHistoryRef.current.slice(0, Math.max(0, page - 1));
        cursorHistoryRef.current[page - 1] = cursor;
        if (resetHistory) {
          cursorHistoryRef.current = [cursor];
        }
        setRecords(nextRecords);
        setTotalRecords(nextTotalRecords);
        setTotalAmount(nextTotalAmount);
        setNextCursor(nextCursorValue);
        setPage(page);
        setPageSize(safePageSize);
      } catch (error: unknown) {
        if (!isMountedRef.current || requestId !== recordsRequestIdRef.current) return;
        if (isCollectionRecordsAbortError(error)) {
          return;
        }
        toast({
          title: "Failed to Load Records",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        if (recordsAbortControllerRef.current && requestId === recordsRequestIdRef.current) {
          recordsAbortControllerRef.current = null;
        }
        if (!isMountedRef.current || requestId !== recordsRequestIdRef.current) return;
        setLoadingRecords(false);
      }
    },
    [abortRecordsRequest, toast],
  );

  const loadFirstPage = useCallback(
    async (filters?: CollectionRecordFilters, nextPageSize?: number) => {
      const resolvedPageSize = clampCollectionRecordsPageSize(nextPageSize ?? pageSize);
      const requestFilters: CollectionRecordFilters = {
        from: filters?.from,
        to: filters?.to,
        search: filters?.search,
        nickname: filters?.nickname,
      };
      await fetchRecordsPage({
        cursor: null,
        filters: requestFilters,
        page: 1,
        pageSize: resolvedPageSize,
        resetHistory: true,
      });
    },
    [fetchRecordsPage, pageSize],
  );

  const handlePrevPage = useCallback(() => {
    if (loadingRecords || page <= 1) {
      return;
    }

    const previousPage = page - 1;
    const previousCursor = cursorHistoryRef.current[previousPage - 1] ?? null;
    void fetchRecordsPage({
      cursor: previousCursor,
      filters: appliedFiltersRef.current,
      page: previousPage,
      pageSize,
    });
  }, [fetchRecordsPage, loadingRecords, page, pageSize]);

  const handleNextPage = useCallback(() => {
    if (loadingRecords || !nextCursor) {
      return;
    }

    const nextPageNumber = page + 1;
    void fetchRecordsPage({
      cursor: nextCursor,
      filters: appliedFiltersRef.current,
      page: nextPageNumber,
      pageSize,
    });
  }, [fetchRecordsPage, loadingRecords, nextCursor, page, pageSize]);

  const handlePageSizeChange = useCallback((value: number) => {
    const nextPageSize = clampCollectionRecordsPageSize(value);
    if (nextPageSize === pageSize) {
      return;
    }

    void loadFirstPage(appliedFiltersRef.current, nextPageSize);
  }, [loadFirstPage, pageSize]);

  const pagination = buildCollectionRecordsPaginationState({
    totalRecords,
    page,
    pageSize,
    recordsLength: records.length,
  });

  return {
    records,
    loadingRecords,
    nicknameOptions,
    loadingNicknames,
    page,
    pageSize,
    totalRecords,
    totalAmount,
    nextCursor,
    loadNicknames,
    fetchRecordsPage,
    loadFirstPage,
    handlePrevPage,
    handleNextPage,
    handlePageSizeChange,
    clearRecordsCache,
    getAppliedFilters: () => ({ ...appliedFiltersRef.current }),
    pagination,
  };
}
