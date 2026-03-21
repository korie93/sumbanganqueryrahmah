import { useCallback, useEffect, useMemo, useState } from "react";
import { STANDARD_PAGE_SIZE_OPTIONS } from "@/components/data/AppPaginationBar";

type UsePaginatedItemsOptions = {
  initialPageSize?: number;
  resetKey?: string;
};

export function getPaginatedTotalPages(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = getPaginatedTotalPages(items.length, safePageSize);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safePageSize;
  return items.slice(start, start + safePageSize);
}

export function usePaginatedItems<T>(
  items: T[],
  { initialPageSize = STANDARD_PAGE_SIZE_OPTIONS[0], resetKey }: UsePaginatedItemsOptions = {},
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const totalPages = getPaginatedTotalPages(items.length, pageSize);

  useEffect(() => {
    setPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const paginatedItems = useMemo(() => {
    return paginateItems(items, page, pageSize);
  }, [items, page, pageSize]);

  const handlePageChange = useCallback((nextPage: number) => {
    setPage(nextPage);
  }, []);

  const handlePageSizeChange = useCallback((nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
  }, []);

  return {
    page,
    pageSize,
    totalPages,
    paginatedItems,
    setPage: handlePageChange,
    setPageSize: handlePageSizeChange,
  };
}
