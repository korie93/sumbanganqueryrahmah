import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw } from "lucide-react";
import {
  getAnalyticsSummary,
  getLoginTrends,
  getPeakHours,
  getRoleDistribution,
  getTopActiveUsers,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DashboardChartsGrid } from "@/pages/dashboard/DashboardChartsGrid";
import { DashboardSummaryCards } from "@/pages/dashboard/DashboardSummaryCards";
import { DashboardUserInsightsGrid } from "@/pages/dashboard/DashboardUserInsightsGrid";
import type { LoginTrend, PeakHour, RoleData, SummaryData, TopUser } from "@/pages/dashboard/types";
import { buildSummaryCards, exportDashboardToPdf } from "@/pages/dashboard/utils";

export default function Dashboard() {
  const [trendDays, setTrendDays] = useState(7);
  const [exportingPdf, setExportingPdf] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<SummaryData>({
    queryKey: ["/api/analytics/summary"],
    queryFn: getAnalyticsSummary,
    refetchInterval: 30000,
  });

  const { data: trends, isLoading: trendsLoading, refetch: refetchTrends } = useQuery<LoginTrend[]>({
    queryKey: ["/api/analytics/login-trends", trendDays],
    queryFn: () => getLoginTrends(trendDays),
    refetchInterval: 30000,
  });

  const { data: topUsers, isLoading: topUsersLoading, refetch: refetchTopUsers } = useQuery<TopUser[]>({
    queryKey: ["/api/analytics/top-users"],
    queryFn: () => getTopActiveUsers(10),
    refetchInterval: 30000,
  });

  const { data: peakHours, isLoading: peakHoursLoading, refetch: refetchPeakHours } = useQuery<PeakHour[]>({
    queryKey: ["/api/analytics/peak-hours"],
    queryFn: getPeakHours,
    refetchInterval: 60000,
  });

  const { data: roleDistribution, isLoading: roleLoading, refetch: refetchRoles } = useQuery<RoleData[]>({
    queryKey: ["/api/analytics/role-distribution"],
    queryFn: getRoleDistribution,
    refetchInterval: 60000,
  });

  const summaryCards = useMemo(() => buildSummaryCards(summary), [summary]);

  const handleRefreshAll = () => {
    void Promise.all([
      refetchSummary(),
      refetchTrends(),
      refetchTopUsers(),
      refetchPeakHours(),
      refetchRoles(),
    ]);
  };

  const handleExportPdf = async () => {
    if (!dashboardRef.current) return;

    setExportingPdf(true);
    try {
      await exportDashboardToPdf(dashboardRef.current);
    } catch (error: unknown) {
      console.error("Failed to export PDF:", error instanceof Error ? error.message : error);
      alert(`Failed to export PDF: ${error instanceof Error ? error.message : "Unknown error. Try on desktop browser."}`);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="text-dashboard-title">
              Dashboard Analytics
            </h1>
            <p className="text-muted-foreground mt-1">System overview and activity insights</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleExportPdf}
              variant="outline"
              disabled={exportingPdf}
              data-testid="button-export-pdf"
            >
              {exportingPdf ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export PDF
            </Button>
            <Button onClick={handleRefreshAll} variant="outline" data-testid="button-refresh-dashboard">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div ref={dashboardRef} className="space-y-6">
          <DashboardSummaryCards items={summaryCards} summaryLoading={summaryLoading} />
          <DashboardChartsGrid
            onTrendDaysChange={setTrendDays}
            peakHours={peakHours}
            peakHoursLoading={peakHoursLoading}
            trendDays={trendDays}
            trends={trends}
            trendsLoading={trendsLoading}
          />
          <DashboardUserInsightsGrid
            roleDistribution={roleDistribution}
            roleLoading={roleLoading}
            topUsers={topUsers}
            topUsersLoading={topUsersLoading}
          />
        </div>
      </div>
    </div>
  );
}
