import { useCallback, useDeferredValue, useMemo, useState } from "react";
import type {
  RecentLoginActivityFilter,
  RecentLoginActivityPageQuery,
  RecentLoginActivitySortBy,
  RecentLoginActivitySortOrder,
} from "@/pages/dashboard/types";

const RECENT_LOGIN_ACTIVITY_DEFAULT_PAGE_SIZE = 4;

function isRecentLoginActivitySortBy(value: string): value is RecentLoginActivitySortBy {
  return value === "eventTime" || value === "role" || value === "status" || value === "username";
}

function isRecentLoginActivitySortOrder(value: string): value is RecentLoginActivitySortOrder {
  return value === "asc" || value === "desc";
}

export function useDashboardRecentLoginActivityControls() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filter, setFilter] = useState<RecentLoginActivityFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(RECENT_LOGIN_ACTIVITY_DEFAULT_PAGE_SIZE);
  const [role, setRole] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<RecentLoginActivitySortBy>("eventTime");
  const [sortOrder, setSortOrder] = useState<RecentLoginActivitySortOrder>("desc");
  const deferredSearch = useDeferredValue(search.trim());

  const query = useMemo<RecentLoginActivityPageQuery>(
    () => ({
      page,
      pageSize,
      status: filter,
      sortBy,
      sortOrder,
      ...(role !== "all" ? { role } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      ...(deferredSearch ? { search: deferredSearch } : {}),
    }),
    [dateFrom, dateTo, deferredSearch, filter, page, pageSize, role, sortBy, sortOrder],
  );

  const handleFilterChange = useCallback((nextFilter: RecentLoginActivityFilter) => {
    setFilter(nextFilter);
    setPage(1);
  }, []);

  const handlePageSizeChange = useCallback((nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleRoleChange = useCallback((value: string) => {
    setRole(value);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((value: string) => {
    const [nextSortBy, nextSortOrder] = value.split(":");
    const sortByCandidate = nextSortBy ?? "";
    const sortOrderCandidate = nextSortOrder ?? "";
    if (
      isRecentLoginActivitySortBy(sortByCandidate)
      && isRecentLoginActivitySortOrder(sortOrderCandidate)
    ) {
      setSortBy(sortByCandidate);
      setSortOrder(sortOrderCandidate);
      setPage(1);
    }
  }, []);

  const handleDateFromChange = useCallback((value: string) => {
    setDateFrom(value);
    setDateTo((current) => (current && value && current < value ? value : current));
    setPage(1);
  }, []);

  const handleDateToChange = useCallback((value: string) => {
    setDateTo(value);
    setDateFrom((current) => (current && value && current > value ? value : current));
    setPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setDateFrom("");
    setDateTo("");
    setFilter("all");
    setPage(1);
    setRole("all");
    setSearch("");
    setSortBy("eventTime");
    setSortOrder("desc");
  }, []);

  const syncServerPage = useCallback((serverPage: number | undefined, serverPageIsPlaceholder: boolean) => {
    if (!serverPageIsPlaceholder && serverPage && serverPage !== page) {
      setPage(serverPage);
    }
  }, [page]);

  return {
    dateFrom,
    dateTo,
    filter,
    handleClearFilters,
    handleDateFromChange,
    handleDateToChange,
    handleFilterChange,
    handlePageSizeChange,
    handleRoleChange,
    handleSearchChange,
    handleSortChange,
    page,
    pageSize,
    query,
    role,
    search,
    setPage,
    syncServerPage,
    sortValue: `${sortBy}:${sortOrder}`,
  } as const;
}
