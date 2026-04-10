import { useEffect, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { getStoredRole } from "@/lib/auth-session";
import {
  resolveMonitorRoleCapabilities,
  type MonitorQueueAction,
} from "@/pages/monitor/monitor-page-state-utils";
import { useMonitorActionState } from "@/pages/monitor/useMonitorActionState";
import { useMonitorSectionState } from "@/pages/monitor/useMonitorSectionState";
import { useMonitorSummaryState } from "@/pages/monitor/useMonitorSummaryState";

export const ALERT_HISTORY_PAGE_SIZE = 5;
export const ACTIVE_ALERTS_PAGE_SIZE = 5;

export function useMonitorPageState() {
  const isMobile = useIsMobile();
  const {
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
    webVitalsOpen,
    chaosSectionOpen,
    setChaosSectionOpen,
    technicalChartsOpen,
    setTechnicalChartsOpen,
    selectedChaosProfile,
    includeMonitorHistory,
    deferSecondaryMobileSections,
    handleChaosTypeChange,
    handleWebVitalsToggle,
  } = useMonitorSectionState();
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
  const {
    canInjectChaos,
    canDeleteAlertHistory,
    canManageRollups,
  } = useMemo(() => resolveMonitorRoleCapabilities(userRole), [userRole]);
  const lastUpdatedLabel = useMemo(
    () => (lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "-"),
    [lastUpdated],
  );

  useEffect(() => {
    if (!accessDenied) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    if (window.location.pathname === "/403") {
      return;
    }
    window.location.assign("/403");
  }, [accessDenied]);

  useEffect(() => {
    if (alertsPage > alertsPagination.totalPages) {
      setAlertsPage(alertsPagination.totalPages);
    }
  }, [alertsPage, alertsPagination.totalPages, setAlertsPage]);

  useEffect(() => {
    if (alertHistoryPage > alertHistoryPagination.totalPages) {
      setAlertHistoryPage(alertHistoryPagination.totalPages);
    }
  }, [alertHistoryPage, alertHistoryPagination.totalPages, setAlertHistoryPage]);

  useEffect(() => {
    if (alertsOpen) {
      return;
    }

    setAlertHistoryOpen(false);
  }, [alertsOpen, setAlertHistoryOpen]);

  const {
    chaosLoading,
    lastChaosMessage,
    deleteAlertHistoryBusy,
    queueActionBusy,
    lastQueueActionMessage,
    handleDeleteOldAlertHistory,
    submitChaos,
    runRollupAction,
  } = useMonitorActionState({
    canInjectChaos,
    canDeleteAlertHistory,
    canManageRollups,
    chaosType,
    chaosMagnitude,
    chaosDurationMs,
    refreshNow,
    onResetAlertPages: () => {
      setAlertsPage(1);
      setAlertHistoryPage(1);
    },
  });

  const {
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
  } = useMonitorSummaryState({
    snapshot,
    history,
    intelligence,
    webVitalsOverview,
    metricsOpen,
    canInjectChaos,
    selectedChaosProfile,
    chaosDurationMs,
    chaosLoading,
    lastChaosMessage,
    hasNetworkFailure,
    isLoading,
    lastUpdatedLabel,
    webVitalsOpen,
  });

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
    queueActionBusy: queueActionBusy as MonitorQueueAction | null,
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

export type MonitorPageState = ReturnType<typeof useMonitorPageState>;
