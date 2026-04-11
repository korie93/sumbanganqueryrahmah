import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppQueryProvider } from "@/app/AppQueryProvider";
import { OperationalPage } from "@/components/layout/OperationalPage";
import {
  getAnalyticsSummary,
  getLoginTrends,
  getPeakHours,
  getRoleDistribution,
  getTopActiveUsers,
} from "@/lib/api";
import { logClientError } from "@/lib/client-logger";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { isMobileViewportWidth } from "@/lib/responsive";
import { DashboardDeferredSections } from "@/pages/dashboard/DashboardDeferredSections";
import { DashboardPageHeader } from "@/pages/dashboard/DashboardPageHeader";
import { DashboardSnapshotSection } from "@/pages/dashboard/DashboardSnapshotSection";
import { resolveDashboardExportBlockReason } from "@/pages/dashboard/export-guards";
import { resolveVisibleDashboardRefetchInterval } from "@/pages/dashboard/refetch-visibility";
import type { LoginTrend, PeakHour, RoleData, SummaryData, TopUser } from "@/pages/dashboard/types";
import { buildSummaryCards, exportDashboardToPdf } from "@/pages/dashboard/utils";

function DashboardContent() {
  const isMobile = useIsMobile();
  const shouldDeferSecondaryMobileSections =
    isMobile || (typeof window !== "undefined" && isMobileViewportWidth(window.innerWidth));
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
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(30_000),
    refetchIntervalInBackground: false,
  });

  const { data: trends, isLoading: trendsLoading, refetch: refetchTrends } = useQuery<LoginTrend[]>({
    queryKey: ["/api/analytics/login-trends", trendDays],
    queryFn: ({ signal }) => getLoginTrends(trendDays, { signal }),
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(30_000),
    refetchIntervalInBackground: false,
  });

  const { data: topUsers, isLoading: topUsersLoading, refetch: refetchTopUsers } = useQuery<TopUser[]>({
    queryKey: ["/api/analytics/top-users"],
    queryFn: ({ signal }) => getTopActiveUsers(10, { signal }),
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(30_000),
    refetchIntervalInBackground: false,
  });

  const { data: peakHours, isLoading: peakHoursLoading, refetch: refetchPeakHours } = useQuery<PeakHour[]>({
    queryKey: ["/api/analytics/peak-hours"],
    queryFn: ({ signal }) => getPeakHours({ signal }),
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(60_000),
    refetchIntervalInBackground: false,
  });

  const { data: roleDistribution, isLoading: roleLoading, refetch: refetchRoles } = useQuery<RoleData[]>({
    queryKey: ["/api/analytics/role-distribution"],
    queryFn: ({ signal }) => getRoleDistribution({ signal }),
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(60_000),
    refetchIntervalInBackground: false,
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
      const description = error instanceof Error ? error.message : "Unknown error. Try on desktop browser.";
      logClientError("Failed to export dashboard PDF:", error);
      toast({
        title: "Export PDF Failed",
        description,
        variant: "destructive",
      });
    } finally {
      exportInFlightRef.current = false;
      if (mountedRef.current) {
        setExportingPdf(false);
      }
    }
  }, [exportBlockReason]);

  return (
    <OperationalPage width="content">
      <DashboardPageHeader
        isMobile={isMobile}
        trendDays={trendDays}
        exportingPdf={exportingPdf}
        exportBlockReason={exportBlockReason}
        refreshing={refreshing}
        onExportPdf={() => {
          void handleExportPdf();
        }}
        onRefresh={() => {
          void handleRefreshAll();
        }}
      />

      <div ref={dashboardRef} className="space-y-4 sm:space-y-6">
        <DashboardSnapshotSection summaryCards={summaryCards} summaryLoading={summaryLoading} />
        <DashboardDeferredSections
          defer={shouldDeferSecondaryMobileSections}
          trendDays={trendDays}
          onTrendDaysChange={setTrendDays}
          trends={trends}
          trendsLoading={trendsLoading}
          peakHours={peakHours}
          peakHoursLoading={peakHoursLoading}
          roleDistribution={roleDistribution}
          roleLoading={roleLoading}
          topUsers={topUsers}
          topUsersLoading={topUsersLoading}
        />
      </div>
    </OperationalPage>
  );
}

export default function Dashboard() {
  return (
    <AppQueryProvider>
      <DashboardContent />
    </AppQueryProvider>
  );
}
