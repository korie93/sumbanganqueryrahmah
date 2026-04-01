import { memo, useMemo } from "react";
import { BrainCircuit } from "lucide-react";
import { InfoHint } from "@/components/monitor/InfoHint";
import { MonitorInsightsMetrics } from "@/components/monitor/MonitorInsightsMetrics";
import { MonitorInsightsPanels } from "@/components/monitor/MonitorInsightsPanels";
import { TimeSeriesChart } from "@/components/monitor/TimeSeriesChart";
import {
  buildAnomalyRows,
  buildCorrelationRows,
  buildForecastSeries,
  buildSlopeRows,
  getGovernanceClass,
  normalizeBoostedKey,
} from "@/components/monitor/monitorData";
import type { IntelligenceExplainPayload } from "@/lib/api";

type MonitorInsightsSectionProps = {
  intelligence: IntelligenceExplainPayload;
  lastUpdated: number | null;
};

function MonitorInsightsSectionImpl({
  intelligence,
  lastUpdated,
}: MonitorInsightsSectionProps) {
  const governanceClass = useMemo(
    () => getGovernanceClass(intelligence.governanceState),
    [intelligence.governanceState],
  );
  const anomalyRows = useMemo(() => buildAnomalyRows(intelligence), [intelligence]);
  const correlationRows = useMemo(() => buildCorrelationRows(intelligence), [intelligence]);
  const slopeRows = useMemo(() => buildSlopeRows(intelligence), [intelligence]);
  const boostedPairLookup = useMemo(
    () => new Set(intelligence.correlationMatrix.boostedPairs.map(normalizeBoostedKey)),
    [intelligence.correlationMatrix.boostedPairs],
  );
  const forecastSeries = useMemo(
    () => buildForecastSeries(intelligence.forecastProjection, lastUpdated),
    [intelligence.forecastProjection, lastUpdated],
  );

  return (
    <section className="space-y-4 rounded-2xl border border-border/60 bg-background/30 p-4 backdrop-blur-sm">
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
      <MonitorInsightsPanels intelligence={intelligence} governanceClass={governanceClass} />
      <MonitorInsightsMetrics
        anomalyRows={anomalyRows}
        correlationRows={correlationRows}
        slopeRows={slopeRows}
        boostedPairLookup={boostedPairLookup}
      />

      <TimeSeriesChart
        title="Forecast Projection"
        description="Predicted latency projection over the next decision horizon."
        color="#64748b"
        unit="ms"
        data={forecastSeries}
      />
    </section>
  );
}

export const MonitorInsightsSection = memo(MonitorInsightsSectionImpl);
