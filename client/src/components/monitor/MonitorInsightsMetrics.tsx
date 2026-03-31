import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InfoHint } from "@/components/monitor/InfoHint";
import type { AnomalyRow, CorrelationRow, SlopeRow } from "@/components/monitor/monitorData";

type MonitorInsightsMetricsProps = {
  anomalyRows: AnomalyRow[];
  correlationRows: CorrelationRow[];
  slopeRows: SlopeRow[];
  boostedPairLookup: Set<string>;
};

function MonitorInsightsMetricsImpl({
  anomalyRows,
  correlationRows,
  slopeRows,
  boostedPairLookup,
}: MonitorInsightsMetricsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="border-border/60 bg-background/45">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Anomaly Breakdown</p>
            <InfoHint text="Weighted components used to compute final anomaly score." />
          </div>
          <div className="space-y-2">
            {anomalyRows.map((row) => {
              const fillWidth = Math.max(0, Math.min(100, row.value * 100));
              return (
                <div key={row.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      {row.label}
                      <InfoHint text={row.description} />
                    </span>
                    <span className="font-medium text-foreground">{row.value.toFixed(4)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full bg-primary/80 transition-[width]"
                      style={{ width: `${fillWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-background/45">
        <CardContent className="space-y-4 p-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Correlation Matrix</p>
              <InfoHint text="Pearson relationships used to boost anomaly confidence." />
            </div>
            <div className="mt-2 space-y-2">
              {correlationRows.map((row) => {
                const boosted = boostedPairLookup.has(row.boostedKey);
                return (
                  <div key={row.key} className="rounded-lg border border-border/60 bg-background/45 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {row.label}
                        <InfoHint text={row.description} />
                      </span>
                      <span className="text-sm font-semibold text-foreground">{row.value.toFixed(3)}</span>
                    </div>
                    {boosted ? (
                      <Badge variant="outline" className="mt-2 border-amber-500/35 bg-amber-500/10 text-amber-500">
                        Boosted +15%
                      </Badge>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Slope Values</p>
              <InfoHint text="Linear trend velocity per metric used for directional risk assessment." />
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {slopeRows.map((row) => (
                <div key={row.key} className="rounded-lg border border-border/60 bg-background/45 p-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{row.label}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{row.value.toFixed(4)}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const MonitorInsightsMetrics = memo(MonitorInsightsMetricsImpl);
