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
  formatCompactAmountRM,
  type CollectionSameDayPaceComparison,
  type CollectionSameDayPacePoint,
} from "./collection-monthly-comparison-utils";

type MonthlySameDayPaceChartProps = {
  pace: CollectionSameDayPaceComparison;
};

type SameDayChartPoint = CollectionSameDayPacePoint & {
  targetExpected: number | null;
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
          <dt>Current day</dt>
          <dd>{formatAmountRM(point.currentAmount)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Previous day</dt>
          <dd>{formatAmountRM(point.previousAmount)}</dd>
        </div>
        {point.targetExpected !== null ? (
          <div className="flex justify-between gap-3">
            <dt>Expected target pace</dt>
            <dd>{formatAmountRM(point.targetExpected)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function MonthlySameDayPaceChartCanvas({
  chartId,
  className,
  pace,
  chartData,
}: {
  chartId: string;
  className: string;
  pace: CollectionSameDayPaceComparison;
  chartData: SameDayChartPoint[];
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
        <LineChart data={chartData} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
          <XAxis
            dataKey="day"
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
  const chartId = useId();
  const chartData = useMemo<SameDayChartPoint[]>(() => (
    pace.points.map((point) => ({
      ...point,
      targetExpected: pace.target
        ? (pace.target.monthlyTargetAmount * point.day) / pace.totalDaysInCurrentMonth
        : null,
    }))
  ), [pace]);

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Same-day pace trend</p>
          <p className="text-xs text-muted-foreground">
            Cumulative collection from day 1 to day {pace.comparisonDay}, compared against the same day range last month.
          </p>
        </div>
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
      />

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
            className="h-[min(70vh,620px)]"
            pace={pace}
            chartData={chartData}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
