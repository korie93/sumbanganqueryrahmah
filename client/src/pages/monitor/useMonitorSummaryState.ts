import { useMemo } from "react";
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
  buildMetricGroups,
  buildRollupFreshnessSummary,
  formatMonitorDurationCompact,
  getModeBadgeClass,
  getRollupFreshnessBadgeClass,
  getRollupFreshnessStatus,
  getScoreStatus,
  type ChaosOption,
} from "@/components/monitor/monitorData";
import type { MonitorHistory, MonitorSnapshot } from "@/hooks/useSystemMetrics";
import type { IntelligenceExplainPayload, WebVitalOverviewPayload } from "@/lib/api";
import type { MonitorInsightsSummaryFact } from "@/components/monitor/monitor-insights-utils";
import type { MonitorChaosSummaryFact } from "@/components/monitor/monitor-chaos-utils";
import type { MonitorMetricsSummaryFact } from "@/components/monitor/monitor-metrics-summary-utils";
import type { MonitorTechnicalSummaryFact } from "@/components/monitor/monitor-technical-summary-utils";
import type { MonitorWebVitalSummaryFact } from "@/components/monitor/monitor-web-vitals-utils";

type UseMonitorSummaryStateOptions = {
  snapshot: MonitorSnapshot;
  history: MonitorHistory;
  intelligence: IntelligenceExplainPayload;
  webVitalsOverview: WebVitalOverviewPayload;
  metricsOpen: boolean;
  canInjectChaos: boolean;
  selectedChaosProfile: ChaosOption;
  chaosDurationMs: string;
  chaosLoading: boolean;
  lastChaosMessage: string | null;
  hasNetworkFailure: boolean;
  isLoading: boolean;
  lastUpdatedLabel: string;
  webVitalsOpen: boolean;
};

export function useMonitorSummaryState({
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
}: UseMonitorSummaryStateOptions) {
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
  const metricsSummaryFacts = useMemo<MonitorMetricsSummaryFact[]>(
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
  const chaosSummaryFacts = useMemo<MonitorChaosSummaryFact[]>(
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
  const technicalSummaryFacts = useMemo<MonitorTechnicalSummaryFact[]>(
    () => buildMonitorTechnicalSummaryFacts(snapshot),
    [snapshot],
  );
  const insightsCompactSummary = useMemo(
    () => buildMonitorInsightsCompactSummary(intelligence),
    [intelligence],
  );
  const insightsSummaryFacts = useMemo<MonitorInsightsSummaryFact[]>(
    () => buildMonitorInsightsSummaryFacts(intelligence),
    [intelligence],
  );
  const webVitalsSummaryFacts = useMemo<MonitorWebVitalSummaryFact[]>(
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

  return {
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
  };
}
