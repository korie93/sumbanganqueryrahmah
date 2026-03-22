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

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
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
    setViewAllFiltersSnapshot(buildCurrentFilters(searchInput.trim(), viewAllPageSize, 0));
    setViewAllOpen(true);
  }, [buildCurrentFilters, searchInput, viewAllLoading, viewAllPageSize]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      viewAllRequestIdRef.current += 1;
      abortViewAllRequest();
    };
  }, [abortViewAllRequest]);

  useEffect(() => {
    if (!viewAllOpen || !viewAllFiltersSnapshot) return;

    const requestId = ++viewAllRequestIdRef.current;
    setViewAllLoading(true);
    abortViewAllRequest();
    const controller = new AbortController();
    viewAllAbortControllerRef.current = controller;

    const loadViewAllPage = async () => {
      try {
        const response = await getCollectionRecords({
          ...viewAllFiltersSnapshot,
          limit: viewAllPageSize,
          offset: (viewAllPage - 1) * viewAllPageSize,
        }, { signal: controller.signal });
        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          requestId !== viewAllRequestIdRef.current
        ) return;
        setViewAllRecords(Array.isArray(response?.records) ? response.records : []);
        setViewAllTotalRecords(Number(response?.total || 0));
        setViewAllTotalAmount(Number(response?.totalAmount || 0));
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
