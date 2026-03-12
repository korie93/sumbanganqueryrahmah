import { memo } from "react";
import { InfoHint } from "@/components/monitor/InfoHint";
import { MetricPanel } from "@/components/monitor/MetricPanel";
import { getTrend, type MonitorMetricGroup } from "@/components/monitor/monitorData";
import { Card, CardContent } from "@/components/ui/card";

type MonitorMetricsSectionProps = {
  metricGroups: MonitorMetricGroup[];
};

function MonitorMetricsSectionImpl({ metricGroups }: MonitorMetricsSectionProps) {
  return (
    <section className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">Key Metrics</h2>
          <InfoHint text="KPI panels grouped by layer: Infrastructure, Application, Database, and AI." />
        </div>
        <p className="text-sm text-muted-foreground">
          Each metric includes current value, status color, trend direction, and mini sparkline.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {metricGroups.map((group) => (
          <Card key={group.title} className="border-border/60 bg-background/35 backdrop-blur-sm">
            <CardContent className="space-y-3 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
                  <InfoHint text={group.description} />
                </div>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>
              {group.items.map((metric) => (
                <MetricPanel
                  key={`${group.title}-${metric.label}`}
                  label={metric.label}
                  value={metric.value}
                  unit={metric.unit}
                  description={metric.description}
                  trend={getTrend(metric.history)}
                  status={metric.status}
                  history={metric.history}
                  decimals={metric.decimals ?? 1}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export const MonitorMetricsSection = memo(MonitorMetricsSectionImpl);
