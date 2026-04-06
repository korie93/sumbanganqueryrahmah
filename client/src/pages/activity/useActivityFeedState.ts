import { useCallback, useEffect, useRef, useState } from "react";
import { getAllActivity, getBannedUsers, getFilteredActivity } from "@/lib/api";
import {
  shouldAutoRefreshVisibleActivity,
  shouldUseFilteredActivityFetch,
} from "@/pages/activity/activity-data-state-utils";
import type { UseActivityFeedStateOptions } from "@/pages/activity/activity-data-state-shared";
import type { ActivityRecord, BannedUser } from "@/pages/activity/types";

export function useActivityFeedState({
  canModerateActivity,
  filtersRef,
}: UseActivityFeedStateOptions) {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
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

  const fetchActivities = useCallback(async (useFilters = false) => {
    const requestId = ++activeRequestIdRef.current;
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
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
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("Failed to fetch activities:", error);
    } finally {
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null;
      }
      if (mountedRef.current && requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [canModerateActivity, filtersRef]);

  useEffect(() => {
    void fetchActivities(false);
  }, [fetchActivities]);

  useEffect(() => {
    const refreshVisibleActivity = () => {
      const visibilityState =
        typeof document === "undefined" ? undefined : document.visibilityState;

      if (shouldAutoRefreshVisibleActivity(filtersRef.current, visibilityState)) {
        void fetchActivities(false);
      }
    };

    const interval = window.setInterval(() => {
      refreshVisibleActivity();
    }, 30000);

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refreshVisibleActivity();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      window.clearInterval(interval);
    };
  }, [fetchActivities, filtersRef]);

  const refreshCurrentView = useCallback(() => {
    void fetchActivities(true);
  }, [fetchActivities]);

  return {
    activities,
    bannedUsers,
    loading,
    fetchActivities,
    refreshCurrentView,
  };
}
