import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useId, useMemo, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  buildCollectionMonthlyComparisonInsights,
  buildCollectionMonthlyComparisonTargetSummary,
  formatCollectionMonthlyComparisonMonthDelta,
  formatCompactAmountRM,
  resolveCollectionMonthlyComparisonTargetForMonth,
  type CollectionMonthlyComparisonMonthInsight,
  type CollectionMonthlyComparisonTargetLookup,
} from "./collection-monthly-comparison-utils";

type MonthlyCollectionComparisonChartProps = {
  data: CollectionMonthlyComparisonResponse;
  monthlyTargetAmount?: number | null | undefined;
  monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
  monthlyTargetLoading?: boolean | undefined;
  monthlyTargetSourceLabel?: string | null | undefined;
  onMonthSelect?: ((monthKey: string) => void) | undefined;
};

type MonthlyCollectionComparisonChartPoint = CollectionMonthlyComparisonMonthInsight & {
  monthlyTarget: number | null;
};

type TooltipEntry = {
  payload?: MonthlyCollectionComparisonChartPoint;
};

type MonthlyComparisonTargetSummary = ReturnType<typeof buildCollectionMonthlyComparisonTargetSummary>;

function resolveChartPayloadMonth(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const maybePayload = "payload" in value
    ? (value as { payload?: unknown }).payload
    : value;
  if (!maybePayload || typeof maybePayload !== "object" || !("month" in maybePayload)) {
    return null;
  }
  const month = (maybePayload as { month?: unknown }).month;
  return typeof month === "string" && month ? month : null;
}

function MonthlyCollectionComparisonTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean | undefined;
  label?: string | number | undefined;
  payload?: TooltipEntry[] | undefined;
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
        {point?.monthlyTarget && point.monthlyTarget > 0 ? (
          <div className="flex justify-between gap-3">
            <dt>Target gap</dt>
            <dd className="text-right">
              {formatCollectionMonthlyComparisonMonthDelta(
                Number(point?.totalCollection || 0) - point.monthlyTarget,
                point.monthlyTarget > 0
                  ? ((Number(point?.totalCollection || 0) - point.monthlyTarget) / point.monthlyTarget) * 100
                  : null,
              )}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function MonthlyCollectionComparisonChartCanvas({
  id,
  className,
  data,
  insights,
  targetSummary,
  chartData,
  chartLabel,
  onMonthSelect,
}: {
  id: string;
  className: string;
  data: CollectionMonthlyComparisonResponse;
  insights: ReturnType<typeof buildCollectionMonthlyComparisonInsights>;
  targetSummary: MonthlyComparisonTargetSummary;
  chartData: MonthlyCollectionComparisonChartPoint[];
  chartLabel: string;
  onMonthSelect?: ((monthKey: string) => void) | undefined;
}) {
  const handleBarClick = useCallback<NonNullable<ComponentProps<typeof Bar>["onClick"]>>((entry) => {
    if (!onMonthSelect) {
      return;
    }
    const month = resolveChartPayloadMonth(entry);
    if (month) {
      onMonthSelect(month);
    }
  }, [onMonthSelect]);

  return (
    <div
      id={id}
      className={`min-w-0 rounded-xl border border-border/60 bg-background p-3 ${className}`}
      role="img"
      aria-label={chartLabel}
    >
      <ResponsiveContainer width="100%" height="100%" debounce={80}>
        <ComposedChart
          data={chartData}
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
            content={(props) => <MonthlyCollectionComparisonTooltip {...props} />}
            wrapperStyle={{ outline: "none" }}
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
          <Bar
            yAxisId="total"
            dataKey="totalCollection"
            name="Monthly total"
            radius={[8, 8, 0, 0]}
            maxBarSize={42}
            onClick={handleBarClick}
            className={onMonthSelect ? "cursor-pointer" : ""}
          >
            {chartData.map((entry) => (
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
          {targetSummary ? (
            <Line
              yAxisId="total"
              type="monotone"
              dataKey="monthlyTarget"
              name="Monthly target"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
      <span className="sr-only">{data.comparison.summary}</span>
    </div>
  );
}

export function MonthlyCollectionComparisonChart({
  data,
  monthlyTargetAmount,
  monthlyTargetsByMonth,
  monthlyTargetLoading = false,
  monthlyTargetSourceLabel = null,
  onMonthSelect,
}: MonthlyCollectionComparisonChartProps) {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fullViewOpen, setFullViewOpen] = useState(false);
  const chartRegionId = useId();
  const insights = useMemo(() => buildCollectionMonthlyComparisonInsights(data), [data]);
  const targetInput = monthlyTargetsByMonth ?? monthlyTargetAmount;
  const targetSummary = useMemo(
    () => buildCollectionMonthlyComparisonTargetSummary(data, targetInput),
    [data, targetInput],
  );
  const chartData = useMemo<MonthlyCollectionComparisonChartPoint[]>(() => (
    insights.monthInsights.map((month) => ({
      ...month,
      monthlyTarget: resolveCollectionMonthlyComparisonTargetForMonth(month.month, targetInput),
    }))
  ), [insights.monthInsights, targetInput]);
  const handleMonthSelect = useCallback((monthKey: string) => {
    setFullViewOpen(false);
    onMonthSelect?.(monthKey);
  }, [onMonthSelect]);
  const summaryGridClass = targetSummary || monthlyTargetLoading ? "sm:grid-cols-5" : "sm:grid-cols-4";
  const chartLabel = `Monthly collection comparison chart for ${data.nickname}. Range total ${formatAmountRM(insights.rangeTotal)}${targetSummary ? " with configured month-specific targets" : ""}.`;

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
          {onMonthSelect ? (
            <label className="inline-flex h-8 items-center gap-1 rounded-full border border-input bg-background px-3 text-xs font-medium text-foreground transition focus-within:ring-2 focus-within:ring-ring">
              <span>Inspect</span>
              <select
                className="max-w-[7.5rem] bg-transparent text-xs outline-none"
                value=""
                aria-label="Open monthly drill-down records"
                onChange={(event) => {
                  const monthKey = event.target.value;
                  if (monthKey) {
                    handleMonthSelect(monthKey);
                  }
                }}
              >
                <option value="">month</option>
                {insights.monthInsights.map((month) => (
                  <option key={month.month} value={month.month}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
            aria-expanded={!collapsed ? "true" : "false"}
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
              aria-pressed={expanded ? "true" : "false"}
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
          {!collapsed ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 rounded-full px-3 text-xs"
              onClick={() => setFullViewOpen(true)}
              aria-haspopup="dialog"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              View Full
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
            <p className="text-[11px] text-muted-foreground">
              {monthlyTargetSourceLabel || "Configured target"}
            </p>
          </div>
        ) : monthlyTargetLoading ? (
          <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
              Target progress
            </p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Loading target...
            </p>
          </div>
        ) : null}
      </div>

      {!collapsed ? (
        <MonthlyCollectionComparisonChartCanvas
          id={chartRegionId}
          className={`mt-3 ${expanded ? "h-[380px]" : "h-[260px]"}`}
          data={data}
          insights={insights}
          targetSummary={targetSummary}
          chartData={chartData}
          chartLabel={chartLabel}
          onMonthSelect={onMonthSelect ? handleMonthSelect : undefined}
        />
      ) : (
        <p
          id={chartRegionId}
          className="mt-3 rounded-xl border border-dashed border-border/60 bg-background px-3 py-3 text-xs text-muted-foreground"
        >
          Chart is minimized. Expand it again to review the monthly bar trend.
        </p>
      )}

      <Dialog open={fullViewOpen} onOpenChange={setFullViewOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-6xl gap-3 p-4 sm:p-5">
          <DialogHeader className="pr-8">
            <DialogTitle>Monthly performance trend</DialogTitle>
            <DialogDescription>
              Detailed chart for {data.nickname}. Hover or focus chart points to inspect totals, averages,
              movement, target gap, and audit flags.
            </DialogDescription>
          </DialogHeader>
          <MonthlyCollectionComparisonChartCanvas
            id={`${chartRegionId}-full`}
            className="h-[min(70vh,620px)]"
            data={data}
            insights={insights}
            targetSummary={targetSummary}
            chartData={chartData}
            chartLabel={chartLabel}
            onMonthSelect={onMonthSelect ? handleMonthSelect : undefined}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
