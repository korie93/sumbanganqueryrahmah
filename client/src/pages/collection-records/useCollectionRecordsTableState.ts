import { useCallback, useEffect, useMemo, useState } from "react";
import type { CollectionRecord } from "@/lib/api";

type UseCollectionRecordsTableStateArgs = {
  visibleRecords: CollectionRecord[];
  resetKey: string;
};

export function useCollectionRecordsTableState({
  visibleRecords,
  resetKey,
}: UseCollectionRecordsTableStateArgs) {
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(50);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleRecords.length / tablePageSize)),
    [tablePageSize, visibleRecords.length],
  );

  const paginatedRecords = useMemo(() => {
    const start = (tablePage - 1) * tablePageSize;
    return visibleRecords.slice(start, start + tablePageSize);
  }, [tablePage, tablePageSize, visibleRecords]);

  const pagedStart = visibleRecords.length === 0 ? 0 : (tablePage - 1) * tablePageSize + 1;
  const pagedEnd = Math.min(visibleRecords.length, tablePage * tablePageSize);
  const pageOffset = Math.max(0, (tablePage - 1) * tablePageSize);

  useEffect(() => {
    setTablePage(1);
  }, [resetKey, tablePageSize]);

  useEffect(() => {
    if (tablePage > totalPages) {
      setTablePage(totalPages);
    }
  }, [tablePage, totalPages]);

  const handlePrevPage = useCallback(
    () => setTablePage((previous) => Math.max(1, previous - 1)),
    [],
  );

  const handleNextPage = useCallback(
    () => setTablePage((previous) => Math.min(totalPages, previous + 1)),
    [totalPages],
  );

  return {
    tablePage,
    tablePageSize,
    totalPages,
    paginatedRecords,
    pagedStart,
    pagedEnd,
    pageOffset,
    setTablePageSize,
    handlePrevPage,
    handleNextPage,
  };
}
