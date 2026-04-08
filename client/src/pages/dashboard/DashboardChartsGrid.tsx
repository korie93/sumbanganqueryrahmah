import { Clock, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LoginTrend, PeakHour } from "@/pages/dashboard/types";
import { formatDashboardDate, formatDashboardHour } from "@/pages/dashboard/utils";

interface DashboardChartsGridProps {
  onTrendDaysChange: (days: number) => void;
  peakHours: PeakHour[] | undefined;
  peakHoursLoading: boolean;
  trendDays: number;
  trends: LoginTrend[] | undefined;
  trendsLoading: boolean;
}

type DashboardTooltipPayloadItem = {
  color?: string | undefined;
  name?: string | number | undefined;
  value?: string | number | readonly (string | number)[] | undefined;
};

type CompactChartTooltipProps = {
  active?: boolean | undefined;
  payload?: DashboardTooltipPayloadItem[] | undefined;
  label?: string | number | undefined;
  labelFormatter: (label: string | number) => string;
};

const LOGIN_TREND_LEGEND_ITEMS = [
  { label: "Logins", dotClassName: "bg-[hsl(var(--chart-1))]" },
  { label: "Logouts", dotClassName: "bg-[hsl(var(--chart-2))]" },
];

const TOOLTIP_DOT_CLASS_BY_NAME: Record<string, string> = {
  Logins: "bg-[hsl(var(--chart-1))]",
  Logouts: "bg-[hsl(var(--chart-2))]",
};

function formatTooltipValue(value: DashboardTooltipPayloadItem["value"]) {
  if (Array.isArray(value)) {
    return value.join(" / ");
  }
  return String(value ?? "");
}

function formatDashboardDateCompact(dateStr: string) {
  const formatted = formatDashboardDate(dateStr);
  const [day, month] = formatted.split("/");
  return day && month ? `${day}/${month}` : formatted;
}

function formatDashboardHourCompact(hour: number) {
  return formatDashboardHour(hour).replace(" AM", "a").replace(" PM", "p").replace(" ", "");
}

function CompactChartTooltip({
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
        {payload.map((item) => (
          <div key={String(item.name)} className="flex items-center justify-between gap-3 text-xs">
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

export function DashboardChartsGrid({
  onTrendDaysChange,
  peakHours,
  peakHoursLoading,
  trendDays,
  trends,
  trendsLoading,
}: DashboardChartsGridProps) {
  const isMobile = useIsMobile();
  const chartHeightClassName = isMobile ? "h-[220px]" : "h-[250px]";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
      <Card className="glass-card" data-testid="card-login-trends" data-floating-ai-avoid="true">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <TrendingUp className="h-5 w-5" />
                Login Trends
              </CardTitle>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {isMobile
                  ? "Daily login and logout activity over the selected range."
                  : "Daily login and logout activity over the selected period."}
              </p>
            </div>
            <div
              className="grid grid-cols-3 gap-1 rounded-xl border border-border/60 bg-background/60 p-1"
              role="group"
              aria-label="Select trend period"
            >
              {[7, 14, 30].map((days) => (
                <Button
                  key={days}
                  variant={trendDays === days ? "default" : "ghost"}
                  size="sm"
                  className="h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm"
                  onClick={() => onTrendDaysChange(days)}
                  aria-pressed={trendDays === days}
                  aria-label={`Show ${days} day trends`}
                  data-testid={`button-trend-${days}d`}
                >
                  {days}d
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3" aria-live="polite">
          {trendsLoading ? (
            <div
              className={`flex items-center justify-center rounded-xl border border-border/50 bg-background/35 ${chartHeightClassName}`}
              role="status"
              aria-label="Loading login trends"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
              <span className="sr-only">Loading login trends chart</span>
            </div>
          ) : trends && trends.length > 0 ? (
            <>
              <div className={`min-w-0 ${chartHeightClassName}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={trends}
                    margin={{ top: 8, right: isMobile ? 8 : 16, left: isMobile ? -22 : -8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="loginGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="logoutGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/70" vertical={false} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tickMargin={8}
                      height={isMobile ? 28 : 34}
                      minTickGap={isMobile ? 18 : 10}
                      interval={isMobile ? "preserveStartEnd" : 0}
                      tickFormatter={(value) =>
                        isMobile ? formatDashboardDateCompact(String(value)) : formatDashboardDate(String(value))
                      }
                      className="text-[11px] text-muted-foreground"
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tickMargin={8}
                      width={isMobile ? 28 : 36}
                      className="text-[11px] text-muted-foreground"
                    />
                    <Tooltip
                      content={(props) => (
                        <CompactChartTooltip
                          {...props}
                          labelFormatter={(value) => formatDashboardDate(String(value))}
                        />
                      )}
                    />
                    <Area
                      type="monotone"
                      dataKey="logins"
                      stroke="hsl(var(--chart-1))"
                      fill="url(#loginGradient)"
                      strokeWidth={2}
                      name="Logins"
                    />
                    <Area
                      type="monotone"
                      dataKey="logouts"
                      stroke="hsl(var(--chart-2))"
                      fill="url(#logoutGradient)"
                      strokeWidth={2}
                      name="Logouts"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2">
                {LOGIN_TREND_LEGEND_ITEMS.map((item) => (
                  <div
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${item.dotClassName}`} aria-hidden="true" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div
              className={`flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/35 text-muted-foreground ${chartHeightClassName}`}
            >
              No data available
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card" data-testid="card-peak-hours" data-floating-ai-avoid="true">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Clock className="h-5 w-5" />
            Peak Activity Hours
          </CardTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {isMobile
              ? "Login volume by hour so busy periods stay easy to scan."
              : "Login volume by hour so busy periods stay easy to spot on smaller screens."}
          </p>
        </CardHeader>
        <CardContent className="space-y-3" aria-live="polite">
          {peakHoursLoading ? (
            <div
              className={`flex items-center justify-center rounded-xl border border-border/50 bg-background/35 ${chartHeightClassName}`}
              role="status"
              aria-label="Loading peak hours"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
              <span className="sr-only">Loading peak hours chart</span>
            </div>
          ) : peakHours && peakHours.length > 0 ? (
            <div className={`min-w-0 ${chartHeightClassName}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={peakHours}
                  margin={{ top: 8, right: isMobile ? 8 : 16, left: isMobile ? -22 : -8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/70" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                    height={isMobile ? 28 : 34}
                    interval={isMobile ? 5 : 2}
                    tickFormatter={(hour) =>
                      isMobile
                        ? formatDashboardHourCompact(Number(hour))
                        : formatDashboardHour(Number(hour))
                    }
                    className="text-[11px] text-muted-foreground"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                    width={isMobile ? 28 : 36}
                    className="text-[11px] text-muted-foreground"
                  />
                  <Tooltip
                    content={(props) => (
                      <CompactChartTooltip
                        {...props}
                        labelFormatter={(value) => formatDashboardHour(Number(value))}
                      />
                    )}
                  />
                  <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[8, 8, 0, 0]} name="Logins" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div
              className={`flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/35 text-muted-foreground ${chartHeightClassName}`}
            >
              No data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
