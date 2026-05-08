import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  Bar,
  Cell,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  buildCollectionMonthlyComparisonInsights,
  buildCollectionMonthlyComparisonTargetSummary,
  formatCollectionMonthlyComparisonMonthDelta,
  formatCompactAmountRM,
  type CollectionMonthlyComparisonMonthInsight,
} from "./collection-monthly-comparison-utils";

type MonthlyCollectionComparisonChartProps = {
  data: CollectionMonthlyComparisonResponse;
  monthlyTargetAmount?: number | null | undefined;
};

type TooltipEntry = {
  payload?: CollectionMonthlyComparisonMonthInsight;
};

function MonthlyCollectionComparisonTooltip({
  active,
  label,
  payload,
  monthlyTargetAmount,
}: {
  active?: boolean | undefined;
  label?: string | number | undefined;
  payload?: TooltipEntry[] | undefined;
  monthlyTargetAmount?: number | null | undefined;
}) {
  if (!active || typeof label !== "string" || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  return (
    <div className="min-w-[220px] rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{label}</p>
      <dl className="mt-2 grid gap-1 text-muted-foreground">
        <div className="flex justify-between gap-3">
          <dt>Total</dt>
          <dd className="font-medium text-foreground">{formatAmountRM(point?.totalCollection || 0)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Records</dt>
          <dd>{Number(point?.recordCount || 0)} record(s)</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Average</dt>
          <dd>{formatAmountRM(point?.averagePerRecord || 0)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Vs previous</dt>
          <dd className="text-right">
            {formatCollectionMonthlyComparisonMonthDelta(
              point?.deltaFromPrevious ?? null,
              point?.percentageFromPrevious ?? null,
            )}
          </dd>
        </div>
        {point?.anomalyLabel ? (
          <div className="flex justify-between gap-3 text-amber-700 dark:text-amber-300">
            <dt>Audit flag</dt>
            <dd className="text-right font-medium">{point.anomalyLabel}</dd>
          </div>
        ) : null}
        {monthlyTargetAmount && monthlyTargetAmount > 0 ? (
          <div className="flex justify-between gap-3">
            <dt>Target gap</dt>
            <dd className="text-right">
              {formatCollectionMonthlyComparisonMonthDelta(
                Number(point?.totalCollection || 0) - monthlyTargetAmount,
                monthlyTargetAmount > 0
                  ? ((Number(point?.totalCollection || 0) - monthlyTargetAmount) / monthlyTargetAmount) * 100
                  : null,
              )}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function MonthlyCollectionComparisonChart({
  data,
  monthlyTargetAmount,
}: MonthlyCollectionComparisonChartProps) {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const chartRegionId = useId();
  const insights = useMemo(() => buildCollectionMonthlyComparisonInsights(data), [data]);
  const targetSummary = useMemo(
    () => buildCollectionMonthlyComparisonTargetSummary(data, monthlyTargetAmount),
    [data, monthlyTargetAmount],
  );
  const summaryGridClass = targetSummary ? "sm:grid-cols-5" : "sm:grid-cols-4";

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Monthly performance trend</p>
          <p className="text-xs text-muted-foreground">
            Total collection, average per record, target line, and month-to-month movement.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 rounded-full px-3 text-xs"
            onClick={() => {
              setCollapsed((previous) => {
                const nextCollapsed = !previous;
                if (nextCollapsed) {
                  setExpanded(false);
                }
                return nextCollapsed;
              });
            }}
            aria-expanded={!collapsed}
            aria-controls={chartRegionId}
          >
            {collapsed ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                Show chart
              </>
            ) : (
              <>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                Minimize chart
              </>
            )}
          </Button>
          {!collapsed ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 rounded-full px-3 text-xs"
              onClick={() => setExpanded((previous) => !previous)}
              aria-pressed={expanded}
              aria-controls={chartRegionId}
            >
              {expanded ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Compact view
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Expand chart
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>

      <div className={`mt-3 grid gap-2 ${summaryGridClass}`}>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            Range total
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatAmountRM(insights.rangeTotal)}
          </p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            Peak month
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {insights.peakMonth ? `${insights.peakMonth.label} (${formatCompactAmountRM(insights.peakMonth.totalCollection)})` : "No data"}
          </p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            Active months
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {insights.activeMonthCount}/{data.months.length} months
          </p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            Audit watch
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {insights.anomalyMonthCount > 0
              ? `${insights.anomalyMonthCount} anomaly month(s)`
              : "No anomaly"}
          </p>
        </div>
        {targetSummary ? (
          <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
              Target progress
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {(targetSummary.targetProgress * 100).toFixed(1)}%
            </p>
          </div>
        ) : null}
      </div>

      {!collapsed ? (
        <div
          id={chartRegionId}
          className={`mt-3 min-w-0 rounded-xl border border-border/60 bg-background p-3 ${expanded ? "h-[380px]" : "h-[260px]"}`}
          role="img"
          aria-label={`Monthly collection comparison chart for ${data.nickname}. Range total ${formatAmountRM(insights.rangeTotal)}${targetSummary ? ` with monthly target ${formatAmountRM(targetSummary.monthlyTargetAmount)}` : ""}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={insights.monthInsights}
              margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tickMargin={10}
                className="text-[11px] text-muted-foreground"
                minTickGap={16}
              />
              <YAxis
                yAxisId="total"
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                tickFormatter={(value) => formatCompactAmountRM(Number(value || 0))}
                className="text-[11px] text-muted-foreground"
                width={62}
              />
              <YAxis
                yAxisId="average"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                tickFormatter={(value) => formatCompactAmountRM(Number(value || 0))}
                className="text-[11px] text-muted-foreground"
                width={62}
              />
              <Tooltip
                content={(props) => (
                  <MonthlyCollectionComparisonTooltip
                    {...props}
                    monthlyTargetAmount={targetSummary?.monthlyTargetAmount ?? null}
                  />
                )}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
              />
              {insights.rangeTotal > 0 ? (
                <ReferenceLine
                  yAxisId="total"
                  y={insights.averagePerMonth}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.55}
                />
              ) : null}
              {targetSummary ? (
                <ReferenceLine
                  yAxisId="total"
                  y={targetSummary.monthlyTargetAmount}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="6 4"
                  strokeOpacity={0.75}
                />
              ) : null}
              <Bar
                yAxisId="total"
                dataKey="totalCollection"
                name="Monthly total"
                radius={[8, 8, 0, 0]}
                maxBarSize={42}
              >
                {insights.monthInsights.map((entry) => (
                  <Cell
                    key={entry.month}
                    fill={
                      entry.recordCount === 0
                        ? "hsl(var(--muted))"
                        : entry.isAnomaly
                          ? entry.anomalyDirection === "decrease"
                            ? "hsl(var(--destructive))"
                            : "hsl(var(--chart-5))"
                        : entry.isPeakMonth
                          ? "hsl(var(--primary))"
                          : "hsl(var(--chart-3))"
                    }
                  />
                ))}
              </Bar>
              <Line
                yAxisId="average"
                type="monotone"
                dataKey="averagePerRecord"
                name="Average per record"
                stroke="hsl(var(--chart-4))"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p
          id={chartRegionId}
          className="mt-3 rounded-xl border border-dashed border-border/60 bg-background px-3 py-3 text-xs text-muted-foreground"
        >
          Chart is minimized. Expand it again to review the monthly bar trend.
        </p>
      )}
    </div>
  );
}
