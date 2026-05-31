import { useCallback, useEffect, useRef, useState } from "react";
import { getAllActivity, getBannedUsers, getFilteredActivity } from "@/lib/api";
import { logClientError } from "@/lib/client-logger";
import { readActivityFeedErrorMessage } from "@/pages/activity/activity-feed-error-utils";
import {
  shouldAutoRefreshVisibleActivity,
  shouldUseFilteredActivityFetch,
} from "@/pages/activity/activity-data-state-utils";
import type { UseActivityFeedStateOptions } from "@/pages/activity/activity-data-state-shared";
import type { ActivityRecord, BannedUser } from "@/pages/activity/types";

const ACTIVITY_VISIBLE_REFRESH_INTERVAL_MS = 30_000;

export function useActivityFeedState({
  canModerateActivity,
  filtersRef,
}: UseActivityFeedStateOptions) {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeRequestIdRef = useRef(0);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestIdRef.current += 1;
      fetchControllerRef.current?.abort();
      fetchControllerRef.current = null;
    };
  }, []);

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

  const fetchActivities = useCallback(async (useFilters = false) => {
    const requestId = ++activeRequestIdRef.current;
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    setErrorMessage(null);
    setLoading(true);

    try {
      const currentFilters = filtersRef.current;
      const activityResponse = shouldUseFilteredActivityFetch(currentFilters, useFilters)
        ? await getFilteredActivity(currentFilters, { signal: controller.signal })
        : await getAllActivity({ signal: controller.signal });

      if (controller.signal.aborted || !mountedRef.current || requestId !== activeRequestIdRef.current) {
        return;
      }

      setActivities(activityResponse.activities || []);

      if (canModerateActivity) {
        const bannedResponse = await getBannedUsers({ signal: controller.signal });
        if (controller.signal.aborted || !mountedRef.current || requestId !== activeRequestIdRef.current) {
          return;
        }
        setBannedUsers(bannedResponse.users || []);
      } else {
        setBannedUsers([]);
      }
    } catch (error) {
      if (!mountedRef.current || requestId !== activeRequestIdRef.current) {
        return;
      }
      recordActivityFeedFailure(error);
    } finally {
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null;
      }
      if (mountedRef.current && requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [canModerateActivity, filtersRef, recordActivityFeedFailure]);

  const handleUnexpectedActivityFeedFailure = useCallback((error: unknown) => {
    recordActivityFeedFailure(error);
  }, [recordActivityFeedFailure]);

  const runFetchActivities = useCallback((useFilters = false) => {
    void fetchActivities(useFilters).catch(handleUnexpectedActivityFeedFailure);
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

  return {
    activities,
    bannedUsers,
    errorMessage,
    loading,
    fetchActivities,
    refreshCurrentView,
  };
}
