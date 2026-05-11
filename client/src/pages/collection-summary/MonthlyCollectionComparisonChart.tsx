import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { useCallback, useId, useMemo, useState } from "react";
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
  formatCompactAmountRM,
  resolveCollectionMonthlyComparisonTargetForMonth,
  type CollectionMonthlyComparisonTargetLookup,
} from "./collection-monthly-comparison-utils";
import {
  MonthlyCollectionComparisonChartCanvas,
  type MonthlyCollectionComparisonChartPoint,
} from "./MonthlyCollectionComparisonChartParts";

type MonthlyCollectionComparisonChartProps = {
  data: CollectionMonthlyComparisonResponse;
  monthlyTargetAmount?: number | null | undefined;
  monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
  monthlyTargetLoading?: boolean | undefined;
  monthlyTargetSourceLabel?: string | null | undefined;
  onMonthSelect?: ((monthKey: string) => void) | undefined;
};

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
  const handleInspectMonthChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const monthKey = event.target.value;
    if (monthKey) {
      handleMonthSelect(monthKey);
    }
  }, [handleMonthSelect]);
  const summaryGridClass = targetSummary || monthlyTargetLoading ? "sm:grid-cols-5" : "sm:grid-cols-4";
  const chartLabel = useMemo(
    () => `Monthly collection comparison chart for ${data.nickname}. Range total ${formatAmountRM(insights.rangeTotal)}${targetSummary ? " with configured month-specific targets" : ""}.`,
    [data.nickname, insights.rangeTotal, targetSummary],
  );

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
                onChange={handleInspectMonthChange}
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
          {collapsed ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 rounded-full px-3 text-xs"
              onClick={() => {
                setCollapsed(false);
              }}
              aria-expanded="false"
              aria-controls={chartRegionId}
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              Show chart
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 rounded-full px-3 text-xs"
              onClick={() => {
                setExpanded(false);
                setCollapsed(true);
              }}
              aria-expanded="true"
              aria-controls={chartRegionId}
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              Minimize chart
            </Button>
          )}
          {!collapsed ? (
            expanded ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 rounded-full px-3 text-xs"
                onClick={() => setExpanded(false)}
                aria-pressed="true"
                aria-controls={chartRegionId}
              >
                <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                Compact view
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 rounded-full px-3 text-xs"
                onClick={() => setExpanded(true)}
                aria-pressed="false"
                aria-controls={chartRegionId}
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                Expand chart
              </Button>
            )
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
