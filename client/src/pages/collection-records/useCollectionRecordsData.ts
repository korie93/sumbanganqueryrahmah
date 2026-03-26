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

type UseCollectionRecordsDataArgs = {
  canUseNicknameFilter: boolean;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
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

  const deferredSearchInput = useDeferredValue(searchInput);

  const buildCurrentFilters = useCallback(
    (
      searchValue = searchInput.trim(),
      limit = 1000,
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

  const loadRecords = useCallback(
    async (filters?: CollectionRecordFilters) => {
      const requestId = ++recordsRequestIdRef.current;
      const cacheKey = buildCollectionRecordsCacheKey(filters);
      const cachedEntry = recordsCacheRef.current.get(cacheKey);
      if (cachedEntry) {
        abortRecordsRequest();
        setRecords(cachedEntry.records);
        setLoadingRecords(false);
        return;
      }

      setLoadingRecords(true);
      try {
        abortRecordsRequest();
        const controller = new AbortController();
        recordsAbortControllerRef.current = controller;
        const response = await getCollectionRecords(filters, { signal: controller.signal });
        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          requestId !== recordsRequestIdRef.current
        ) return;
        const nextRecords = Array.isArray(response?.records) ? response.records : [];
        recordsCacheRef.current.set(cacheKey, { records: nextRecords });
        setRecords(nextRecords);
      } catch (error: unknown) {
        if (!isMountedRef.current || requestId !== recordsRequestIdRef.current) return;
        if (isAbortError(error)) {
          return;
        }
        if (!isMountedRef.current || requestId !== recordsRequestIdRef.current) return;
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

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    void loadNicknames();
  }, [loadNicknames]);

  useEffect(() => {
    const handleCollectionDataChanged = () => {
      recordsCacheRef.current.clear();
      void loadRecords(buildCurrentFilters());
    };
    window.addEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    return () => {
      window.removeEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    };
  }, [buildCurrentFilters, loadRecords]);

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
      void loadRecords(buildCurrentFilters(trimmedSearch));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [buildCurrentFilters, deferredSearchInput, fromDate, loadRecords, nicknameFilter, toDate]);

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

    await loadRecords(buildCurrentFilters());
  }, [buildCurrentFilters, fromDate, loadRecords, toDate, toast]);

  const handleResetFilter = useCallback(() => {
    skipNextAutoFetchRef.current = true;
    setFromDate("");
    setToDate("");
    setSearchInput("");
    setNicknameFilter("all");
    void loadRecords();
  }, [loadRecords]);

  return {
    records,
    loadingRecords,
    fromDate,
    toDate,
    searchInput,
    nicknameFilter,
    nicknameOptions,
    loadingNicknames,
    setFromDate,
    setToDate,
    setSearchInput,
    setNicknameFilter,
    buildCurrentFilters,
    loadRecords,
    handleFilter,
    handleResetFilter,
  };
}
