import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LoginTrend, PeakHour } from "@/pages/dashboard/types";
import { formatDashboardDate, formatDashboardHour } from "@/pages/dashboard/utils";
import type { TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

export type DashboardTooltipProps = TooltipProps<ValueType, NameType>;

type CompactChartTooltipProps = Pick<DashboardTooltipProps, "active" | "label" | "payload"> & {
  formatLabel: (label: string | number) => string;
};

type DashboardTrendPeriodSelectorProps = {
  onTrendDaysChange: (days: number) => void;
  trendDays: number;
};

type DashboardChartLoadingStateProps = {
  className: string;
  label: string;
  screenReaderLabel: string;
};

type DashboardChartEmptyStateProps = {
  className: string;
};

export type DashboardChartMetric = {
  label: string;
  value: string;
};

type DashboardChartMetricStripProps = {
  metrics: readonly DashboardChartMetric[];
  wide?: boolean;
};

type DashboardLoginTrendDetailTableProps = {
  trends: readonly LoginTrend[];
};

type DashboardPeakHoursDetailTableProps = {
  peakHours: readonly PeakHour[];
  totalLogins: number;
};

const LOGIN_TREND_LEGEND_ITEMS = [
  { label: "Logins", dotClassName: "bg-[hsl(var(--chart-1))]" },
  { label: "Logouts", dotClassName: "bg-[hsl(var(--chart-2))]" },
];
const TREND_DAY_OPTIONS = [7, 14, 30] as const;

const TOOLTIP_DOT_CLASS_BY_NAME: Record<string, string> = {
  Logins: "bg-[hsl(var(--chart-1))]",
  Logouts: "bg-[hsl(var(--chart-2))]",
};

function formatTooltipValue(value: ValueType | undefined) {
  if (Array.isArray(value)) {
    return value.join(" / ");
  }
  return String(value ?? "");
}

export function formatDashboardHourCompact(hour: number) {
  return formatDashboardHour(hour).replace(" AM", "a").replace(" PM", "p").replace(" ", "");
}

export function formatDashboardChartAverage(value: number) {
  return value.toFixed(1).replace(/\.0$/u, "");
}

export function formatDashboardChartPercentage(value: number) {
  return `${(value * 100).toFixed(1).replace(/\.0$/u, "")}%`;
}

export function DashboardChartMetricStrip({
  metrics,
  wide = false,
}: DashboardChartMetricStripProps) {
  return (
    <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/60 py-3 ${wide ? "sm:grid-cols-4" : ""}`}>
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0">
          <dt className="text-2xs font-semibold uppercase tracking-label-sm text-muted-foreground">
            {metric.label}
          </dt>
          <dd className="mt-1 truncate text-sm font-bold text-foreground sm:text-base" title={metric.value}>
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DashboardLoginTrendDetailTable({
  trends,
}: DashboardLoginTrendDetailTableProps) {
  return (
    <section
      className="min-h-0 overflow-hidden rounded-xl border border-border/60"
      aria-labelledby="login-trend-detail-table-title"
    >
      <div className="border-b border-border/60 bg-muted/15 px-3 py-2.5">
        <h3 id="login-trend-detail-table-title" className="text-sm font-semibold text-foreground">
          Daily values
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Exact login, logout, and net session values.
        </p>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <Table className="min-w-[360px] table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="h-10 w-[37%] px-3 text-xs">Date</TableHead>
              <TableHead className="h-10 w-[21%] px-2 text-right text-xs">Logins</TableHead>
              <TableHead className="h-10 w-[21%] px-2 text-right text-xs">Logouts</TableHead>
              <TableHead className="h-10 w-[21%] px-3 text-right text-xs">Net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trends.map((trend) => {
              const netSessions = trend.logins - trend.logouts;
              return (
                <TableRow key={trend.date}>
                  <TableCell className="px-3 py-2.5 text-xs font-medium">
                    {formatDashboardDate(trend.date)}
                  </TableCell>
                  <TableCell className="px-2 py-2.5 text-right text-xs">
                    {trend.logins.toLocaleString()}
                  </TableCell>
                  <TableCell className="px-2 py-2.5 text-right text-xs">
                    {trend.logouts.toLocaleString()}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right text-xs font-semibold">
                    {netSessions > 0 ? "+" : ""}
                    {netSessions.toLocaleString()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export function DashboardPeakHoursDetailTable({
  peakHours,
  totalLogins,
}: DashboardPeakHoursDetailTableProps) {
  const sortedPeakHours = [...peakHours].sort(
    (left, right) => right.count - left.count || left.hour - right.hour,
  );

  return (
    <section
      className="min-h-0 overflow-hidden rounded-xl border border-border/60"
      aria-labelledby="peak-hours-detail-table-title"
    >
      <div className="border-b border-border/60 bg-muted/15 px-3 py-2.5">
        <h3 id="peak-hours-detail-table-title" className="text-sm font-semibold text-foreground">
          Hour ranking
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Hours ranked by login volume and share.
        </p>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <Table className="min-w-[340px] table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="h-10 w-[18%] px-3 text-xs">Rank</TableHead>
              <TableHead className="h-10 w-[34%] px-2 text-xs">Hour</TableHead>
              <TableHead className="h-10 w-[24%] px-2 text-right text-xs">Logins</TableHead>
              <TableHead className="h-10 w-[24%] px-3 text-right text-xs">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPeakHours.map((peakHour, index) => (
              <TableRow key={peakHour.hour}>
                <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell className="px-2 py-2.5 text-xs font-medium">
                  {formatDashboardHour(peakHour.hour)}
                </TableCell>
                <TableCell className="px-2 py-2.5 text-right text-xs">
                  {peakHour.count.toLocaleString()}
                </TableCell>
                <TableCell className="px-3 py-2.5 text-right text-xs font-semibold">
                  {formatDashboardChartPercentage(
                    totalLogins > 0 ? peakHour.count / totalLogins : 0,
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export const CompactChartTooltip = memo(function CompactChartTooltip({
  active,
  payload,
  label,
  formatLabel,
}: CompactChartTooltipProps) {
  if (!active || !payload?.length || label === undefined) {
    return null;
  }

  return (
    <div className="min-w-[132px] max-w-[200px] rounded-xl border border-border/70 bg-popover px-3 py-2 text-popover-foreground shadow-lg">
      <p className="text-2xs font-semibold uppercase tracking-label-md text-muted-foreground">
        {formatLabel(label)}
      </p>
      <div className="mt-2 space-y-1.5">
        {payload.map((item) => (
          <div key={String(item.name)} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${TOOLTIP_DOT_CLASS_BY_NAME[String(item.name || "")] || "bg-[hsl(var(--chart-3))]"}`}
                aria-hidden="true"
              />
              <span
                className="truncate text-muted-foreground"
                title={String(item.name ?? "")}
                aria-label={String(item.name ?? "")}
              >
                {String(item.name ?? "")}
              </span>
            </div>
            <span className="shrink-0 font-semibold text-foreground">{formatTooltipValue(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
CompactChartTooltip.displayName = "CompactChartTooltip";

export function DashboardTrendPeriodSelector({
  onTrendDaysChange,
  trendDays,
}: DashboardTrendPeriodSelectorProps) {
  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-xl border border-border/60 bg-muted/15 p-1"
      role="group"
      aria-label="Select trend period"
    >
      {TREND_DAY_OPTIONS.map((days) => {
        const pressedProps = trendDays === days
          ? { "aria-pressed": "true" as const }
          : { "aria-pressed": "false" as const };

        return (
          <Button
            key={days}
            type="button"
            variant={trendDays === days ? "default" : "ghost"}
            size="sm"
            className="h-8 rounded-lg px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm"
            onClick={() => onTrendDaysChange(days)}
            {...pressedProps}
            aria-label={`Show ${days} day trends`}
            data-testid={`button-trend-${days}d`}
          >
            {days}d
          </Button>
        );
      })}
    </div>
  );
}

export function DashboardTrendLegend() {
  return (
    <div className="flex flex-wrap gap-2">
      {LOGIN_TREND_LEGEND_ITEMS.map((item) => (
        <div
          key={item.label}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/10 px-3 py-1.5 text-xs text-muted-foreground"
        >
          <span className={`h-2.5 w-2.5 rounded-full ${item.dotClassName}`} aria-hidden="true" />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardChartLoadingState({
  className,
  label,
  screenReaderLabel,
}: DashboardChartLoadingStateProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border border-border/50 bg-muted/10 ${className}`}
      role="status"
      aria-label={label}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      <span className="sr-only">{screenReaderLabel}</span>
    </div>
  );
}

export function DashboardChartEmptyState({ className }: DashboardChartEmptyStateProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 text-muted-foreground ${className}`}
    >
      No data available
    </div>
  );
}
