import { Maximize2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
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
  formatCollectionSameDayPaceDisplayDate,
  type CollectionSameDayPaceComparison,
} from "./collection-monthly-comparison-utils";
import {
  MonthlySameDayPaceChartCanvas,
  SameDayPointDetailPanel,
  type SameDayChartPoint,
} from "./MonthlySameDayPaceChartParts";

type MonthlySameDayPaceChartProps = {
  pace: CollectionSameDayPaceComparison;
};

export function MonthlySameDayPaceChart({ pace }: MonthlySameDayPaceChartProps) {
  const [fullViewOpen, setFullViewOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(pace.comparisonDay);
  const chartId = useId();
  const chartData = useMemo<SameDayChartPoint[]>(() => (
    pace.points.map((point) => ({
      ...point,
      dateLabel: formatCollectionSameDayPaceDisplayDate(point.currentDate).replace(/\s+\d{4}$/u, ""),
      targetExpected: pace.target
        ? (pace.target.monthlyTargetAmount * point.rangeIndex) / pace.totalDaysInCurrentMonth
        : null,
    }))
  ), [pace]);

  useEffect(() => {
    setSelectedDay(pace.points[pace.points.length - 1]?.day ?? pace.comparisonDay);
  }, [pace.comparisonDay, pace.currentMonth, pace.endDay, pace.points, pace.previousMonth, pace.startDay]);

  const selectedPoint = useMemo(() => (
    chartData.find((point) => point.day === selectedDay)
    || chartData[chartData.length - 1]
    || null
  ), [chartData, selectedDay]);
  const handlePointSelect = useCallback((point: SameDayChartPoint) => {
    setSelectedDay(point.day);
  }, []);

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Same-day pace trend</p>
          <p className="text-xs text-muted-foreground">
            Cumulative collection from day {pace.startDay} to day {pace.endDay}, compared against the same day range.
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
          <p className="text-2xs font-medium uppercase tracking-normal text-muted-foreground">
            Current range
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{formatAmountRM(pace.currentTotal)}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-2xs font-medium uppercase tracking-normal text-muted-foreground">
            Previous range
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{formatAmountRM(pace.previousTotal)}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-2xs font-medium uppercase tracking-normal text-muted-foreground">
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
        onPointSelect={handlePointSelect}
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
            onPointSelect={handlePointSelect}
          />
          {selectedPoint ? (
            <SameDayPointDetailPanel pace={pace} point={selectedPoint} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
