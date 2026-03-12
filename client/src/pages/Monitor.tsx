import { useCallback, useEffect, useMemo, useState } from "react";
import { MonitorAccessDenied } from "@/components/monitor/MonitorAccessDenied";
import { MonitorAlertsSection } from "@/components/monitor/MonitorAlertsSection";
import { MonitorChaosSection } from "@/components/monitor/MonitorChaosSection";
import { MonitorInsightsSection } from "@/components/monitor/MonitorInsightsSection";
import { MonitorMetricsSection } from "@/components/monitor/MonitorMetricsSection";
import { MonitorOverviewSection } from "@/components/monitor/MonitorOverviewSection";
import { MonitorStatusBanners } from "@/components/monitor/MonitorStatusBanners";
import { MonitorTechnicalChartsSection } from "@/components/monitor/MonitorTechnicalChartsSection";
import {
  CHAOS_OPTIONS,
  buildAnomalyRows,
  buildChartSeries,
  buildCorrelationRows,
  buildForecastSeries,
  buildMetricGroups,
  buildSlopeRows,
  getGovernanceClass,
  getModeBadgeClass,
  getScoreStatus,
  normalizeBoostedKey,
} from "@/components/monitor/monitorData";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useToast } from "@/hooks/use-toast";
import { type ChaosType, injectChaos } from "@/lib/api";

export default function Monitor() {
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [chaosType, setChaosType] = useState<ChaosType>("cpu_spike");
  const [chaosMagnitude, setChaosMagnitude] = useState(String(CHAOS_OPTIONS[0].defaultMagnitude));
  const [chaosDurationMs, setChaosDurationMs] = useState(String(CHAOS_OPTIONS[0].defaultDurationMs));
  const [chaosLoading, setChaosLoading] = useState(false);
  const [lastChaosMessage, setLastChaosMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const {
    isLoading,
    snapshot,
    history,
    alerts,
    intelligence,
    accessDenied,
    hasNetworkFailure,
    lastUpdated,
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
    if (!canInjectChaos) return;

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

    setChaosLoading(true);
    try {
      const result = await injectChaos({
        type: chaosType,
        magnitude,
        durationMs,
      });

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
      setChaosLoading(false);
    }
  }, [canInjectChaos, chaosDurationMs, chaosMagnitude, chaosType, toast]);

  if (accessDenied) {
    return <MonitorAccessDenied />;
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <MonitorStatusBanners mode={snapshot.mode} hasNetworkFailure={hasNetworkFailure} />
        <MonitorOverviewSection
          snapshot={snapshot}
          scoreStatus={scoreStatus}
          modeBadgeClass={modeBadgeClass}
        />
        <MonitorMetricsSection metricGroups={metricGroups} />
        <MonitorAlertsSection
          alertsOpen={alertsOpen}
          onAlertsOpenChange={setAlertsOpen}
          alerts={alerts}
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
        <MonitorTechnicalChartsSection chartSeries={chartSeries} />

        <p className="text-right text-xs text-muted-foreground">
          {isLoading ? "Loading..." : `Last updated: ${lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "-"}`}
        </p>
      </div>
    </div>
  );
}
