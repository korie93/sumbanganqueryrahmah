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
      const nextErrorMessage = readActivityFeedErrorMessage(error);
      if (!nextErrorMessage) {
        return;
      }
      setErrorMessage(nextErrorMessage);
      logClientError("Failed to fetch activities:", error);
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
      void fetchActivities(true);
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
  }, [fetchActivities, filtersRef]);

  const refreshCurrentView = useCallback(() => {
    void fetchActivities(true);
  }, [fetchActivities]);

  return {
    activities,
    bannedUsers,
    errorMessage,
    loading,
    fetchActivities,
    refreshCurrentView,
  };
}
