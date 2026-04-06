import { useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import type { CollectionStaffNickname } from "@/lib/api";
import { DEFAULT_COLLECTION_RECORDS_PAGE_SIZE } from "@/pages/collection-records/collection-records-data-utils";
import { COLLECTION_DATA_CHANGED_EVENT, isValidDate } from "@/pages/collection/utils";
import { useCollectionRecordsFilterState } from "@/pages/collection-records/useCollectionRecordsFilterState";
import { useCollectionRecordsQueryState } from "@/pages/collection-records/useCollectionRecordsQueryState";

type UseCollectionRecordsDataArgs = {
  canUseNicknameFilter: boolean;
};

export function useCollectionRecordsData({
  canUseNicknameFilter,
}: UseCollectionRecordsDataArgs) {
  const { toast } = useToast();
  const {
    records,
    loadingRecords,
    nicknameOptions,
    loadingNicknames,
    page,
    pageSize,
    totalRecords,
    totalAmount,
    fetchRecordsPage,
    loadNicknames,
    loadFirstPage,
    handlePrevPage,
    handleNextPage,
    handlePageSizeChange,
    clearRecordsCache,
    getAppliedFilters,
    pagination,
  } = useCollectionRecordsQueryState();
  const {
    fromDate,
    toDate,
    searchInput,
    nicknameFilter,
    deferredSearchInput,
    fromDateRef,
    toDateRef,
    searchInputRef,
    handleFromDateChange,
    handleToDateChange,
    handleSearchInputChange,
    handleNicknameFilterChange,
    buildCurrentFilters,
    markSkipNextAutoFetch,
    consumeInitialAutoFetch,
    consumeNextAutoFetch,
  } = useCollectionRecordsFilterState({
    canUseNicknameFilter,
    pageSize,
  });

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
    void loadNicknames().then((options) => {
      if (!Array.isArray(options)) return;

      const nextValue = nicknameFilter !== "all"
        && !options.some((item: CollectionStaffNickname) => item.nickname === nicknameFilter)
          ? "all"
          : nicknameFilter;

      if (nextValue !== nicknameFilter) {
        handleNicknameFilterChange(nextValue);
      }
    });
  }, [
    handleNicknameFilterChange,
    loadNicknames,
    nicknameFilter,
  ]);

  useEffect(() => {
    const handleCollectionDataChanged = () => {
      clearRecordsCache();
      void loadFirstPage(getAppliedFilters());
    };
    window.addEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    return () => {
      window.removeEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    };
  }, [clearRecordsCache, getAppliedFilters, loadFirstPage]);

  useEffect(() => {
    const trimmedSearch = deferredSearchInput.trim();
    if (consumeInitialAutoFetch()) {
      return;
    }
    if (consumeNextAutoFetch()) {
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
    consumeInitialAutoFetch,
    consumeNextAutoFetch,
    deferredSearchInput,
    fromDate,
    loadFirstPage,
    nicknameFilter,
    pageSize,
    toDate,
  ]);

  const handleFilter = useCallback(async () => {
    const currentFromDate = fromDateRef.current;
    const currentToDate = toDateRef.current;

    if (currentFromDate && !isValidDate(currentFromDate)) {
      toast({
        title: "Validation Error",
        description: "From Date is invalid.",
        variant: "destructive",
      });
      return;
    }
    if (currentToDate && !isValidDate(currentToDate)) {
      toast({
        title: "Validation Error",
        description: "To Date is invalid.",
        variant: "destructive",
      });
      return;
    }
    if (currentFromDate && currentToDate && currentFromDate > currentToDate) {
      toast({
        title: "Validation Error",
        description: "From Date cannot be later than To Date.",
        variant: "destructive",
      });
      return;
    }

    markSkipNextAutoFetch();
    await loadFirstPage(
      buildCurrentFilters(searchInputRef.current, pageSize, 0),
    );
  }, [
    buildCurrentFilters,
    fromDateRef,
    loadFirstPage,
    markSkipNextAutoFetch,
    pageSize,
    searchInputRef,
    toDateRef,
    toast,
  ]);

  const handleResetFilter = useCallback(() => {
    markSkipNextAutoFetch();
    handleFromDateChange("");
    handleToDateChange("");
    handleSearchInputChange("");
    handleNicknameFilterChange("all");
    void loadFirstPage({});
  }, [
    handleFromDateChange,
    handleNicknameFilterChange,
    handleSearchInputChange,
    handleToDateChange,
    loadFirstPage,
    markSkipNextAutoFetch,
  ]);

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
    pageOffset: pagination.pageOffset,
    pagedStart: pagination.pagedStart,
    pagedEnd: pagination.pagedEnd,
    totalPages: pagination.totalPages,
    totalRecords,
    totalAmount,
    hasNextPage: pagination.hasNextPage,
    hasPreviousPage: pagination.hasPreviousPage,
    setFromDate: handleFromDateChange,
    setToDate: handleToDateChange,
    setSearchInput: handleSearchInputChange,
    setNicknameFilter: handleNicknameFilterChange,
    buildCurrentFilters,
    loadRecords: loadFirstPage,
    handleFilter,
    handleResetFilter,
    handlePrevPage,
    handleNextPage,
    handlePageSizeChange,
    getAppliedFilters,
  };
}
