import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import {
  resolveUseSystemMetricsOptions,
  type UseSystemMetricsOptions,
} from "@/hooks/system-metrics-options";
import {
  deriveSystemMetricsAccessDenied,
  deriveSystemMetricsHasNetworkFailure,
  pollSystemMetricsOnce,
  type SystemMetricsPollingState,
} from "@/hooks/system-metrics-poll";
import type {
  EndpointState,
  MonitorHistory,
  MonitorSnapshot,
  UseSystemMetricsResult,
} from "@/hooks/system-metrics-types";
import {
  initialHistory,
  initialIntelligence,
  initialMonitorPagination,
  initialSnapshot,
  initialWebVitalsOverview,
  resolveSystemMetricsPollIntervalMs,
} from "@/hooks/system-metrics-utils";

export type {
  HistoryKey,
  SeriesPoint,
  MonitorHistory,
  MonitorSnapshot,
  UseSystemMetricsResult,
} from "@/hooks/system-metrics-types";
export { resolveSystemMetricsPollIntervalMs } from "@/hooks/system-metrics-utils";
export {
  shouldFetchSystemMetricsDetails,
  shouldPollSystemMetricsDetails,
  combineOpenCircuitCount,
} from "@/hooks/system-metrics-utils";

export function useSystemMetrics(options: UseSystemMetricsOptions = {}): UseSystemMetricsResult {
  const {
    includeHistory,
    includeAlerts,
    alertsPage,
    alertsPageSize,
    includeAlertHistory,
    alertHistoryPage,
    alertHistoryPageSize,
    includeIntelligence,
    includeWebVitalsOverview,
  } = resolveUseSystemMetricsOptions(options);
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>(initialSnapshot);
  const [history, setHistory] = useState<MonitorHistory>(initialHistory);
  const [alerts, setAlerts] = useState<SystemMetricsPollingState["alerts"]>([]);
  const [alertsPagination, setAlertsPagination] = useState<SystemMetricsPollingState["alertsPagination"]>(() => ({
    ...initialMonitorPagination,
    pageSize: alertsPageSize,
  }));
  const [alertHistory, setAlertHistory] = useState<SystemMetricsPollingState["alertHistory"]>([]);
  const [alertHistoryPagination, setAlertHistoryPagination] = useState<SystemMetricsPollingState["alertHistoryPagination"]>(() => ({
    ...initialMonitorPagination,
    pageSize: alertHistoryPageSize,
  }));
  const [intelligence, setIntelligence] = useState(initialIntelligence);
  const [webVitalsOverview, setWebVitalsOverview] = useState(initialWebVitalsOverview);
  const [endpointState, setEndpointState] = useState<EndpointState>({
    health: "ok",
    mode: "ok",
    workers: "ok",
    alerts: "ok",
    alertHistory: "ok",
    webVitals: "ok",
    explain: "ok",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const isLowSpecMode = useMemo(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("low-spec"),
    [],
  );
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const pollControllerRef = useRef<AbortController | null>(null);
  const scheduledPollRef = useRef<number | null>(null);
  const pollCycleRef = useRef(0);
  const visibilityHiddenRef = useRef(
    typeof document !== "undefined" && document.visibilityState === "hidden",
  );
  const scheduleNextPollRef = useRef<(() => void) | null>(null);
  const previousOptionsRef = useRef({
    includeHistory,
    includeAlerts,
    alertsPage,
    alertsPageSize,
    includeAlertHistory,
    alertHistoryPage,
    alertHistoryPageSize,
    includeIntelligence,
    includeWebVitalsOverview,
  });

  const pollingState = useMemo<SystemMetricsPollingState>(
    () => ({
      snapshot,
      history,
      alerts,
      alertsPagination,
      alertHistory,
      alertHistoryPagination,
      intelligence,
      webVitalsOverview,
      endpointState,
    }),
    [
      alertHistory,
      alertHistoryPagination,
      alerts,
      alertsPagination,
      endpointState,
      history,
      intelligence,
      snapshot,
      webVitalsOverview,
    ],
  );
  const pollingStateRef = useLatestRef(pollingState);
  const optionsRef = useLatestRef({
    includeHistory,
    includeAlerts,
    alertsPage,
    alertsPageSize,
    includeAlertHistory,
    alertHistoryPage,
    alertHistoryPageSize,
    includeIntelligence,
    includeWebVitalsOverview,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      inFlightRef.current = false;
      if (scheduledPollRef.current !== null) {
        window.clearTimeout(scheduledPollRef.current);
        scheduledPollRef.current = null;
      }
      scheduleNextPollRef.current = null;
      const activeController = pollControllerRef.current;
      pollControllerRef.current = null;
      activeController?.abort();
    };
  }, []);

  const clearScheduledPoll = useCallback(() => {
    if (scheduledPollRef.current !== null) {
      window.clearTimeout(scheduledPollRef.current);
      scheduledPollRef.current = null;
    }
  }, []);

  const pollMetrics = useCallback(
    async ({ forceDetailed = false }: { forceDetailed?: boolean } = {}) => {
      if (!mountedRef.current) return;
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      const controller = new AbortController();
      pollControllerRef.current = controller;
      const currentState = pollingStateRef.current;
      const currentOptions = optionsRef.current;
      const pollCount = pollCycleRef.current;
      pollCycleRef.current += 1;

      try {
        const result = await pollSystemMetricsOnce(
          currentState,
          {
            hidden: visibilityHiddenRef.current,
            forceDetailed,
            pollCount,
            ...currentOptions,
          },
          controller.signal,
        );

        if (controller.signal.aborted || !mountedRef.current) {
          return;
        }

        const { nextState } = result;
        setSnapshot(nextState.snapshot);
        setHistory(nextState.history);
        setAlerts(nextState.alerts);
        setAlertsPagination(nextState.alertsPagination);
        setAlertHistory(nextState.alertHistory);
        setAlertHistoryPagination(nextState.alertHistoryPagination);
        setIntelligence(nextState.intelligence);
        setWebVitalsOverview(nextState.webVitalsOverview);
        setEndpointState(nextState.endpointState);

        if (result.lastUpdated !== null) {
          setLastUpdated((previous) =>
            previous === result.lastUpdated ? previous : result.lastUpdated,
          );
        }
      } finally {
        if (pollControllerRef.current === controller) {
          pollControllerRef.current = null;
        }
        inFlightRef.current = false;
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [optionsRef, pollingStateRef],
  );

  useEffect(() => {
    const scheduleNextPoll = () => {
      clearScheduledPoll();
      if (!mountedRef.current) {
        return;
      }

      const delay = resolveSystemMetricsPollIntervalMs({
        hidden: visibilityHiddenRef.current,
        lowSpec: isLowSpecMode,
      });

      scheduledPollRef.current = window.setTimeout(() => {
        void pollMetrics();
      }, delay);
    };

    scheduleNextPollRef.current = scheduleNextPoll;

    const runPoll = async (forceDetailed = false) => {
      await pollMetrics({ forceDetailed });
      if (!mountedRef.current) {
        return;
      }

      scheduleNextPoll();
    };

    const handleVisibilityChange = () => {
      visibilityHiddenRef.current = document.visibilityState === "hidden";
      clearScheduledPoll();

      if (visibilityHiddenRef.current) {
        scheduleNextPoll();
        return;
      }

      void runPoll(true);
    };

    void runPoll(true);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      scheduleNextPollRef.current = null;
      clearScheduledPoll();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [clearScheduledPoll, isLowSpecMode, pollMetrics]);

  const refreshNow = useCallback(async () => {
    clearScheduledPoll();
    await pollMetrics({ forceDetailed: true });
    scheduleNextPollRef.current?.();
  }, [clearScheduledPoll, pollMetrics]);

  useEffect(() => {
    const previous = previousOptionsRef.current;
    const shouldRefresh =
      (includeHistory && !previous.includeHistory) ||
      (includeAlerts &&
        (!previous.includeAlerts ||
          previous.alertsPage !== alertsPage ||
          previous.alertsPageSize !== alertsPageSize)) ||
      (includeAlertHistory &&
        (!previous.includeAlertHistory ||
          previous.alertHistoryPage !== alertHistoryPage ||
          previous.alertHistoryPageSize !== alertHistoryPageSize)) ||
      (includeIntelligence && !previous.includeIntelligence) ||
      (includeWebVitalsOverview && !previous.includeWebVitalsOverview);

    previousOptionsRef.current = {
      includeHistory,
      includeAlerts,
      alertsPage,
      alertsPageSize,
      includeAlertHistory,
      alertHistoryPage,
      alertHistoryPageSize,
      includeIntelligence,
      includeWebVitalsOverview,
    };

    if (shouldRefresh) {
      void refreshNow();
    }
  }, [
    alertHistoryPage,
    alertHistoryPageSize,
    alertsPage,
    alertsPageSize,
    includeAlertHistory,
    includeAlerts,
    includeHistory,
    includeIntelligence,
    includeWebVitalsOverview,
    refreshNow,
  ]);

  const accessDenied = useMemo(
    () => deriveSystemMetricsAccessDenied(endpointState),
    [endpointState],
  );
  const hasNetworkFailure = useMemo(
    () => deriveSystemMetricsHasNetworkFailure(endpointState),
    [endpointState],
  );

  return {
    isLoading,
    lastUpdated,
    snapshot,
    history,
    alerts,
    alertsPagination,
    alertHistory,
    alertHistoryPagination,
    intelligence,
    webVitalsOverview,
    endpointState,
    accessDenied,
    hasNetworkFailure,
    refreshNow,
  };
}
