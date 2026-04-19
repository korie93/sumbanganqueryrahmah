import { memo } from "react";
import { Clock, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorFallback } from "@/components/QueryErrorFallback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccessibleChartSummary } from "@/components/ui/chart-accessibility";
import {
  CompactChartTooltip,
  DashboardChartLegendPill,
  DashboardChartLoadingState,
  DashboardTrendDaySelector,
  formatDashboardHourCompact,
} from "@/pages/dashboard/DashboardChartSupport";
import type { LoginTrend, PeakHour } from "@/pages/dashboard/types";
import {
  buildDashboardTrendTickDates,
  formatDashboardAxisDate,
  formatDashboardDate,
  formatDashboardHour,
} from "@/pages/dashboard/utils";

interface DashboardChartsGridProps {
  onTrendDaysChange: (days: number) => void;
  onRetryPeakHours: () => void;
  onRetryTrends: () => void;
  peakHours: PeakHour[] | undefined;
  peakHoursErrorMessage?: string | null;
  peakHoursLoading: boolean;
  trendDays: number;
  trends: LoginTrend[] | undefined;
  trendsErrorMessage?: string | null;
  trendsLoading: boolean;
}

const LOGIN_TREND_LEGEND_ITEMS = [
  { label: "Logins", dotClassName: "bg-[hsl(var(--chart-1))]" },
  { label: "Logouts", dotClassName: "bg-[hsl(var(--chart-2))]" },
];

export const DashboardChartsGrid = memo(function DashboardChartsGrid({
  onTrendDaysChange,
  onRetryPeakHours,
  onRetryTrends,
  peakHours,
  peakHoursErrorMessage,
  peakHoursLoading,
  trendDays,
  trends,
  trendsErrorMessage,
  trendsLoading,
}: DashboardChartsGridProps) {
  const isMobile = useIsMobile();
  const chartHeightClassName = isMobile ? "h-[220px]" : "h-[250px]";
  const loginTrendTickDates = buildDashboardTrendTickDates(trends, isMobile ? 4 : trendDays >= 30 ? 6 : 7);
  const totalLogins = trends?.reduce((sum, item) => sum + item.logins, 0) ?? 0;
  const totalLogouts = trends?.reduce((sum, item) => sum + item.logouts, 0) ?? 0;
  const busiestTrendDay = trends?.reduce<LoginTrend | null>(
    (currentBest, item) => (!currentBest || item.logins > currentBest.logins ? item : currentBest),
    null,
  );
  const peakHour = peakHours?.reduce<PeakHour | null>(
    (currentBest, item) => (!currentBest || item.count > currentBest.count ? item : currentBest),
    null,
  );
  const latestTrendDay = trends?.[trends.length - 1] ?? null;
  const topPeakHours = (peakHours ?? [])
    .slice()
    .sort((left, right) => right.count - left.count)
    .slice(0, 3);

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
            <DashboardTrendDaySelector
              onTrendDaysChange={onTrendDaysChange}
              trendDays={trendDays}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3" aria-live="polite" aria-busy={trendsLoading}>
          {trendsLoading ? (
            <DashboardChartLoadingState
              chartHeightClassName={chartHeightClassName}
              label="Loading login trends"
            />
          ) : trends && trends.length > 0 ? (
            <>
              <div className={`min-w-0 ${chartHeightClassName}`} aria-hidden="true">
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
                      ticks={loginTrendTickDates}
                      axisLine={false}
                      tickLine={false}
                      tickMargin={10}
                      height={isMobile ? 30 : 36}
                      minTickGap={isMobile ? 20 : 24}
                      interval={0}
                      tickFormatter={(value) => formatDashboardAxisDate(String(value))}
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
              <AccessibleChartSummary
                title="Login Trends summary"
                summary={`Login trends over ${trendDays} days. Total logins ${totalLogins}, total logouts ${totalLogouts}.${busiestTrendDay ? ` Highest login day ${formatDashboardDate(busiestTrendDay.date)} with ${busiestTrendDay.logins} logins.` : ""}`}
                items={[
                  ...(latestTrendDay
                    ? [{
                        label: `Latest day ${formatDashboardDate(latestTrendDay.date)}`,
                        value: `${latestTrendDay.logins} logins, ${latestTrendDay.logouts} logouts`,
                      }]
                    : []),
                  ...(busiestTrendDay && busiestTrendDay !== latestTrendDay
                    ? [{
                        label: `Busiest day ${formatDashboardDate(busiestTrendDay.date)}`,
                        value: `${busiestTrendDay.logins} logins, ${busiestTrendDay.logouts} logouts`,
                      }]
                    : []),
                ]}
              />
              <div className="flex flex-wrap gap-2">
                {LOGIN_TREND_LEGEND_ITEMS.map((item) => (
                  <DashboardChartLegendPill
                    key={item.label}
                    dotClassName={item.dotClassName}
                    label={item.label}
                  />
                ))}
              </div>
            </>
          ) : trendsErrorMessage ? (
            <QueryErrorFallback
              compact
              title="Login trends are unavailable"
              description={trendsErrorMessage}
              onRetry={onRetryTrends}
              data-testid="dashboard-trends-error"
            />
          ) : (
            <EmptyState
              className={chartHeightClassName}
              title="No login trend data yet"
              description="Login and logout activity will appear here after the first completed sessions are recorded."
            />
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
        <CardContent className="space-y-3" aria-live="polite" aria-busy={peakHoursLoading}>
          {peakHoursLoading ? (
            <DashboardChartLoadingState
              chartHeightClassName={chartHeightClassName}
              label="Loading peak hours"
            />
          ) : peakHoursErrorMessage ? (
            <QueryErrorFallback
              compact
              title="Peak activity hours are unavailable"
              description={peakHoursErrorMessage}
              onRetry={onRetryPeakHours}
              data-testid="dashboard-peak-hours-error"
            />
          ) : peakHours && peakHours.length > 0 ? (
            <>
              <div className={`min-w-0 ${chartHeightClassName}`} aria-hidden="true">
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
                          ? formatDashboardHourCompact(formatDashboardHour(Number(hour)))
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
              <AccessibleChartSummary
                title="Peak Activity Hours summary"
                summary={`Peak activity hours for login volume.${peakHour ? ` Highest activity occurs at ${formatDashboardHour(peakHour.hour)} with ${peakHour.count} logins.` : ""}`}
                items={topPeakHours.map((item) => ({
                  label: formatDashboardHour(item.hour),
                  value: `${item.count} logins`,
                }))}
              />
            </>
          ) : (
            <EmptyState
              className={chartHeightClassName}
              title="No peak-hour activity yet"
              description="Busy-hour insights will appear once enough login activity has been recorded for this workspace."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
});
