import { memo, useMemo } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type MetricTrend = "up" | "down" | "neutral";
export type MetricStatus = "good" | "warning" | "critical";

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

const statusClasses: Record<MetricStatus, string> = {
  good: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

const trendConfig: Record<MetricTrend, { icon: typeof ArrowRight; className: string; label: string }> = {
  up: {
    icon: ArrowUpRight,
    className: "text-emerald-500",
    label: "Rising",
  },
  down: {
    icon: ArrowDownRight,
    className: "text-red-500",
    label: "Falling",
  },
  neutral: {
    icon: ArrowRight,
    className: "text-muted-foreground",
    label: "Flat",
  },
};

function buildSparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `M 0 ${height / 2} L ${width} ${height / 2}`;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / Math.max(values.length - 1, 1);

  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

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
  const trendMeta = trendConfig[trend];
  const TrendIcon = trendMeta.icon;
  const path = useMemo(() => buildSparklinePath(history, 140, 34), [history]);
  const formatted = Number.isFinite(value) ? value.toFixed(decimals) : "0";

  return (
    <Card className="border-border/60 bg-background/55 backdrop-blur-md shadow-sm">
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
                      aria-label={`${label} description`}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
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
          <span className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${statusClasses[status]}`} />
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
