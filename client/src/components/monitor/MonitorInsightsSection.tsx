import { memo, useMemo, useState } from "react";
import { BrainCircuit, ChevronDown, ChevronUp } from "lucide-react";
import { InfoHint } from "@/components/monitor/InfoHint";
import { MonitorInsightsMetrics } from "@/components/monitor/MonitorInsightsMetrics";
import { MonitorInsightsPanels } from "@/components/monitor/MonitorInsightsPanels";
import {
  buildMonitorInsightsDecisionSummaryBadges,
  buildMonitorInsightsExplainabilityBadges,
  buildMonitorInsightsForecastBadges,
  resolveInitialMonitorInsightsOpenState,
} from "@/components/monitor/monitor-insights-utils";
import { TimeSeriesChart } from "@/components/monitor/TimeSeriesChart";
import {
  buildAnomalyRows,
  buildCorrelationRows,
  buildForecastSeries,
  buildSlopeRows,
  getGovernanceClass,
  normalizeBoostedKey,
} from "@/components/monitor/monitorData";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { IntelligenceExplainPayload } from "@/lib/api";

type MonitorInsightsSectionProps = {
  intelligence: IntelligenceExplainPayload;
  lastUpdated: number | null;
  embedded?: boolean;
};

function MonitorInsightsSubsectionToggle({
  title,
  description,
  badges,
  open,
  onToggle,
}: {
  title: string;
  description: string;
  badges: Array<{ label: string; value: string }>;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="border-border/60 bg-background/35 backdrop-blur-sm">
      <CardContent className="p-4">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 text-left"
          onClick={onToggle}
          aria-expanded={open}
        >
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <Badge
                  key={`${title}-${badge.label}`}
                  variant="outline"
                  className="rounded-full px-3 py-1 text-[11px]"
                >
                  {badge.label} {badge.value}
                </Badge>
              ))}
            </div>
          </div>
          <span className="shrink-0 pt-1 text-muted-foreground">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
      </CardContent>
    </Card>
  );
}

function MonitorInsightsSectionImpl({
  intelligence,
  lastUpdated,
  embedded = false,
}: MonitorInsightsSectionProps) {
  const initialOpenState = useMemo(
    () => resolveInitialMonitorInsightsOpenState(typeof window !== "undefined" ? window.innerWidth : undefined),
    [],
  );
  const [summaryOpen, setSummaryOpen] = useState(initialOpenState.summaryOpen);
  const [explainabilityOpen, setExplainabilityOpen] = useState(initialOpenState.explainabilityOpen);
  const [forecastOpen, setForecastOpen] = useState(initialOpenState.forecastOpen);
  const governanceClass = useMemo(
    () => (summaryOpen ? getGovernanceClass(intelligence.governanceState) : ""),
    [intelligence.governanceState, summaryOpen],
  );
  const decisionBadges = useMemo(
    () => buildMonitorInsightsDecisionSummaryBadges(intelligence),
    [intelligence],
  );
  const explainabilityBadges = useMemo(
    () => buildMonitorInsightsExplainabilityBadges(intelligence),
    [intelligence],
  );
  const forecastBadges = useMemo(
    () => buildMonitorInsightsForecastBadges(intelligence),
    [intelligence],
  );
  const anomalyRows = useMemo(
    () => (explainabilityOpen ? buildAnomalyRows(intelligence) : []),
    [explainabilityOpen, intelligence],
  );
  const correlationRows = useMemo(
    () => (explainabilityOpen ? buildCorrelationRows(intelligence) : []),
    [explainabilityOpen, intelligence],
  );
  const slopeRows = useMemo(
    () => (explainabilityOpen ? buildSlopeRows(intelligence) : []),
    [explainabilityOpen, intelligence],
  );
  const boostedPairLookup = useMemo(
    () =>
      explainabilityOpen
        ? new Set(intelligence.correlationMatrix.boostedPairs.map(normalizeBoostedKey))
        : new Set<string>(),
    [explainabilityOpen, intelligence.correlationMatrix.boostedPairs],
  );
  const forecastSeries = useMemo(
    () => (forecastOpen ? buildForecastSeries(intelligence.forecastProjection, lastUpdated) : []),
    [forecastOpen, intelligence.forecastProjection, lastUpdated],
  );

  return (
    <section className={embedded ? "space-y-4" : "space-y-4 rounded-2xl border border-border/60 bg-background/30 p-4 backdrop-blur-sm"}>
      {embedded ? null : (
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Intelligence Insights</h2>
            <InfoHint text="Deterministic explainability feed from anomaly, correlation, forecast, and governance engines." />
          </div>
          <p className="text-sm text-muted-foreground">
            Decision transparency for autonomous diagnostics and action recommendation flow.
          </p>
        </div>
      )}
      <div className="space-y-3">
        <MonitorInsightsSubsectionToggle
          title="Decision Summary"
          description="Open governance, chosen strategy, and merged decision reason only when you need the latest conclusion."
          badges={decisionBadges}
          open={summaryOpen}
          onToggle={() => setSummaryOpen((previous) => !previous)}
        />
        {summaryOpen ? (
          <MonitorInsightsPanels intelligence={intelligence} governanceClass={governanceClass} />
        ) : null}
      </div>
      <div className="space-y-3">
        <MonitorInsightsSubsectionToggle
          title="Explainability Signals"
          description="Open anomaly weights, correlation boosts, and slope values only when you need the detailed reasoning inputs."
          badges={explainabilityBadges}
          open={explainabilityOpen}
          onToggle={() => setExplainabilityOpen((previous) => !previous)}
        />
        {explainabilityOpen ? (
          <MonitorInsightsMetrics
            anomalyRows={anomalyRows}
            correlationRows={correlationRows}
            slopeRows={slopeRows}
            boostedPairLookup={boostedPairLookup}
          />
        ) : null}
      </div>
      <div className="space-y-3">
        <MonitorInsightsSubsectionToggle
          title="Forecast Projection"
          description="Open the predicted latency trend only when you need the forward-looking signal."
          badges={forecastBadges}
          open={forecastOpen}
          onToggle={() => setForecastOpen((previous) => !previous)}
        />
        {forecastOpen ? (
          <TimeSeriesChart
            title="Forecast Projection"
            description="Predicted latency projection over the next decision horizon."
            color="#64748b"
            unit="ms"
            data={forecastSeries}
          />
        ) : null}
      </div>
    </section>
  );
}

export const MonitorInsightsSection = memo(MonitorInsightsSectionImpl);
