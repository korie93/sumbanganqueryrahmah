import { memo } from "react";
import { InfoHint } from "@/components/monitor/InfoHint";
import { TimeSeriesChart } from "@/components/monitor/TimeSeriesChart";
import type { MonitorChartSeries } from "@/components/monitor/monitorData";

type MonitorTechnicalChartsSectionProps = {
  chartSeries: MonitorChartSeries[];
};

function MonitorTechnicalChartsSectionImpl({ chartSeries }: MonitorTechnicalChartsSectionProps) {
  return (
    <section className="rounded-2xl border border-border/60 bg-slate-200/40 p-4 dark:bg-slate-900/60">
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">Technical DevOps View</h2>
          <InfoHint text="Rolling 60-point technical charts for deeper diagnostics and trend analysis." />
        </div>
        <p className="text-sm text-muted-foreground">
          Designed for operators to detect instability, latency spikes, and capacity pressure quickly.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {chartSeries.map((chart) => (
          <TimeSeriesChart
            key={chart.title}
            title={chart.title}
            description={chart.description}
            color={chart.color}
            unit={chart.unit}
            data={chart.data}
          />
        ))}
      </div>
    </section>
  );
}

export const MonitorTechnicalChartsSection = memo(MonitorTechnicalChartsSectionImpl);
