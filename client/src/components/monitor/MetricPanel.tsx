import { memo, useMemo } from "react";
import { CircleHelp } from "lucide-react";
import {
  buildSparklinePath,
  formatMetricValue,
  metricStatusClasses,
  metricTrendConfig,
  type MetricStatus,
  type MetricTrend,
} from "@/components/monitor/metric-panel-utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type MetricPanelProps = {
  label: string;
  value: number;
  unit?: string;
  description?: string;
  trend: MetricTrend;
  status: MetricStatus;
  history: number[];
  decimals?: number;
};

function MetricPanelImpl({
  label,
  value,
  unit = "",
  description,
  trend,
  status,
  history,
  decimals = 1,
}: MetricPanelProps) {
  const trendMeta = metricTrendConfig[trend];
  const TrendIcon = trendMeta.icon;
  const path = useMemo(() => buildSparklinePath(history, 140, 34), [history]);
  const formatted = formatMetricValue(value, decimals);

  return (
    <Card className="border-border/60 bg-background/55 shadow-sm supports-[backdrop-filter]:backdrop-blur-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              {description ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex rounded-sm text-muted-foreground transition hover:text-foreground"
                      aria-label={`Show more information about ${label}`}
                    >
                      <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">{description}</p>
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            <div className="mt-2 flex items-end gap-1">
              <span className="text-3xl font-semibold leading-none text-foreground">{formatted}</span>
              {unit ? <span className="mb-0.5 text-xs text-muted-foreground">{unit}</span> : null}
            </div>
            {description ? <p className="mt-1 text-[11px] text-muted-foreground">{description}</p> : null}
          </div>
          <span className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${metricStatusClasses[status]}`} />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            <TrendIcon className={`mr-1 h-3.5 w-3.5 ${trendMeta.className}`} />
            {trendMeta.label}
          </Badge>
          <svg viewBox="0 0 140 34" className="h-9 w-36">
            <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

export const MetricPanel = memo(MetricPanelImpl);
export type { MetricStatus, MetricTrend };
