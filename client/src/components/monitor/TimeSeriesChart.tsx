import { memo, useMemo } from "react";
import { CircleHelp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildTimeSeriesChartData,
  formatTimeSeriesTickLabel,
  formatTimeSeriesTooltipLabel,
  formatTimeSeriesTooltipValue,
  timeSeriesTooltipStyle,
  type TimeSeriesPoint,
} from "@/components/monitor/time-series-chart-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip as HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type TimeSeriesChartProps = {
  title: string;
  color: string;
  unit?: string;
  description?: string;
  data: TimeSeriesPoint[];
};

function TimeSeriesChartImpl({ title, color, unit = "", description, data }: TimeSeriesChartProps) {
  const chartData = useMemo(() => buildTimeSeriesChartData(data), [data]);

  return (
    <Card className="border-border/60 bg-background/40 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <span>{title}</span>
          {description ? (
            <HintTooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex rounded-sm text-muted-foreground transition hover:text-foreground"
                  aria-label={`${title} description`}
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs text-xs">{description}</p>
              </TooltipContent>
            </HintTooltip>
          ) : null}
        </CardTitle>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
              <XAxis
                dataKey="t"
                tickFormatter={formatTimeSeriesTickLabel}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                minTickGap={36}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <RechartsTooltip
                isAnimationActive={false}
                contentStyle={timeSeriesTooltipStyle}
                labelFormatter={formatTimeSeriesTooltipLabel}
                formatter={(value: number) => formatTimeSeriesTooltipValue(value, unit, title)}
              />
              <Line
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={2.2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export const TimeSeriesChart = memo(TimeSeriesChartImpl);

export type { TimeSeriesPoint };
