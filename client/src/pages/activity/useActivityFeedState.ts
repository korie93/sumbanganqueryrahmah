import { useCallback, useEffect, useRef, useState } from "react";
import { getActivityPage, getBannedUsers } from "@/lib/api";
import { logClientError } from "@/lib/client-logger";
import { readActivityFeedErrorMessage } from "@/pages/activity/activity-feed-error-utils";
import {
  shouldAutoRefreshVisibleActivity,
  shouldUseFilteredActivityFetch,
} from "@/pages/activity/activity-data-state-utils";
import type { UseActivityFeedStateOptions } from "@/pages/activity/activity-data-state-shared";
import type {
  ActivityRecord,
  ActivitySortBy,
  ActivitySortOrder,
  BannedUser,
} from "@/pages/activity/types";

const ACTIVITY_VISIBLE_REFRESH_INTERVAL_MS = 30_000;
const DEFAULT_ACTIVITY_PAGE_SIZE = 20;
const DEFAULT_ACTIVITY_SORT_BY: ActivitySortBy = "loginTime";
const DEFAULT_ACTIVITY_SORT_ORDER: ActivitySortOrder = "desc";

type ActivityFeedQueryOverrides = {
  page?: number | undefined;
  pageSize?: number | undefined;
  sortBy?: ActivitySortBy | undefined;
  sortOrder?: ActivitySortOrder | undefined;
};

export function useActivityFeedState({
  canModerateActivity,
  filtersRef,
}: UseActivityFeedStateOptions) {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_ACTIVITY_PAGE_SIZE);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<ActivitySortBy>(DEFAULT_ACTIVITY_SORT_BY);
  const [sortOrder, setSortOrder] = useState<ActivitySortOrder>(DEFAULT_ACTIVITY_SORT_ORDER);
  const [summaryCounts, setSummaryCounts] = useState({
    idleCount: 0,
    kickedCount: 0,
    logoutCount: 0,
    onlineCount: 0,
  });

  const activeRequestIdRef = useRef(0);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const pageRef = useRef(1);
  const pageSizeRef = useRef(DEFAULT_ACTIVITY_PAGE_SIZE);
  const sortByRef = useRef<ActivitySortBy>(DEFAULT_ACTIVITY_SORT_BY);
  const sortOrderRef = useRef<ActivitySortOrder>(DEFAULT_ACTIVITY_SORT_ORDER);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestIdRef.current += 1;
      fetchControllerRef.current?.abort();
      fetchControllerRef.current = null;
    };
  }, []);

  const isActiveActivityFeedRequest = useCallback((
    controller: AbortController,
    requestId: number,
  ) => (
    mountedRef.current
    && !controller.signal.aborted
    && fetchControllerRef.current === controller
    && requestId === activeRequestIdRef.current
  ), []);

  const recordActivityFeedFailure = useCallback((error: unknown) => {
    const nextErrorMessage = readActivityFeedErrorMessage(error);
    if (!nextErrorMessage) {
      return;
    }

    if (mountedRef.current) {
      setErrorMessage(nextErrorMessage);
    }
    logClientError("Failed to fetch activities:", error, {
      event: "activity_feed_fetch_failed",
    });
  }, []);

  const fetchActivities = useCallback(async (
    useFilters = false,
    overrides: ActivityFeedQueryOverrides = {},
  ) => {
    const requestId = ++activeRequestIdRef.current;
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    setErrorMessage(null);
    setLoading(true);

    try {
      const currentFilters = filtersRef.current;
      const shouldApplyFilters = shouldUseFilteredActivityFetch(currentFilters, useFilters);
      const requestedPage = overrides.page ?? pageRef.current;
      const requestedPageSize = overrides.pageSize ?? pageSizeRef.current;
      const requestedSortBy = overrides.sortBy ?? sortByRef.current;
      const requestedSortOrder = overrides.sortOrder ?? sortOrderRef.current;
      const activityResponse = await getActivityPage(
        {
          page: requestedPage,
          pageSize: requestedPageSize,
          sortBy: requestedSortBy,
          sortOrder: requestedSortOrder,
          ...(shouldApplyFilters ? currentFilters : {}),
        },
        { signal: controller.signal },
      );

      if (!isActiveActivityFeedRequest(controller, requestId)) {
        return;
      }

      setActivities(activityResponse.activities || []);
      setSummaryCounts(activityResponse.summary);
      setPage(activityResponse.pagination.page);
      setPageSize(activityResponse.pagination.pageSize);
      setTotalItems(activityResponse.pagination.total);
      setTotalPages(activityResponse.pagination.totalPages);
      setSortBy(requestedSortBy);
      setSortOrder(requestedSortOrder);
      pageRef.current = activityResponse.pagination.page;
      pageSizeRef.current = activityResponse.pagination.pageSize;
      sortByRef.current = requestedSortBy;
      sortOrderRef.current = requestedSortOrder;

      if (canModerateActivity) {
        const bannedResponse = await getBannedUsers({ signal: controller.signal });
        if (!isActiveActivityFeedRequest(controller, requestId)) {
          return;
        }
        setBannedUsers(bannedResponse.users || []);
      } else {
        setBannedUsers([]);
      }
    } catch (error) {
      if (!isActiveActivityFeedRequest(controller, requestId)) {
        return;
      }
      recordActivityFeedFailure(error);
    } finally {
      const shouldFinalizeRequest = isActiveActivityFeedRequest(controller, requestId);
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null;
      }
      if (shouldFinalizeRequest) {
        setLoading(false);
      }
    }
  }, [canModerateActivity, filtersRef, isActiveActivityFeedRequest, recordActivityFeedFailure]);

  const handleUnexpectedActivityFeedFailure = useCallback((error: unknown) => {
    recordActivityFeedFailure(error);
  }, [recordActivityFeedFailure]);

  const runFetchActivities = useCallback((
    useFilters = false,
    overrides: ActivityFeedQueryOverrides = {},
  ) => {
    void fetchActivities(useFilters, overrides).catch(handleUnexpectedActivityFeedFailure);
  }, [fetchActivities, handleUnexpectedActivityFeedFailure]);

  useEffect(() => {
    runFetchActivities(false);
  }, [runFetchActivities]);

  useEffect(() => {
    const refreshVisibleActivity = () => {
      const visibilityState =
        typeof document === "undefined" ? undefined : document.visibilityState;

      if (shouldAutoRefreshVisibleActivity(filtersRef.current, visibilityState)) {
        runFetchActivities(false);
      }
    };

    const interval = window.setInterval(() => {
      refreshVisibleActivity();
    }, ACTIVITY_VISIBLE_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refreshVisibleActivity();
      }
    };

    const handleHeartbeatSynced = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      runFetchActivities(true);
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("activity-heartbeat-synced", handleHeartbeatSynced);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("activity-heartbeat-synced", handleHeartbeatSynced);
      }
      window.clearInterval(interval);
    };
  }, [filtersRef, runFetchActivities]);

  const refreshCurrentView = useCallback(() => {
    runFetchActivities(true);
  }, [runFetchActivities]);

  const handlePageChange = useCallback((nextPage: number) => {
    const safePage = Math.max(1, Math.trunc(nextPage));
    pageRef.current = safePage;
    setPage(safePage);
    runFetchActivities(true, { page: safePage });
  }, [runFetchActivities]);

  const handlePageSizeChange = useCallback((nextPageSize: number) => {
    const safePageSize = Math.max(1, Math.min(100, Math.trunc(nextPageSize)));
    pageRef.current = 1;
    pageSizeRef.current = safePageSize;
    setPage(1);
    setPageSize(safePageSize);
    runFetchActivities(true, { page: 1, pageSize: safePageSize });
  }, [runFetchActivities]);

  const handleSortChange = useCallback((
    nextSortBy: ActivitySortBy,
    nextSortOrder: ActivitySortOrder,
  ) => {
    pageRef.current = 1;
    sortByRef.current = nextSortBy;
    sortOrderRef.current = nextSortOrder;
    setPage(1);
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    runFetchActivities(true, {
      page: 1,
      sortBy: nextSortBy,
      sortOrder: nextSortOrder,
    });
  }, [runFetchActivities]);

  return {
    activities,
    bannedUsers,
    errorMessage,
    loading,
    page,
    pageSize,
    totalItems,
    totalPages,
    sortBy,
    sortOrder,
    summaryCounts,
    requestActivityPage: runFetchActivities,
    refreshCurrentView,
    handlePageChange,
    handlePageSizeChange,
    handleSortChange,
  };
}
