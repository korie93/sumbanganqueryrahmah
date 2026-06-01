import { memo } from "react";
import { Button } from "@/components/ui/button";
import { formatDashboardHour } from "@/pages/dashboard/utils";
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
      {TREND_DAY_OPTIONS.map((days) => (
        <Button
          key={days}
          type="button"
          variant={trendDays === days ? "default" : "ghost"}
          size="sm"
          className="h-8 rounded-lg px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm"
          onClick={() => onTrendDaysChange(days)}
          aria-pressed={trendDays === days ? "true" : "false"}
          aria-label={`Show ${days} day trends`}
          data-testid={`button-trend-${days}d`}
        >
          {days}d
        </Button>
      ))}
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

