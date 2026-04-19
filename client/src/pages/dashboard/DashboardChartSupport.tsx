import { Button } from "@/components/ui/button";
import type {
  TooltipContentProps,
  TooltipValueType,
} from "recharts";

type CompactChartTooltipProps = Pick<
  TooltipContentProps<TooltipValueType, string | number>,
  "active" | "payload" | "label"
> & {
  labelFormatter: (label: string | number) => string;
};

const TOOLTIP_DOT_CLASS_BY_NAME: Record<string, string> = {
  Logins: "bg-[hsl(var(--chart-1))]",
  Logouts: "bg-[hsl(var(--chart-2))]",
};

function formatTooltipValue(value: TooltipValueType | undefined) {
  if (Array.isArray(value)) {
    return value.join(" / ");
  }
  return String(value ?? "");
}

export function formatDashboardHourCompact(hourLabel: string) {
  return hourLabel.replace(" AM", "a").replace(" PM", "p").replace(" ", "");
}

export function CompactChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: CompactChartTooltipProps) {
  if (!active || !payload?.length || label === undefined) {
    return null;
  }

  return (
    <div className="min-w-[132px] max-w-[200px] rounded-xl border border-border/70 bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {labelFormatter(label)}
      </p>
      <div className="mt-2 space-y-1.5">
        {payload.map((item, index) => (
          <div
            key={`${String(item.name ?? item.dataKey ?? "value")}:${index}`}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${TOOLTIP_DOT_CLASS_BY_NAME[String(item.name || "")] || "bg-[hsl(var(--chart-3))]"}`}
                aria-hidden="true"
              />
              <span className="truncate text-muted-foreground">{String(item.name ?? "")}</span>
            </div>
            <span className="shrink-0 font-semibold text-foreground">{formatTooltipValue(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardChartLoadingState({
  chartHeightClassName,
  label,
}: {
  chartHeightClassName: string;
  label: string;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border border-border/50 bg-background/35 ${chartHeightClassName}`}
      role="status"
      aria-label={label}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function DashboardTrendDaySelector({
  onTrendDaysChange,
  trendDays,
}: {
  onTrendDaysChange: (days: number) => void;
  trendDays: number;
}) {
  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-xl border border-border/60 bg-background/60 p-1"
      role="group"
      aria-label="Select trend period"
    >
      {[7, 14, 30].map((days) => (
        trendDays === days ? (
          <Button
            key={days}
            variant="default"
            size="sm"
            className="h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm"
            onClick={() => onTrendDaysChange(days)}
            aria-pressed="true"
            aria-label={`Show ${days} day trends`}
            data-testid={`button-trend-${days}d`}
          >
            {days}d
          </Button>
        ) : (
          <Button
            key={days}
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm"
            onClick={() => onTrendDaysChange(days)}
            aria-pressed="false"
            aria-label={`Show ${days} day trends`}
            data-testid={`button-trend-${days}d`}
          >
            {days}d
          </Button>
        )
      ))}
    </div>
  );
}

export function DashboardChartLegendPill({
  dotClassName,
  label,
}: {
  dotClassName: string;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground">
      <span className={`h-2.5 w-2.5 rounded-full ${dotClassName}`} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
