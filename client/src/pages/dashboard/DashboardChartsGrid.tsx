import { memo, useCallback, useMemo } from "react";
import { Clock, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSectionError } from "@/pages/dashboard/DashboardSectionError";
import type { LoginTrend, PeakHour } from "@/pages/dashboard/types";
import {
  CompactChartTooltip,
  DashboardChartEmptyState,
  DashboardChartLoadingState,
  DashboardTrendLegend,
  DashboardTrendPeriodSelector,
  formatDashboardHourCompact,
  type DashboardTooltipProps,
} from "@/pages/dashboard/DashboardChartsGridParts";
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
  peakHoursErrorMessage: string | null;
  peakHours: PeakHour[] | undefined;
  peakHoursLoading: boolean;
  peakHoursRetrying: boolean;
  trendDays: number;
  trendsErrorMessage: string | null;
  trends: LoginTrend[] | undefined;
  trendsLoading: boolean;
  trendsRetrying: boolean;
}

function DashboardChartsGridImpl({
  onTrendDaysChange,
  onRetryPeakHours,
  onRetryTrends,
  peakHoursErrorMessage,
  peakHours,
  peakHoursLoading,
  peakHoursRetrying,
  trendDays,
  trendsErrorMessage,
  trends,
  trendsLoading,
  trendsRetrying,
}: DashboardChartsGridProps) {
  const isMobile = useIsMobile();
  const chartHeightClassName = isMobile ? "h-[220px]" : "h-[250px]";
  const loginTrendTickDates = useMemo(
    () => buildDashboardTrendTickDates(trends, isMobile ? 4 : trendDays >= 30 ? 6 : 7),
    [isMobile, trendDays, trends],
  );
  const renderLoginTrendTooltip = useCallback((props: DashboardTooltipProps) => (
    <CompactChartTooltip
      {...props}
      formatLabel={(value) => formatDashboardDate(String(value))}
    />
  ), []);
  const renderPeakHoursTooltip = useCallback((props: DashboardTooltipProps) => (
    <CompactChartTooltip
      {...props}
      formatLabel={(value) => formatDashboardHour(Number(value))}
    />
  ), []);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
      <Card
        className="rounded-2xl border border-border/60 bg-background shadow-sm"
        data-testid="card-login-trends"
        data-floating-ai-avoid="true"
      >
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
            <DashboardTrendPeriodSelector
              trendDays={trendDays}
              onTrendDaysChange={onTrendDaysChange}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3" aria-live="polite">
          {trendsErrorMessage ? (
            <DashboardSectionError
              title="Trend login gagal dimuat"
              description={trendsErrorMessage}
              onRetry={onRetryTrends}
              retrying={trendsRetrying}
              minHeightClassName={chartHeightClassName}
            />
          ) : trendsLoading ? (
            <DashboardChartLoadingState
              className={chartHeightClassName}
              label="Loading login trends"
              screenReaderLabel="Loading login trends chart"
            />
          ) : trends && trends.length > 0 ? (
            <>
              <div
                className={`min-w-0 ${chartHeightClassName}`}
                role="img"
                aria-label="Daily login and logout trend chart"
              >
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
                      className="text-2xs text-muted-foreground"
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tickMargin={8}
                      width={isMobile ? 28 : 36}
                      className="text-2xs text-muted-foreground"
                    />
                    <Tooltip content={renderLoginTrendTooltip} />
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
              <DashboardTrendLegend />
            </>
          ) : (
            <DashboardChartEmptyState className={chartHeightClassName} />
          )}
        </CardContent>
      </Card>

      <Card
        className="rounded-2xl border border-border/60 bg-background shadow-sm"
        data-testid="card-peak-hours"
        data-floating-ai-avoid="true"
      >
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
          {peakHoursErrorMessage ? (
            <DashboardSectionError
              title="Waktu puncak gagal dimuat"
              description={peakHoursErrorMessage}
              onRetry={onRetryPeakHours}
              retrying={peakHoursRetrying}
              minHeightClassName={chartHeightClassName}
            />
          ) : peakHoursLoading ? (
            <DashboardChartLoadingState
              className={chartHeightClassName}
              label="Loading peak hours"
              screenReaderLabel="Loading peak hours chart"
            />
          ) : peakHours && peakHours.length > 0 ? (
            <div
              className={`min-w-0 ${chartHeightClassName}`}
              role="img"
              aria-label="Peak activity hours chart"
            >
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
                    className="text-2xs text-muted-foreground"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                    width={isMobile ? 28 : 36}
                    className="text-2xs text-muted-foreground"
                  />
                  <Tooltip content={renderPeakHoursTooltip} />
                  <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[8, 8, 0, 0]} name="Logins" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <DashboardChartEmptyState className={chartHeightClassName} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const DashboardChartsGrid = memo(DashboardChartsGridImpl);
DashboardChartsGrid.displayName = "DashboardChartsGrid";
