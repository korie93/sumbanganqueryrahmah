import { Maximize2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
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
  formatCollectionMonthlyComparisonDifference,
  buildCollectionSameDayPacePointInsights,
  buildCollectionSameDayPacePointTrendLabel,
  formatCollectionSameDayPaceDisplayDate,
  formatCompactAmountRM,
  type CollectionSameDayPaceComparison,
  type CollectionSameDayPacePoint,
} from "./collection-monthly-comparison-utils";

type MonthlySameDayPaceChartProps = {
  pace: CollectionSameDayPaceComparison;
};

type SameDayChartPoint = CollectionSameDayPacePoint & {
  targetExpected: number | null;
  dateLabel: string;
};

type TooltipEntry = {
  payload?: SameDayChartPoint;
};

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
        {point.targetExpected !== null ? (
          <>
            <div className="flex justify-between gap-3">
              <dt>Expected target pace</dt>
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

function SameDayPointDetailPanel({
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
        {pointInsights.slice(0, 3).map((insight) => (
          <li key={insight}>{insight}</li>
        ))}
      </ul>
    </aside>
  );
}

function MonthlySameDayPaceChartCanvas({
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
          margin={{ top: 10, right: 8, left: -8, bottom: 0 }}
          onClick={(state) => {
            const point = resolveSameDayChartPoint(state);
            if (point) {
              onPointSelect(point);
            }
          }}
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
            wrapperStyle={{ outline: "none" }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
          />
          <Line
            type="monotone"
            dataKey="currentCumulative"
            name={pace.currentLabel}
            stroke="hsl(var(--primary))"
            strokeWidth={3}
            dot={{ r: 2.5 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="previousCumulative"
            name={pace.previousLabel}
            stroke="hsl(var(--chart-4))"
            strokeWidth={2.5}
            strokeDasharray="6 5"
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
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

export function MonthlySameDayPaceChart({ pace }: MonthlySameDayPaceChartProps) {
  const [fullViewOpen, setFullViewOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(pace.comparisonDay);
  const chartId = useId();
  const chartData = useMemo<SameDayChartPoint[]>(() => (
    pace.points.map((point) => ({
      ...point,
      dateLabel: formatCollectionSameDayPaceDisplayDate(point.currentDate).replace(/\s+\d{4}$/u, ""),
      targetExpected: pace.target
        ? (pace.target.monthlyTargetAmount * point.day) / pace.totalDaysInCurrentMonth
        : null,
    }))
  ), [pace]);
  const selectedPoint = useMemo(() => (
    chartData.find((point) => point.day === selectedDay)
    || chartData[chartData.length - 1]
    || null
  ), [chartData, selectedDay]);

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Same-day pace trend</p>
          <p className="text-xs text-muted-foreground">
            Cumulative collection from day 1 to day {pace.comparisonDay}, compared against the same day range last month.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-8 items-center gap-1 rounded-full border border-input bg-background px-3 text-xs font-medium text-foreground transition focus-within:ring-2 focus-within:ring-ring">
            <span>Inspect day</span>
            <select
              className="max-w-[5rem] bg-transparent text-xs outline-none"
              value={selectedPoint?.day ?? ""}
              aria-label="Inspect same-day comparison point"
              onChange={(event) => setSelectedDay(Number(event.target.value))}
            >
              {chartData.map((point) => (
                <option key={point.day} value={point.day}>
                  Day {point.day}
                </option>
              ))}
            </select>
          </label>
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
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            Current range
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{formatAmountRM(pace.currentTotal)}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            Previous range
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{formatAmountRM(pace.previousTotal)}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            Same-day gap
          </p>
          <p className={pace.difference < 0 ? "mt-1 text-sm font-semibold text-destructive" : "mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300"}>
            {formatCollectionMonthlyComparisonDifference(pace.difference)}
          </p>
        </div>
      </div>

      <MonthlySameDayPaceChartCanvas
        chartId={chartId}
        className="mt-3 h-[280px]"
        pace={pace}
        chartData={chartData}
        onPointSelect={(point) => setSelectedDay(point.day)}
      />
      {selectedPoint ? (
        <div className="mt-3">
          <SameDayPointDetailPanel pace={pace} point={selectedPoint} />
        </div>
      ) : null}

      <Dialog open={fullViewOpen} onOpenChange={setFullViewOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-6xl gap-3 p-4 sm:p-5">
          <DialogHeader className="pr-8">
            <DialogTitle>Same-day pace trend</DialogTitle>
            <DialogDescription>
              Detailed cumulative comparison for {pace.currentRangeLabel} against {pace.previousRangeLabel}.
              Hover chart points to inspect daily totals, cumulative gap, and target pace.
            </DialogDescription>
          </DialogHeader>
          <MonthlySameDayPaceChartCanvas
            chartId={`${chartId}-full`}
            className="h-[min(60vh,560px)]"
            pace={pace}
            chartData={chartData}
            onPointSelect={(point) => setSelectedDay(point.day)}
          />
          {selectedPoint ? (
            <SameDayPointDetailPanel pace={pace} point={selectedPoint} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
