import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
} from "react";
import { Clock, Maximize2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { DashboardSectionError } from "@/pages/dashboard/DashboardSectionError";
import type { LoginTrend, PeakHour } from "@/pages/dashboard/types";
import {
  DashboardLoginTrendChart,
  DashboardPeakHoursChart,
} from "@/pages/dashboard/DashboardChartsGridCanvases";
import {
  CompactChartTooltip,
  DashboardChartEmptyState,
  DashboardChartLoadingState,
  DashboardChartMetricStrip,
  DashboardLoginTrendDetailTable,
  DashboardPeakHoursDetailTable,
  DashboardTrendLegend,
  DashboardTrendPeriodSelector,
  formatDashboardChartAverage,
  formatDashboardChartPercentage,
  type DashboardChartMetric,
  type DashboardTooltipProps,
} from "@/pages/dashboard/DashboardChartsGridParts";
import {
  buildDashboardLoginTrendInsights,
  buildDashboardPeakHourInsights,
  buildDashboardTrendTickDates,
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

type ExpandedDashboardChart = "login-trends" | "peak-hours" | null;

function formatDashboardCount(value: number) {
  return value.toLocaleString();
}

function formatDashboardNetSessions(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

function DashboardChartFullViewButton({
  disabled,
  label,
  onClick,
  testId,
}: {
  disabled: boolean;
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  testId: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 shrink-0 rounded-lg px-3 text-xs"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup="dialog"
      aria-label={label}
      data-testid={testId}
    >
      <Maximize2 className="h-4 w-4" aria-hidden="true" />
      Full view
    </Button>
  );
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
  const [expandedChart, setExpandedChart] = useState<ExpandedDashboardChart>(null);
  const expandedChartTriggerRef = useRef<HTMLButtonElement | null>(null);
  const chartHeightClassName = "h-[280px] sm:h-[320px]";
  const detailedChartHeightClassName = "h-[clamp(320px,54vh,620px)]";
  const loginTrendInsights = useMemo(
    () => buildDashboardLoginTrendInsights(trends),
    [trends],
  );
  const peakHourInsights = useMemo(
    () => buildDashboardPeakHourInsights(peakHours),
    [peakHours],
  );
  const loginTrendTickDates = useMemo(
    () => buildDashboardTrendTickDates(trends, isMobile ? 4 : trendDays >= 30 ? 6 : 7),
    [isMobile, trendDays, trends],
  );
  const detailedLoginTrendTickDates = useMemo(
    () => buildDashboardTrendTickDates(trends, isMobile ? 5 : trendDays >= 30 ? 12 : 14),
    [isMobile, trendDays, trends],
  );
  const loginTrendMetrics = useMemo<DashboardChartMetric[]>(() => [
    {
      label: "Total logins",
      value: formatDashboardCount(loginTrendInsights.totalLogins),
    },
    {
      label: "Total logouts",
      value: formatDashboardCount(loginTrendInsights.totalLogouts),
    },
    {
      label: "Peak day",
      value: loginTrendInsights.peakDate
        ? `${formatDashboardDate(loginTrendInsights.peakDate)} (${formatDashboardCount(loginTrendInsights.peakLogins)})`
        : "No data",
    },
    {
      label: "Net sessions",
      value: formatDashboardNetSessions(loginTrendInsights.netSessions),
    },
  ], [loginTrendInsights]);
  const peakHourMetrics = useMemo<DashboardChartMetric[]>(() => [
    {
      label: "Total logins",
      value: formatDashboardCount(peakHourInsights.totalLogins),
    },
    {
      label: "Busiest hour",
      value: peakHourInsights.peakHour === null
        ? "No data"
        : `${formatDashboardHour(peakHourInsights.peakHour)} (${formatDashboardCount(peakHourInsights.peakCount)})`,
    },
    {
      label: "Hourly average",
      value: formatDashboardChartAverage(peakHourInsights.averageHourlyLogins),
    },
    {
      label: "Peak share",
      value: formatDashboardChartPercentage(peakHourInsights.peakShare),
    },
  ], [peakHourInsights]);
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
  const openLoginTrends = useCallback<MouseEventHandler<HTMLButtonElement>>((event) => {
    expandedChartTriggerRef.current = event.currentTarget;
    setExpandedChart("login-trends");
  }, []);
  const openPeakHours = useCallback<MouseEventHandler<HTMLButtonElement>>((event) => {
    expandedChartTriggerRef.current = event.currentTarget;
    setExpandedChart("peak-hours");
  }, []);
  const handleExpandedChartOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setExpandedChart(null);
    }
  }, []);
  const handleExpandedChartCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    expandedChartTriggerRef.current?.focus();
    expandedChartTriggerRef.current = null;
  }, []);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2 2xl:gap-6">
        <Card
          className="rounded-2xl border border-border/60 bg-background shadow-sm"
          data-testid="card-login-trends"
          data-floating-ai-avoid="true"
        >
          <CardHeader className="space-y-3 pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <TrendingUp className="h-5 w-5" aria-hidden="true" />
                  Login Trends
                </CardTitle>
                <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
                  Daily login and logout movement across the selected period.
                </p>
              </div>
              <DashboardChartFullViewButton
                disabled={Boolean(trendsErrorMessage) || trendsLoading || !trends?.length}
                label="Open login trends in full view"
                onClick={openLoginTrends}
                testId="button-expand-login-trends"
              />
            </div>
            <DashboardTrendPeriodSelector
              trendDays={trendDays}
              onTrendDaysChange={onTrendDaysChange}
            />
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
                <DashboardChartMetricStrip metrics={loginTrendMetrics} />
                <DashboardLoginTrendChart
                  className={chartHeightClassName}
                  detailed={false}
                  isMobile={isMobile}
                  renderTooltip={renderLoginTrendTooltip}
                  tickDates={loginTrendTickDates}
                  trends={trends}
                  variantId="inline"
                />
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
          <CardHeader className="space-y-3 pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Clock className="h-5 w-5" aria-hidden="true" />
                  Peak Activity Hours
                </CardTitle>
                <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
                  Hourly login volume for identifying busy operating windows.
                </p>
              </div>
              <DashboardChartFullViewButton
                disabled={Boolean(peakHoursErrorMessage) || peakHoursLoading || !peakHours?.length}
                label="Open peak activity hours in full view"
                onClick={openPeakHours}
                testId="button-expand-peak-hours"
              />
            </div>
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
              <>
                <DashboardChartMetricStrip metrics={peakHourMetrics} />
                <DashboardPeakHoursChart
                  className={chartHeightClassName}
                  detailed={false}
                  isMobile={isMobile}
                  peakHours={peakHours}
                  renderTooltip={renderPeakHoursTooltip}
                />
              </>
            ) : (
              <DashboardChartEmptyState className={chartHeightClassName} />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={expandedChart !== null} onOpenChange={handleExpandedChartOpenChange}>
        <DialogContent
          className="h-[calc(var(--viewport-min-height-value)-1rem)] w-[calc(100vw-1rem)] max-w-[90rem] grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden p-4 sm:h-[calc(var(--viewport-min-height-value)-2rem)] sm:w-[calc(100vw-2rem)] sm:p-5"
          data-testid="dialog-dashboard-chart-detail"
          data-floating-ai-avoid="true"
          onCloseAutoFocus={handleExpandedChartCloseAutoFocus}
        >
          {expandedChart === "login-trends" && trends && trends.length > 0 ? (
            <>
              <DialogHeader className="pr-9">
                <DialogTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" aria-hidden="true" />
                  Login Trends Detail
                </DialogTitle>
                <DialogDescription>
                  Review exact daily movement, totals, peak day, and net sessions for the selected {trendDays}-day period.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 overflow-y-auto pr-1">
                <DashboardChartMetricStrip metrics={loginTrendMetrics} wide />
                <div className="mt-4 grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
                  <section className="min-w-0" aria-labelledby="login-trend-chart-detail-title">
                    <div className="mb-2">
                      <h3 id="login-trend-chart-detail-title" className="text-sm font-semibold text-foreground">
                        Daily movement
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Hover a point to compare login and logout counts.
                      </p>
                    </div>
                    <DashboardLoginTrendChart
                      className={detailedChartHeightClassName}
                      detailed
                      isMobile={isMobile}
                      renderTooltip={renderLoginTrendTooltip}
                      tickDates={detailedLoginTrendTickDates}
                      trends={trends}
                      variantId="detail"
                    />
                    <div className="mt-2">
                      <DashboardTrendLegend />
                    </div>
                  </section>
                  <DashboardLoginTrendDetailTable trends={trends} />
                </div>
              </div>
            </>
          ) : expandedChart === "peak-hours" && peakHours && peakHours.length > 0 ? (
            <>
              <DialogHeader className="pr-9">
                <DialogTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" aria-hidden="true" />
                  Peak Activity Hours Detail
                </DialogTitle>
                <DialogDescription>
                  Compare all hourly login volumes, identify the busiest window, and inspect each hour's share.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 overflow-y-auto pr-1">
                <DashboardChartMetricStrip metrics={peakHourMetrics} wide />
                <div className="mt-4 grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
                  <section className="min-w-0" aria-labelledby="peak-hours-chart-detail-title">
                    <div className="mb-2">
                      <h3 id="peak-hours-chart-detail-title" className="text-sm font-semibold text-foreground">
                        Hourly distribution
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Hover a bar to inspect the exact login count for that hour.
                      </p>
                    </div>
                    <DashboardPeakHoursChart
                      className={detailedChartHeightClassName}
                      detailed
                      isMobile={isMobile}
                      peakHours={peakHours}
                      renderTooltip={renderPeakHoursTooltip}
                    />
                  </section>
                  <DashboardPeakHoursDetailTable
                    peakHours={peakHours}
                    totalLogins={peakHourInsights.totalLogins}
                  />
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export const DashboardChartsGrid = memo(DashboardChartsGridImpl);
DashboardChartsGrid.displayName = "DashboardChartsGrid";
