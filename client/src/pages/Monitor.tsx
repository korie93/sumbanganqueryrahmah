import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MonitorAccessDenied } from "@/components/monitor/MonitorAccessDenied";
import { MonitorAlertsSection } from "@/components/monitor/MonitorAlertsSection";
import { MonitorChaosSection } from "@/components/monitor/MonitorChaosSection";
import { MonitorInsightsSection } from "@/components/monitor/MonitorInsightsSection";
import { MonitorMetricsSection } from "@/components/monitor/MonitorMetricsSection";
import { MonitorOverviewSection } from "@/components/monitor/MonitorOverviewSection";
import { MonitorRollupQueueControlsSection } from "@/components/monitor/MonitorRollupQueueControlsSection";
import { MonitorStatusBanners } from "@/components/monitor/MonitorStatusBanners";
import {
  CHAOS_OPTIONS,
  buildAnomalyRows,
  buildChartSeries,
  buildCorrelationRows,
  buildForecastSeries,
  buildMetricGroups,
  buildRollupFreshnessSummary,
  formatMonitorDurationCompact,
  buildSlopeRows,
  getGovernanceClass,
  getModeBadgeClass,
  getRollupFreshnessBadgeClass,
  getRollupFreshnessStatus,
  getScoreStatus,
  normalizeBoostedKey,
} from "@/components/monitor/monitorData";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useToast } from "@/hooks/use-toast";
import {
  autoHealRollupQueue,
  drainRollupQueue,
  type ChaosType,
  injectChaos,
  rebuildCollectionRollups,
  retryRollupFailures,
} from "@/lib/api";

const MonitorTechnicalChartsSection = lazy(() =>
  import("@/components/monitor/MonitorTechnicalChartsSection").then((module) => ({
    default: module.MonitorTechnicalChartsSection,
  })),
);

function MonitorChartsFallback() {
  return (
    <section
      className="rounded-2xl border border-border/60 bg-slate-200/40 p-4 dark:bg-slate-900/60"
      role="status"
      aria-live="polite"
      aria-label="Loading technical charts"
    >
      <div className="mb-3 h-6 w-48 animate-pulse rounded bg-slate-300/70 dark:bg-slate-700/70" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-64 animate-pulse rounded-xl bg-slate-300/60 dark:bg-slate-800/70"
          />
        ))}
      </div>
    </section>
  );
}

export default function Monitor() {
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [chaosType, setChaosType] = useState<ChaosType>("cpu_spike");
  const [chaosMagnitude, setChaosMagnitude] = useState(String(CHAOS_OPTIONS[0].defaultMagnitude));
  const [chaosDurationMs, setChaosDurationMs] = useState(String(CHAOS_OPTIONS[0].defaultDurationMs));
  const [chaosLoading, setChaosLoading] = useState(false);
  const [lastChaosMessage, setLastChaosMessage] = useState<string | null>(null);
  const [queueActionBusy, setQueueActionBusy] = useState<"drain" | "retry-failures" | "auto-heal" | "rebuild" | null>(null);
  const [lastQueueActionMessage, setLastQueueActionMessage] = useState<string | null>(null);
  const chaosRequestRef = useRef<AbortController | null>(null);
  const chaosInFlightRef = useRef(false);
  const queueActionRequestRef = useRef<AbortController | null>(null);
  const queueActionInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const { toast } = useToast();
  const {
    isLoading,
    snapshot,
    history,
    alerts,
    alertHistory,
    intelligence,
    accessDenied,
    hasNetworkFailure,
    lastUpdated,
    refreshNow,
  } = useSystemMetrics();

  const userRole = useMemo(() => {
    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const parsedUser = JSON.parse(rawUser) as { role?: string };
        if (parsedUser.role) return parsedUser.role;
      }
      return localStorage.getItem("role") || "";
    } catch {
      return localStorage.getItem("role") || "";
    }
  }, []);

  const canInjectChaos = userRole === "admin" || userRole === "superuser";
  const canManageRollups = userRole === "superuser";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      chaosRequestRef.current?.abort();
      chaosRequestRef.current = null;
      chaosInFlightRef.current = false;
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
  const governanceClass = useMemo(
    () => getGovernanceClass(intelligence.governanceState),
    [intelligence.governanceState],
  );
  const metricGroups = useMemo(() => buildMetricGroups(snapshot, history), [history, snapshot]);
  const chartSeries = useMemo(() => buildChartSeries(history), [history]);
  const forecastSeries = useMemo(
    () => buildForecastSeries(intelligence.forecastProjection, lastUpdated),
    [intelligence.forecastProjection, lastUpdated],
  );
  const anomalyRows = useMemo(() => buildAnomalyRows(intelligence), [intelligence]);
  const correlationRows = useMemo(() => buildCorrelationRows(intelligence), [intelligence]);
  const slopeRows = useMemo(() => buildSlopeRows(intelligence), [intelligence]);
  const boostedPairLookup = useMemo(
    () => new Set(intelligence.correlationMatrix.boostedPairs.map(normalizeBoostedKey)),
    [intelligence.correlationMatrix.boostedPairs],
  );

  const handleChaosTypeChange = useCallback((nextType: ChaosType) => {
    setChaosType(nextType);
    const profile = CHAOS_OPTIONS.find((option) => option.type === nextType);
    if (!profile) return;
    setChaosMagnitude(String(profile.defaultMagnitude));
    setChaosDurationMs(String(profile.defaultDurationMs));
  }, []);

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

  if (accessDenied) {
    return <MonitorAccessDenied />;
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <MonitorStatusBanners
          mode={snapshot.mode}
          hasNetworkFailure={hasNetworkFailure}
          rollupFreshnessStatus={rollupFreshnessStatus}
          rollupFreshnessSummary={rollupFreshnessSummary}
        />
        <MonitorOverviewSection
          snapshot={snapshot}
          scoreStatus={scoreStatus}
          modeBadgeClass={modeBadgeClass}
          rollupFreshnessStatus={rollupFreshnessStatus}
          rollupFreshnessBadgeClass={rollupFreshnessBadgeClass}
          rollupFreshnessSummary={rollupFreshnessSummary}
          rollupFreshnessAgeLabel={rollupFreshnessAgeLabel}
        />
        <MonitorMetricsSection metricGroups={metricGroups} />
        <MonitorRollupQueueControlsSection
          canManageRollups={canManageRollups}
          snapshot={snapshot}
          busyAction={queueActionBusy}
          lastMessage={lastQueueActionMessage}
          onDrain={() => void runRollupAction("drain")}
          onRetryFailures={() => void runRollupAction("retry-failures")}
          onAutoHeal={() => void runRollupAction("auto-heal")}
          onRebuild={() => void runRollupAction("rebuild")}
        />
        <MonitorAlertsSection
          alertsOpen={alertsOpen}
          onAlertsOpenChange={setAlertsOpen}
          alerts={alerts}
          alertHistory={alertHistory}
        />
        <MonitorInsightsSection
          intelligence={intelligence}
          governanceClass={governanceClass}
          anomalyRows={anomalyRows}
          correlationRows={correlationRows}
          slopeRows={slopeRows}
          boostedPairLookup={boostedPairLookup}
          forecastSeries={forecastSeries}
        />
        <MonitorChaosSection
          canInjectChaos={canInjectChaos}
          chaosType={chaosType}
          selectedChaosProfile={selectedChaosProfile}
          chaosMagnitude={chaosMagnitude}
          chaosDurationMs={chaosDurationMs}
          chaosLoading={chaosLoading}
          lastChaosMessage={lastChaosMessage}
          onChaosTypeChange={handleChaosTypeChange}
          onChaosMagnitudeChange={setChaosMagnitude}
          onChaosDurationChange={setChaosDurationMs}
          onSubmit={submitChaos}
        />
        <Suspense fallback={<MonitorChartsFallback />}>
          <MonitorTechnicalChartsSection chartSeries={chartSeries} />
        </Suspense>

        <p className="text-right text-xs text-muted-foreground">
          {isLoading ? "Loading..." : `Last updated: ${lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "-"}`}
        </p>
      </div>
    </div>
  );
}
