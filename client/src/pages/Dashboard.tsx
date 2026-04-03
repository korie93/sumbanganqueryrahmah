import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppQueryProvider } from "@/app/AppQueryProvider";
import { Download, RefreshCw } from "lucide-react";
import {
  getAnalyticsSummary,
  getLoginTrends,
  getPeakHours,
  getRoleDistribution,
  getTopActiveUsers,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { DashboardSummaryCards } from "@/pages/dashboard/DashboardSummaryCards";
import { resolveDashboardExportBlockReason } from "@/pages/dashboard/export-guards";
import type { LoginTrend, PeakHour, RoleData, SummaryData, TopUser } from "@/pages/dashboard/types";
import { buildSummaryCards, exportDashboardToPdf } from "@/pages/dashboard/utils";

const DashboardChartsGrid = lazy(() =>
  import("@/pages/dashboard/DashboardChartsGrid").then((module) => ({ default: module.DashboardChartsGrid })),
);
const DashboardUserInsightsGrid = lazy(() =>
  import("@/pages/dashboard/DashboardUserInsightsGrid").then((module) => ({ default: module.DashboardUserInsightsGrid })),
);

function DashboardSectionFallback({ label }: { label: string }) {
  return (
    <div
      className="min-h-[320px] rounded-2xl border border-border/60 bg-white/70 p-6 shadow-sm dark:bg-slate-900/70"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="h-6 w-40 animate-pulse rounded bg-slate-200/80 dark:bg-slate-700/80" />
      <div className="mt-6 h-[220px] animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-800/70" />
    </div>
  );
}

function DashboardContent() {
  const isMobile = useIsMobile();
  const [trendDays, setTrendDays] = useState(7);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const exportInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<SummaryData>({
    queryKey: ["/api/analytics/summary"],
    queryFn: ({ signal }) => getAnalyticsSummary({ signal }),
    refetchInterval: 30000,
  });

  const { data: trends, isLoading: trendsLoading, refetch: refetchTrends } = useQuery<LoginTrend[]>({
    queryKey: ["/api/analytics/login-trends", trendDays],
    queryFn: ({ signal }) => getLoginTrends(trendDays, { signal }),
    refetchInterval: 30000,
  });

  const { data: topUsers, isLoading: topUsersLoading, refetch: refetchTopUsers } = useQuery<TopUser[]>({
    queryKey: ["/api/analytics/top-users"],
    queryFn: ({ signal }) => getTopActiveUsers(10, { signal }),
    refetchInterval: 30000,
  });

  const { data: peakHours, isLoading: peakHoursLoading, refetch: refetchPeakHours } = useQuery<PeakHour[]>({
    queryKey: ["/api/analytics/peak-hours"],
    queryFn: ({ signal }) => getPeakHours({ signal }),
    refetchInterval: 60000,
  });

  const { data: roleDistribution, isLoading: roleLoading, refetch: refetchRoles } = useQuery<RoleData[]>({
    queryKey: ["/api/analytics/role-distribution"],
    queryFn: ({ signal }) => getRoleDistribution({ signal }),
    refetchInterval: 60000,
  });

  const summaryCards = useMemo(() => buildSummaryCards(summary), [summary]);
  const exportBlockReason = useMemo(
    () => resolveDashboardExportBlockReason({ exportingPdf, refreshing }),
    [exportingPdf, refreshing],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      exportInFlightRef.current = false;
      refreshInFlightRef.current = false;
    };
  }, []);

  const handleRefreshAll = useCallback(async () => {
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    setRefreshing(true);
    try {
      await Promise.all([
        refetchSummary(),
        refetchTrends(),
        refetchTopUsers(),
        refetchPeakHours(),
        refetchRoles(),
      ]);
    } finally {
      refreshInFlightRef.current = false;
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [refetchPeakHours, refetchRoles, refetchSummary, refetchTopUsers, refetchTrends]);

  const handleExportPdf = useCallback(async () => {
    if (!dashboardRef.current || exportBlockReason || exportInFlightRef.current) return;

    exportInFlightRef.current = true;
    setExportingPdf(true);
    try {
      await exportDashboardToPdf(dashboardRef.current);
    } catch (error: unknown) {
      console.error("Failed to export PDF:", error instanceof Error ? error.message : error);
      alert(`Failed to export PDF: ${error instanceof Error ? error.message : "Unknown error. Try on desktop browser."}`);
    } finally {
      exportInFlightRef.current = false;
      if (mountedRef.current) {
        setExportingPdf(false);
      }
    }
  }, [exportBlockReason]);

  return (
    <div className="app-shell-min-height bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
        <div
          className={isMobile ? "rounded-[28px] border border-border/60 bg-background/80 p-4 shadow-sm" : "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"}
          data-floating-ai-avoid="true"
        >
          <div className="space-y-2">
            {isMobile ? (
              <p className="text-[11px] font-semibold tracking-[0.22em] text-primary/80 uppercase">
                Insights
              </p>
            ) : null}
            <h1 className="text-xl font-bold text-foreground sm:text-3xl" data-testid="text-dashboard-title">
              Dashboard Analytics
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              {isMobile ? "System health, activity, and usage insights in one mobile-friendly view." : "System overview and activity insights"}
            </p>
            {isMobile ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  Trend {trendDays}d
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  7 summary cards
                </Badge>
              </div>
            ) : null}
          </div>
          <div className={isMobile ? "mt-4 grid grid-cols-2 gap-2" : "flex w-full flex-col gap-2 sm:w-auto sm:flex-row"}>
            <Button
              onClick={handleExportPdf}
              variant="outline"
              disabled={exportBlockReason !== null}
              data-testid="button-export-pdf"
              className={isMobile ? "w-full" : "w-full sm:w-auto"}
            >
              {exportingPdf ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export PDF
            </Button>
            <Button
              onClick={() => {
                void handleRefreshAll();
              }}
              variant="outline"
              disabled={refreshing}
              data-testid="button-refresh-dashboard"
              className={isMobile ? "w-full" : "w-full sm:w-auto"}
            >
              <RefreshCw className={`w-4 h-4 mr-2${refreshing ? " animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div ref={dashboardRef} className="space-y-4 sm:space-y-6">
          <DashboardSummaryCards items={summaryCards} summaryLoading={summaryLoading} />
          <Suspense fallback={<DashboardSectionFallback label="Loading dashboard charts" />}>
            <DashboardChartsGrid
              onTrendDaysChange={setTrendDays}
              peakHours={peakHours}
              peakHoursLoading={peakHoursLoading}
              trendDays={trendDays}
              trends={trends}
              trendsLoading={trendsLoading}
            />
          </Suspense>
          <Suspense fallback={<DashboardSectionFallback label="Loading dashboard user insights" />}>
            <DashboardUserInsightsGrid
              roleDistribution={roleDistribution}
              roleLoading={roleLoading}
              topUsers={topUsers}
              topUsersLoading={topUsersLoading}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <AppQueryProvider>
      <DashboardContent />
    </AppQueryProvider>
  );
}
