import type { ComponentProps } from "react";
import { useCallback } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  formatCollectionMonthlyComparisonMonthDelta,
  formatCompactAmountRM,
  type CollectionMonthlyComparisonInsights,
  type CollectionMonthlyComparisonMonthInsight,
  type CollectionMonthlyComparisonTargetSummary,
} from "./collection-monthly-comparison-utils";

export type MonthlyCollectionComparisonChartPoint = CollectionMonthlyComparisonMonthInsight & {
  monthlyTarget: number | null;
};

type TooltipEntry = {
  payload?: MonthlyCollectionComparisonChartPoint;
};

const MONTHLY_COMPARISON_CHART_MARGIN = { top: 8, right: 8, left: -8, bottom: 0 };
const MONTHLY_COMPARISON_TOOLTIP_WRAPPER_STYLE = { outline: "none" };
const MONTHLY_COMPARISON_LEGEND_WRAPPER_STYLE = { fontSize: 12, paddingBottom: 8 };
const MONTHLY_AVERAGE_DOT = { r: 3 };
const MONTHLY_AVERAGE_ACTIVE_DOT = { r: 5 };

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

export function MonthlyCollectionComparisonChartCanvas({
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
  insights: CollectionMonthlyComparisonInsights;
  targetSummary: CollectionMonthlyComparisonTargetSummary | null;
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
          margin={MONTHLY_COMPARISON_CHART_MARGIN}
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
            wrapperStyle={MONTHLY_COMPARISON_TOOLTIP_WRAPPER_STYLE}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={MONTHLY_COMPARISON_LEGEND_WRAPPER_STYLE}
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
            dot={MONTHLY_AVERAGE_DOT}
            activeDot={MONTHLY_AVERAGE_ACTIVE_DOT}
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
