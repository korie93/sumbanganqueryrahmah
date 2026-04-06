import { useCallback, useDeferredValue, useRef, useState } from "react";
import type { CollectionRecordFilters } from "@/pages/collection-records/types";
import { buildCollectionRecordFilterSnapshot } from "@/pages/collection-records/collection-record-filters";

type UseCollectionRecordsFilterStateOptions = {
  canUseNicknameFilter: boolean;
  pageSize: number;
};

export function useCollectionRecordsFilterState({
  canUseNicknameFilter,
  pageSize,
}: UseCollectionRecordsFilterStateOptions) {
  const skipInitialAutoFetchRef = useRef(true);
  const skipNextAutoFetchRef = useRef(false);
  const fromDateRef = useRef("");
  const toDateRef = useRef("");
  const searchInputRef = useRef("");
  const nicknameFilterRef = useRef("all");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [nicknameFilter, setNicknameFilter] = useState<string>("all");

  const deferredSearchInput = useDeferredValue(searchInput);

  const handleFromDateChange = useCallback((value: string) => {
    fromDateRef.current = value;
    setFromDate(value);
  }, []);

  const handleToDateChange = useCallback((value: string) => {
    toDateRef.current = value;
    setToDate(value);
  }, []);

  const handleSearchInputChange = useCallback((value: string) => {
    searchInputRef.current = value;
    setSearchInput(value);
  }, []);

  const handleNicknameFilterChange = useCallback((value: string) => {
    nicknameFilterRef.current = value;
    setNicknameFilter(value);
  }, []);

  const buildCurrentFilters = useCallback(
    (
      searchValue = searchInputRef.current,
      limit = pageSize,
      offset = 0,
    ): CollectionRecordFilters =>
      buildCollectionRecordFilterSnapshot({
        fromDate: fromDateRef.current,
        toDate: toDateRef.current,
        searchInput: searchValue,
        canUseNicknameFilter,
        nicknameFilter: nicknameFilterRef.current,
        limit,
        offset,
      }),
    [canUseNicknameFilter, pageSize],
  );

  const markSkipNextAutoFetch = useCallback(() => {
    skipNextAutoFetchRef.current = true;
  }, []);

  const consumeInitialAutoFetch = useCallback(() => {
    if (!skipInitialAutoFetchRef.current) return false;
    skipInitialAutoFetchRef.current = false;
    return true;
  }, []);

  const consumeNextAutoFetch = useCallback(() => {
    if (!skipNextAutoFetchRef.current) return false;
    skipNextAutoFetchRef.current = false;
    return true;
  }, []);

  return {
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
  };
}
