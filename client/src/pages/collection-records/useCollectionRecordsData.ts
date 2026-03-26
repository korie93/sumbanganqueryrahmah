import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionNicknames,
  getCollectionRecords,
  type CollectionRecord,
  type CollectionStaffNickname,
} from "@/lib/api";
import type { CollectionRecordFilters } from "@/pages/collection-records/types";
import {
  COLLECTION_DATA_CHANGED_EVENT,
  isValidDate,
  parseApiError,
} from "@/pages/collection/utils";
import {
  buildCollectionRecordsCacheKey,
  createCollectionRecordsCache,
} from "@/pages/collection-records/records-query-cache";

const DEFAULT_COLLECTION_RECORDS_PAGE_SIZE = 50;
const MAX_COLLECTION_RECORDS_PAGE_SIZE = 200;

type UseCollectionRecordsDataArgs = {
  canUseNicknameFilter: boolean;
};

type FetchCollectionRecordsPageParams = {
  cursor: string | null;
  filters: CollectionRecordFilters;
  page: number;
  pageSize: number;
  resetHistory?: boolean;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function clampCollectionRecordsPageSize(value: number) {
  return Math.max(1, Math.min(MAX_COLLECTION_RECORDS_PAGE_SIZE, Math.floor(value)));
}

export function useCollectionRecordsData({
  canUseNicknameFilter,
}: UseCollectionRecordsDataArgs) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const recordsRequestIdRef = useRef(0);
  const nicknamesRequestIdRef = useRef(0);
  const recordsAbortControllerRef = useRef<AbortController | null>(null);
  const recordsCacheRef = useRef(createCollectionRecordsCache());
  const appliedFiltersRef = useRef<CollectionRecordFilters>({});
  const cursorHistoryRef = useRef<Array<string | null>>([null]);
  const skipInitialAutoFetchRef = useRef(true);
  const skipNextAutoFetchRef = useRef(false);

  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [nicknameOptions, setNicknameOptions] = useState<CollectionStaffNickname[]>([]);
  const [nicknameFilter, setNicknameFilter] = useState<string>("all");
  const [loadingNicknames, setLoadingNicknames] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_COLLECTION_RECORDS_PAGE_SIZE);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const deferredSearchInput = useDeferredValue(searchInput);

  const buildCurrentFilters = useCallback(
    (
      searchValue = searchInput.trim(),
      limit = pageSize,
      offset = 0,
    ): CollectionRecordFilters => ({
      from: fromDate || undefined,
      to: toDate || undefined,
      search: searchValue || undefined,
      nickname:
        canUseNicknameFilter && nicknameFilter !== "all"
          ? nicknameFilter
          : undefined,
      limit,
      offset,
    }),
    [
      canUseNicknameFilter,
      fromDate,
      nicknameFilter,
      pageSize,
      searchInput,
      toDate,
    ],
  );

  const abortRecordsRequest = useCallback(() => {
    if (recordsAbortControllerRef.current) {
      recordsAbortControllerRef.current.abort();
      recordsAbortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      recordsRequestIdRef.current += 1;
      abortRecordsRequest();
      recordsCacheRef.current.clear();
    };
  }, [abortRecordsRequest]);

  const loadNicknames = useCallback(async () => {
    const requestId = ++nicknamesRequestIdRef.current;
    setLoadingNicknames(true);
    try {
      const response = await getCollectionNicknames();
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      const options = Array.isArray(response?.nicknames) ? response.nicknames : [];
      setNicknameOptions(options);
      setNicknameFilter((previous) =>
        previous !== "all" && !options.some((item) => item.nickname === previous)
          ? "all"
          : previous,
      );
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      toast({
        title: "Failed to Load Nicknames",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      setLoadingNicknames(false);
    }
  }, [toast]);

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
        const nextTotalRecords = Number(response?.total || 0);
        const nextTotalAmount = Number(response?.totalAmount || 0);
        const nextCursorValue =
          typeof response?.nextCursor === "string" ? response.nextCursor : null;

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
        if (isAbortError(error)) {
          return;
        }
        toast({
          title: "Failed to Load Records",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        if (
          recordsAbortControllerRef.current
          && requestId === recordsRequestIdRef.current
        ) {
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

  useEffect(() => {
    void fetchRecordsPage({
      cursor: null,
      filters: {},
      page: 1,
      pageSize: DEFAULT_COLLECTION_RECORDS_PAGE_SIZE,
      resetHistory: true,
    });
  }, [fetchRecordsPage]);

  useEffect(() => {
    void loadNicknames();
  }, [loadNicknames]);

  useEffect(() => {
    const handleCollectionDataChanged = () => {
      recordsCacheRef.current.clear();
      void loadFirstPage(appliedFiltersRef.current);
    };
    window.addEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    return () => {
      window.removeEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    };
  }, [loadFirstPage]);

  useEffect(() => {
    const trimmedSearch = deferredSearchInput.trim();
    if (skipInitialAutoFetchRef.current) {
      skipInitialAutoFetchRef.current = false;
      return;
    }
    if (skipNextAutoFetchRef.current) {
      skipNextAutoFetchRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      if (fromDate && !isValidDate(fromDate)) return;
      if (toDate && !isValidDate(toDate)) return;
      if (fromDate && toDate && fromDate > toDate) return;
      void loadFirstPage(buildCurrentFilters(trimmedSearch, pageSize, 0));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    buildCurrentFilters,
    deferredSearchInput,
    fromDate,
    loadFirstPage,
    nicknameFilter,
    pageSize,
    toDate,
  ]);

  const handleFilter = useCallback(async () => {
    if (fromDate && !isValidDate(fromDate)) {
      toast({
        title: "Validation Error",
        description: "From Date is invalid.",
        variant: "destructive",
      });
      return;
    }
    if (toDate && !isValidDate(toDate)) {
      toast({
        title: "Validation Error",
        description: "To Date is invalid.",
        variant: "destructive",
      });
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      toast({
        title: "Validation Error",
        description: "From Date cannot be later than To Date.",
        variant: "destructive",
      });
      return;
    }

    await loadFirstPage(buildCurrentFilters(searchInput.trim(), pageSize, 0));
  }, [
    buildCurrentFilters,
    fromDate,
    loadFirstPage,
    pageSize,
    searchInput,
    toDate,
    toast,
  ]);

  const handleResetFilter = useCallback(() => {
    skipNextAutoFetchRef.current = true;
    setFromDate("");
    setToDate("");
    setSearchInput("");
    setNicknameFilter("all");
    void loadFirstPage({});
  }, [loadFirstPage]);

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

  const pageOffset = totalRecords === 0 ? 0 : (page - 1) * pageSize;
  const pagedStart = totalRecords === 0 ? 0 : pageOffset + 1;
  const pagedEnd = totalRecords === 0 ? 0 : Math.min(totalRecords, pageOffset + records.length);
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  return {
    records,
    loadingRecords,
    fromDate,
    toDate,
    searchInput,
    nicknameFilter,
    nicknameOptions,
    loadingNicknames,
    page,
    pageSize,
    pageOffset,
    pagedStart,
    pagedEnd,
    totalPages,
    totalRecords,
    totalAmount,
    hasNextPage: nextCursor !== null,
    hasPreviousPage: page > 1,
    setFromDate,
    setToDate,
    setSearchInput,
    setNicknameFilter,
    buildCurrentFilters,
    loadRecords: loadFirstPage,
    handleFilter,
    handleResetFilter,
    handlePrevPage,
    handleNextPage,
    handlePageSizeChange,
    getAppliedFilters: () => ({
      ...appliedFiltersRef.current,
    }),
  };
}
