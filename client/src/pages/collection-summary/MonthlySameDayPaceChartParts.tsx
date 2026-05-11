import { useCallback } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  buildCollectionSameDayPacePointInsights,
  buildCollectionSameDayPacePointTrendLabel,
  formatCollectionMonthlyComparisonDifference,
  formatCollectionSameDayPaceDisplayDate,
  formatCompactAmountRM,
  type CollectionSameDayPaceComparison,
  type CollectionSameDayPacePoint,
} from "./collection-monthly-comparison-utils";

export type SameDayChartPoint = CollectionSameDayPacePoint & {
  targetExpected: number | null;
  dateLabel: string;
};

type TooltipEntry = {
  payload?: SameDayChartPoint;
};

const SAME_DAY_CHART_MARGIN = { top: 10, right: 8, left: -8, bottom: 0 };
const SAME_DAY_TOOLTIP_WRAPPER_STYLE = { outline: "none" };
const SAME_DAY_LEGEND_WRAPPER_STYLE = { fontSize: 12, paddingBottom: 8 };
const SAME_DAY_CURRENT_DOT = { r: 2.5 };
const SAME_DAY_CURRENT_ACTIVE_DOT = { r: 5 };
const SAME_DAY_PREVIOUS_DOT = { r: 2 };
const SAME_DAY_PREVIOUS_ACTIVE_DOT = { r: 4 };

function MonthlySameDayPaceTooltip({
  active,
  payload,
}: {
  active?: boolean | undefined;
  payload?: TooltipEntry[] | undefined;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  return (
    <div className="min-w-[230px] rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">Day {point.day}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {formatCollectionSameDayPaceDisplayDate(point.currentDate)} vs{" "}
        {formatCollectionSameDayPaceDisplayDate(point.previousDate)}
      </p>
      <dl className="mt-2 grid gap-1 text-muted-foreground">
        <div className="flex justify-between gap-3">
          <dt>Current cumulative</dt>
          <dd className="font-medium text-foreground">{formatAmountRM(point.currentCumulative)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Previous cumulative</dt>
          <dd>{formatAmountRM(point.previousCumulative)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Gap</dt>
          <dd className="text-right">{formatCollectionMonthlyComparisonDifference(point.cumulativeDifference)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Daily difference</dt>
          <dd className="text-right">{formatCollectionMonthlyComparisonDifference(point.dailyDifference)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Current day</dt>
          <dd>{formatAmountRM(point.currentAmount)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Previous day</dt>
          <dd>{formatAmountRM(point.previousAmount)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Current status</dt>
          <dd className="text-right">{point.currentStatus.label}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Previous status</dt>
          <dd className="text-right">{point.previousStatus.label}</dd>
        </div>
        {point.targetExpected !== null ? (
          <>
            <div className="flex justify-between gap-3">
              <dt>Expected range target pace</dt>
              <dd>{formatAmountRM(point.targetExpected)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Target gap</dt>
              <dd>{formatCollectionMonthlyComparisonDifference(point.currentCumulative - point.targetExpected)}</dd>
            </div>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function resolveSameDayChartPoint(value: unknown): SameDayChartPoint | null {
  if (!value || typeof value !== "object" || !("activePayload" in value)) {
    return null;
  }
  const activePayload = (value as { activePayload?: Array<{ payload?: SameDayChartPoint }> }).activePayload;
  const point = activePayload?.[0]?.payload;
  return point && typeof point.day === "number" ? point : null;
}

export function SameDayPointDetailPanel({
  pace,
  point,
}: {
  pace: CollectionSameDayPaceComparison;
  point: SameDayChartPoint;
}) {
  const pointInsights = buildCollectionSameDayPacePointInsights(point, pace);
  const trendLabel = buildCollectionSameDayPacePointTrendLabel(point);
  const targetProgress = pace.target
    ? (point.currentCumulative / pace.target.monthlyTargetAmount) * 100
    : null;

  return (
    <aside
      className="rounded-xl border border-border/60 bg-muted/20 p-3"
      aria-label={`Detailed same-day comparison for day ${point.day}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Day {point.day} detail</p>
          <p className="text-xs text-muted-foreground">
            {formatCollectionSameDayPaceDisplayDate(point.previousDate)} vs{" "}
            {formatCollectionSameDayPaceDisplayDate(point.currentDate)}
          </p>
        </div>
        <span
          className={
            point.cumulativeDifference >= 0
              ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
              : "rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"
          }
        >
          {trendLabel}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-lg border border-border/50 bg-background px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            {formatCollectionSameDayPaceDisplayDate(point.previousDate)}
          </p>
          <dl className="mt-1 grid gap-1 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Daily Collection</dt>
              <dd className="font-medium text-foreground">{formatAmountRM(point.previousAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Cumulative</dt>
              <dd className="font-medium text-foreground">{formatAmountRM(point.previousCumulative)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="text-right font-medium text-foreground">{point.previousStatus.label}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-lg border border-border/50 bg-background px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            {formatCollectionSameDayPaceDisplayDate(point.currentDate)}
          </p>
          <dl className="mt-1 grid gap-1 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Daily Collection</dt>
              <dd className="font-medium text-foreground">{formatAmountRM(point.currentAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Cumulative</dt>
              <dd className="font-medium text-foreground">{formatAmountRM(point.currentCumulative)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="text-right font-medium text-foreground">{point.currentStatus.label}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-lg border border-border/50 bg-background px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            Difference
          </p>
          <dl className="mt-1 grid gap-1 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Daily Difference</dt>
              <dd className={point.dailyDifference < 0 ? "font-medium text-destructive" : "font-medium text-emerald-700 dark:text-emerald-300"}>
                {formatCollectionMonthlyComparisonDifference(point.dailyDifference)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Cumulative Difference</dt>
              <dd className={point.cumulativeDifference < 0 ? "font-medium text-destructive" : "font-medium text-emerald-700 dark:text-emerald-300"}>
                {formatCollectionMonthlyComparisonDifference(point.cumulativeDifference)}
              </dd>
            </div>
            {targetProgress !== null ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Target Progress</dt>
                <dd className="font-medium text-foreground">{targetProgress.toFixed(1)}%</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <ul className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
        {pointInsights.slice(0, 4).map((insight) => (
          <li key={insight}>{insight}</li>
        ))}
      </ul>
    </aside>
  );
}

export function MonthlySameDayPaceChartCanvas({
  chartId,
  className,
  pace,
  chartData,
  onPointSelect,
}: {
  chartId: string;
  className: string;
  pace: CollectionSameDayPaceComparison;
  chartData: SameDayChartPoint[];
  onPointSelect: (point: SameDayChartPoint) => void;
}) {
  const chartLabel =
    `Same-day cumulative collection comparison for ${pace.currentLabel} versus ${pace.previousLabel}. ${pace.summary}`;
  const handleChartClick = useCallback((state: unknown) => {
    const point = resolveSameDayChartPoint(state);
    if (point) {
      onPointSelect(point);
    }
  }, [onPointSelect]);

  return (
    <div
      id={chartId}
      className={`min-w-0 rounded-xl border border-border/60 bg-background p-3 ${className}`}
      role="img"
      aria-label={chartLabel}
    >
      <ResponsiveContainer width="100%" height="100%" debounce={80}>
        <LineChart
          data={chartData}
          margin={SAME_DAY_CHART_MARGIN}
          onClick={handleChartClick}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
          <XAxis
            dataKey="dateLabel"
            axisLine={false}
            tickLine={false}
            tickMargin={10}
            interval="preserveStartEnd"
            className="text-[11px] text-muted-foreground"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            tickFormatter={(value) => formatCompactAmountRM(Number(value || 0))}
            className="text-[11px] text-muted-foreground"
            width={64}
          />
          <Tooltip
            content={(props) => <MonthlySameDayPaceTooltip {...props} />}
            wrapperStyle={SAME_DAY_TOOLTIP_WRAPPER_STYLE}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={SAME_DAY_LEGEND_WRAPPER_STYLE}
          />
          <Line
            type="monotone"
            dataKey="currentCumulative"
            name={pace.currentLabel}
            stroke="hsl(var(--primary))"
            strokeWidth={3}
            dot={SAME_DAY_CURRENT_DOT}
            activeDot={SAME_DAY_CURRENT_ACTIVE_DOT}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="previousCumulative"
            name={pace.previousLabel}
            stroke="hsl(var(--chart-4))"
            strokeWidth={2.5}
            strokeDasharray="6 5"
            dot={SAME_DAY_PREVIOUS_DOT}
            activeDot={SAME_DAY_PREVIOUS_ACTIVE_DOT}
            isAnimationActive={false}
          />
          {pace.target ? (
            <Line
              type="monotone"
              dataKey="targetExpected"
              name="Target pace"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              strokeDasharray="3 5"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
      <span className="sr-only">{chartLabel}</span>
    </div>
  );
}
