import { memo } from "react";
import { BrainCircuit } from "lucide-react";
import { InfoHint } from "@/components/monitor/InfoHint";
import { MonitorInsightsMetrics } from "@/components/monitor/MonitorInsightsMetrics";
import { MonitorInsightsPanels } from "@/components/monitor/MonitorInsightsPanels";
import { TimeSeriesChart } from "@/components/monitor/TimeSeriesChart";
import type { AnomalyRow, CorrelationRow, SlopeRow } from "@/components/monitor/monitorData";
import type { SeriesPoint } from "@/hooks/useSystemMetrics";
import type { IntelligenceExplainPayload } from "@/lib/api";

type MonitorInsightsSectionProps = {
  intelligence: IntelligenceExplainPayload;
  governanceClass: string;
  anomalyRows: AnomalyRow[];
  correlationRows: CorrelationRow[];
  slopeRows: SlopeRow[];
  boostedPairLookup: Set<string>;
  forecastSeries: SeriesPoint[];
};

function MonitorInsightsSectionImpl({
  intelligence,
  governanceClass,
  anomalyRows,
  correlationRows,
  slopeRows,
  boostedPairLookup,
  forecastSeries,
}: MonitorInsightsSectionProps) {
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
