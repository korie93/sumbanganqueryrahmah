import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildMonitorChaosCompactSummary,
  buildMonitorChaosSummaryFacts,
} from "@/components/monitor/monitor-chaos-utils";
import {
  buildMonitorInsightsCompactSummary,
  buildMonitorInsightsSummaryFacts,
} from "@/components/monitor/monitor-insights-utils";
import {
  buildMonitorMetricsCompactSummary,
  buildMonitorMetricsSummaryFacts,
} from "@/components/monitor/monitor-metrics-summary-utils";
import {
  buildMonitorShellDescription,
  buildMonitorShellFacts,
} from "@/components/monitor/monitor-shell-utils";
import {
  buildMonitorTechnicalCompactSummary,
  buildMonitorTechnicalSummaryFacts,
} from "@/components/monitor/monitor-technical-summary-utils";
import {
  buildMonitorWebVitalCompactSummary,
  buildMonitorWebVitalSummaryFacts,
} from "@/components/monitor/monitor-web-vitals-utils";
import {
  CHAOS_OPTIONS,
  buildMetricGroups,
  buildRollupFreshnessSummary,
  formatMonitorDurationCompact,
  getModeBadgeClass,
  getRollupFreshnessBadgeClass,
  getRollupFreshnessStatus,
  getScoreStatus,
} from "@/components/monitor/monitorData";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useToast } from "@/hooks/use-toast";
import {
  autoHealRollupQueue,
  deleteOldAlertHistory,
  drainRollupQueue,
  type ChaosType,
  injectChaos,
  rebuildCollectionRollups,
  retryRollupFailures,
} from "@/lib/api";
import { getStoredRole } from "@/lib/auth-session";

export const ALERT_HISTORY_PAGE_SIZE = 5;
export const ACTIVE_ALERTS_PAGE_SIZE = 5;

export function useMonitorPageState() {
  const isMobile = useIsMobile();
  const initialCompactViewport = typeof window !== "undefined" && window.innerWidth < 768;
  const [metricsOpen, setMetricsOpen] = useState(() => !initialCompactViewport);
  const [alertsOpen, setAlertsOpen] = useState(() => !initialCompactViewport);
  const [alertHistoryOpen, setAlertHistoryOpen] = useState(false);
  const [alertsPage, setAlertsPage] = useState(1);
  const [alertHistoryPage, setAlertHistoryPage] = useState(1);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [chaosType, setChaosType] = useState<ChaosType>("cpu_spike");
  const [chaosMagnitude, setChaosMagnitude] = useState(String(CHAOS_OPTIONS[0].defaultMagnitude));
  const [chaosDurationMs, setChaosDurationMs] = useState(String(CHAOS_OPTIONS[0].defaultDurationMs));
  const [chaosLoading, setChaosLoading] = useState(false);
  const [lastChaosMessage, setLastChaosMessage] = useState<string | null>(null);
  const [webVitalsOpen, setWebVitalsOpen] = useState(false);
  const [chaosSectionOpen, setChaosSectionOpen] = useState(false);
  const [technicalChartsOpen, setTechnicalChartsOpen] = useState(false);
  const [deleteAlertHistoryBusy, setDeleteAlertHistoryBusy] = useState(false);
  const [queueActionBusy, setQueueActionBusy] = useState<"drain" | "retry-failures" | "auto-heal" | "rebuild" | null>(null);
  const [lastQueueActionMessage, setLastQueueActionMessage] = useState<string | null>(null);
  const chaosRequestRef = useRef<AbortController | null>(null);
  const chaosInFlightRef = useRef(false);
  const deleteAlertHistoryRequestRef = useRef<AbortController | null>(null);
  const deleteAlertHistoryInFlightRef = useRef(false);
  const queueActionRequestRef = useRef<AbortController | null>(null);
  const queueActionInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const { toast } = useToast();
  const includeMonitorHistory = metricsOpen || technicalChartsOpen;
  const {
    isLoading,
    snapshot,
    history,
    alerts,
    alertsPagination,
    alertHistory,
    alertHistoryPagination,
    intelligence,
    webVitalsOverview,
    accessDenied,
    hasNetworkFailure,
    lastUpdated,
    refreshNow,
  } = useSystemMetrics({
    includeHistory: includeMonitorHistory,
    includeAlerts: alertsOpen,
    alertsPage,
    alertsPageSize: ACTIVE_ALERTS_PAGE_SIZE,
    includeAlertHistory: alertsOpen && alertHistoryOpen,
    alertHistoryPage,
    alertHistoryPageSize: ALERT_HISTORY_PAGE_SIZE,
    includeIntelligence: insightsOpen,
    includeWebVitalsOverview: webVitalsOpen,
  });

  const userRole = useMemo(() => getStoredRole(), []);
  const canInjectChaos = userRole === "admin" || userRole === "superuser";
  const canDeleteAlertHistory = userRole === "superuser";
  const canManageRollups = userRole === "superuser";
  const deferSecondaryMobileSections = initialCompactViewport;
  const lastUpdatedLabel = useMemo(
    () => (lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "-"),
    [lastUpdated],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      chaosRequestRef.current?.abort();
      chaosRequestRef.current = null;
      chaosInFlightRef.current = false;
      deleteAlertHistoryRequestRef.current?.abort();
      deleteAlertHistoryRequestRef.current = null;
      deleteAlertHistoryInFlightRef.current = false;
      queueActionRequestRef.current?.abort();
      queueActionRequestRef.current = null;
      queueActionInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!accessDenied) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/403") return;
    window.location.assign("/403");
  }, [accessDenied]);

  const selectedChaosProfile = useMemo(
    () => CHAOS_OPTIONS.find((option) => option.type === chaosType) || CHAOS_OPTIONS[0],
    [chaosType],
  );
  const scoreStatus = useMemo(() => getScoreStatus(snapshot.score), [snapshot.score]);
  const modeBadgeClass = useMemo(() => getModeBadgeClass(snapshot.mode), [snapshot.mode]);
  const rollupFreshnessStatus = useMemo(() => getRollupFreshnessStatus(snapshot), [snapshot]);
  const rollupFreshnessBadgeClass = useMemo(
    () => getRollupFreshnessBadgeClass(rollupFreshnessStatus),
    [rollupFreshnessStatus],
  );
  const rollupFreshnessSummary = useMemo(() => buildRollupFreshnessSummary(snapshot), [snapshot]);
  const rollupFreshnessAgeLabel = useMemo(
    () => formatMonitorDurationCompact(snapshot.rollupRefreshOldestPendingAgeMs),
    [snapshot.rollupRefreshOldestPendingAgeMs],
  );
  const webVitalsCompactSummary = useMemo(
    () => buildMonitorWebVitalCompactSummary(webVitalsOverview),
    [webVitalsOverview],
  );
  const metricsCompactSummary = useMemo(
    () => buildMonitorMetricsCompactSummary(snapshot),
    [snapshot],
  );
  const metricsSummaryFacts = useMemo(
    () => buildMonitorMetricsSummaryFacts(snapshot),
    [snapshot],
  );
  const chaosCompactSummary = useMemo(
    () =>
      buildMonitorChaosCompactSummary({
        canInjectChaos,
        selectedChaosProfile,
        chaosDurationMs,
        chaosLoading,
        lastChaosMessage,
      }),
    [canInjectChaos, chaosDurationMs, chaosLoading, lastChaosMessage, selectedChaosProfile],
  );
  const chaosSummaryFacts = useMemo(
    () =>
      buildMonitorChaosSummaryFacts({
        canInjectChaos,
        selectedChaosProfile,
        chaosDurationMs,
        chaosLoading,
      }),
    [canInjectChaos, chaosDurationMs, chaosLoading, selectedChaosProfile],
  );
  const technicalCompactSummary = useMemo(
    () => buildMonitorTechnicalCompactSummary(snapshot),
    [snapshot],
  );
  const technicalSummaryFacts = useMemo(
    () => buildMonitorTechnicalSummaryFacts(snapshot),
    [snapshot],
  );
  const insightsCompactSummary = useMemo(
    () => buildMonitorInsightsCompactSummary(intelligence),
    [intelligence],
  );
  const insightsSummaryFacts = useMemo(
    () => buildMonitorInsightsSummaryFacts(intelligence),
    [intelligence],
  );
  const webVitalsSummaryFacts = useMemo(
    () => buildMonitorWebVitalSummaryFacts(webVitalsOverview),
    [webVitalsOverview],
  );
  const webVitalsSummaryLabel = useMemo(() => {
    const suffix = webVitalsOpen
      ? ""
      : " Open Information only when you need deeper browser experience detail.";

    if (!webVitalsOpen) {
      return `${webVitalsCompactSummary.description}${suffix}`;
    }

    return webVitalsCompactSummary.description;
  }, [webVitalsCompactSummary.description, webVitalsOpen]);
  const headerDescription = useMemo(
    () =>
      buildMonitorShellDescription({
        hasNetworkFailure,
        isLoading,
        updatedLabel: lastUpdatedLabel,
      }),
    [hasNetworkFailure, isLoading, lastUpdatedLabel],
  );
  const headerFacts = useMemo(
    () =>
      buildMonitorShellFacts({
        snapshot,
        rollupFreshnessStatus,
        updatedLabel: lastUpdatedLabel,
      }),
    [lastUpdatedLabel, rollupFreshnessStatus, snapshot],
  );
  const metricGroups = useMemo(
    () => (metricsOpen ? buildMetricGroups(snapshot, history) : []),
    [history, metricsOpen, snapshot],
  );

  useEffect(() => {
    if (alertsPage > alertsPagination.totalPages) {
      setAlertsPage(alertsPagination.totalPages);
    }
  }, [alertsPage, alertsPagination.totalPages]);

  useEffect(() => {
    if (alertHistoryPage > alertHistoryPagination.totalPages) {
      setAlertHistoryPage(alertHistoryPagination.totalPages);
    }
  }, [alertHistoryPage, alertHistoryPagination.totalPages]);

  useEffect(() => {
    if (alertsOpen) {
      return;
    }

    setAlertHistoryOpen(false);
  }, [alertsOpen]);

  const handleChaosTypeChange = useCallback((nextType: ChaosType) => {
    setChaosType(nextType);
    const profile = CHAOS_OPTIONS.find((option) => option.type === nextType);
    if (!profile) return;
    setChaosMagnitude(String(profile.defaultMagnitude));
    setChaosDurationMs(String(profile.defaultDurationMs));
  }, []);

  const handleWebVitalsToggle = useCallback(() => {
    startTransition(() => {
      setWebVitalsOpen((previous) => !previous);
    });
  }, []);

  const handleDeleteOldAlertHistory = useCallback(async (olderThanDays: number) => {
    if (!canDeleteAlertHistory || deleteAlertHistoryInFlightRef.current) {
      return;
    }

    if (!Number.isFinite(olderThanDays) || olderThanDays < 1) {
      toast({
        variant: "destructive",
        title: "Invalid retention window",
        description: "Choose a valid age in days before deleting old alert history.",
      });
      return;
    }

    deleteAlertHistoryRequestRef.current?.abort();
    const controller = new AbortController();
    deleteAlertHistoryRequestRef.current = controller;
    deleteAlertHistoryInFlightRef.current = true;
    setDeleteAlertHistoryBusy(true);

    try {
      const result = await deleteOldAlertHistory(olderThanDays, { signal: controller.signal });

      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

      if (result.state === "ok" && result.data?.ok) {
        setAlertsPage(1);
        setAlertHistoryPage(1);
        toast({
          title: "Old alert history deleted",
          description: `Removed ${result.data.deletedCount} resolved incidents older than ${result.data.olderThanDays} days.`,
        });
        await refreshNow();
        return;
      }

      if (result.state === "forbidden" || result.state === "unauthorized") {
        toast({
          variant: "destructive",
          title: "Permission denied",
          description: "Only superuser can delete old monitor alert history.",
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Cleanup failed",
        description: result.message || "Failed to delete old alert history.",
      });
    } finally {
      if (deleteAlertHistoryRequestRef.current === controller) {
        deleteAlertHistoryRequestRef.current = null;
      }
      deleteAlertHistoryInFlightRef.current = false;
      if (mountedRef.current) {
        setDeleteAlertHistoryBusy(false);
      }
    }
  }, [canDeleteAlertHistory, refreshNow, toast]);

  const submitChaos = useCallback(async () => {
    if (!canInjectChaos || chaosInFlightRef.current) return;

    const magnitude = chaosMagnitude.trim() === "" ? undefined : Number(chaosMagnitude);
    const durationMs = chaosDurationMs.trim() === "" ? undefined : Number(chaosDurationMs);

    if (magnitude !== undefined && !Number.isFinite(magnitude)) {
      toast({
        variant: "destructive",
        title: "Invalid magnitude",
        description: "Magnitude must be a valid number.",
      });
      return;
    }

    if (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs <= 0)) {
      toast({
        variant: "destructive",
        title: "Invalid duration",
        description: "Duration must be a positive number in milliseconds.",
      });
      return;
    }

    chaosRequestRef.current?.abort();
    const controller = new AbortController();
    chaosRequestRef.current = controller;
    chaosInFlightRef.current = true;
    setChaosLoading(true);
    try {
      const result = await injectChaos({
        type: chaosType,
        magnitude,
        durationMs,
      }, { signal: controller.signal });

      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

      if (result.state === "ok" && result.data?.success) {
        const message = `Injected ${chaosType}. Active chaos events: ${result.data.active.length}.`;
        setLastChaosMessage(message);
        toast({
          title: "Chaos injected",
          description: message,
        });
        return;
      }

      if (result.state === "forbidden" || result.state === "unauthorized") {
        toast({
          variant: "destructive",
          title: "Permission denied",
          description: "Only admin and superuser can inject chaos scenarios.",
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Chaos injection failed",
        description: result.message || "Request failed.",
      });
    } finally {
      if (chaosRequestRef.current === controller) {
        chaosRequestRef.current = null;
      }
      chaosInFlightRef.current = false;
      if (mountedRef.current) {
        setChaosLoading(false);
      }
    }
  }, [canInjectChaos, chaosDurationMs, chaosMagnitude, chaosType, toast]);

  const runRollupAction = useCallback(async (
    action: "drain" | "retry-failures" | "auto-heal" | "rebuild",
  ) => {
    if (!canManageRollups || queueActionInFlightRef.current) return;

    queueActionRequestRef.current?.abort();
    const controller = new AbortController();
    queueActionRequestRef.current = controller;
    queueActionInFlightRef.current = true;
    setQueueActionBusy(action);

    try {
      const result = action === "drain"
        ? await drainRollupQueue({ signal: controller.signal })
        : action === "retry-failures"
          ? await retryRollupFailures({ signal: controller.signal })
          : action === "auto-heal"
            ? await autoHealRollupQueue({ signal: controller.signal })
            : await rebuildCollectionRollups({ signal: controller.signal });

      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

      if (result.state === "ok" && result.data?.ok) {
        const message = result.data.message || "Rollup queue action completed.";
        setLastQueueActionMessage(message);
        toast({
          title: "Rollup queue updated",
          description: message,
        });
        await refreshNow();
        return;
      }

      if (result.state === "forbidden" || result.state === "unauthorized") {
        toast({
          variant: "destructive",
          title: "Permission denied",
          description: "Only superuser can control collection rollup recovery actions.",
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Rollup action failed",
        description: result.message || "Request failed.",
      });
    } finally {
      if (queueActionRequestRef.current === controller) {
        queueActionRequestRef.current = null;
      }
      queueActionInFlightRef.current = false;
      if (mountedRef.current) {
        setQueueActionBusy(null);
      }
    }
  }, [canManageRollups, refreshNow, toast]);

  return {
    isMobile,
    isLoading,
    snapshot,
    history,
    alerts,
    alertsPagination,
    alertHistory,
    alertHistoryPagination,
    intelligence,
    webVitalsOverview,
    accessDenied,
    hasNetworkFailure,
    lastUpdated,
    refreshNow,
    metricsOpen,
    setMetricsOpen,
    alertsOpen,
    setAlertsOpen,
    alertHistoryOpen,
    setAlertHistoryOpen,
    alertsPage,
    setAlertsPage,
    alertHistoryPage,
    setAlertHistoryPage,
    insightsOpen,
    setInsightsOpen,
    chaosType,
    chaosMagnitude,
    setChaosMagnitude,
    chaosDurationMs,
    setChaosDurationMs,
    chaosLoading,
    lastChaosMessage,
    webVitalsOpen,
    handleWebVitalsToggle,
    chaosSectionOpen,
    setChaosSectionOpen,
    technicalChartsOpen,
    setTechnicalChartsOpen,
    deleteAlertHistoryBusy,
    queueActionBusy,
    lastQueueActionMessage,
    canInjectChaos,
    canDeleteAlertHistory,
    canManageRollups,
    deferSecondaryMobileSections,
    lastUpdatedLabel,
    selectedChaosProfile,
    scoreStatus,
    modeBadgeClass,
    rollupFreshnessStatus,
    rollupFreshnessBadgeClass,
    rollupFreshnessSummary,
    rollupFreshnessAgeLabel,
    webVitalsCompactSummary,
    metricsCompactSummary,
    metricsSummaryFacts,
    chaosCompactSummary,
    chaosSummaryFacts,
    technicalCompactSummary,
    technicalSummaryFacts,
    insightsCompactSummary,
    insightsSummaryFacts,
    webVitalsSummaryFacts,
    webVitalsSummaryLabel,
    headerDescription,
    headerFacts,
    metricGroups,
    handleChaosTypeChange,
    handleDeleteOldAlertHistory,
    submitChaos,
    runRollupAction,
  };
}
