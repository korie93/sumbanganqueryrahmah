import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppQueryProvider } from "@/app/AppQueryProvider";
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
import { DashboardContentView } from "@/pages/dashboard/DashboardContentView";
import { resolveDashboardExportBlockReason } from "@/pages/dashboard/export-guards";
import {
  DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS,
  DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS,
  resolveVisibleDashboardRefetchInterval,
} from "@/pages/dashboard/refetch-visibility";
import type { LoginTrend, PeakHour, RoleData, SummaryData, TopUser } from "@/pages/dashboard/types";
import { buildSummaryCards, exportDashboardToPdf } from "@/pages/dashboard/utils";

function resolveDashboardQueryErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) {
      return message;
    }
  }

  return fallback;
}

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

  const {
    data: summary,
    error: summaryError,
    isError: summaryIsError,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery<SummaryData>({
    queryKey: ["/api/analytics/summary"],
    queryFn: ({ signal }) => getAnalyticsSummary({ signal }),
    staleTime: DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS,
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS),
    refetchIntervalInBackground: false,
    refetchOnReconnect: false,
  });

  const {
    data: trends,
    error: trendsError,
    isError: trendsIsError,
    isLoading: trendsLoading,
    refetch: refetchTrends,
  } = useQuery<LoginTrend[]>({
    queryKey: ["/api/analytics/login-trends", trendDays],
    queryFn: ({ signal }) => getLoginTrends(trendDays, { signal }),
    staleTime: DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS,
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS),
    refetchIntervalInBackground: false,
    refetchOnReconnect: false,
  });

  const {
    data: topUsers,
    error: topUsersError,
    isError: topUsersIsError,
    isLoading: topUsersLoading,
    refetch: refetchTopUsers,
  } = useQuery<TopUser[]>({
    queryKey: ["/api/analytics/top-users"],
    queryFn: ({ signal }) => getTopActiveUsers(10, { signal }),
    staleTime: DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS,
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS),
    refetchIntervalInBackground: false,
    refetchOnReconnect: false,
  });

  const {
    data: peakHours,
    error: peakHoursError,
    isError: peakHoursIsError,
    isLoading: peakHoursLoading,
    refetch: refetchPeakHours,
  } = useQuery<PeakHour[]>({
    queryKey: ["/api/analytics/peak-hours"],
    queryFn: ({ signal }) => getPeakHours({ signal }),
    staleTime: DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS,
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS),
    refetchIntervalInBackground: false,
    refetchOnReconnect: false,
  });

  const {
    data: roleDistribution,
    error: roleError,
    isError: roleIsError,
    isLoading: roleLoading,
    refetch: refetchRoles,
  } = useQuery<RoleData[]>({
    queryKey: ["/api/analytics/role-distribution"],
    queryFn: ({ signal }) => getRoleDistribution({ signal }),
    staleTime: DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS,
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS),
    refetchIntervalInBackground: false,
    refetchOnReconnect: false,
  });

  const summaryCards = useMemo(() => buildSummaryCards(summary), [summary]);
  const initialLoading = useMemo(
    () =>
      summary === undefined
      && trends === undefined
      && topUsers === undefined
      && peakHours === undefined
      && roleDistribution === undefined
      && summaryLoading
      && trendsLoading
      && topUsersLoading
      && peakHoursLoading
      && roleLoading,
    [
      peakHours,
      peakHoursLoading,
      roleDistribution,
      roleLoading,
      summary,
      summaryLoading,
      topUsers,
      topUsersLoading,
      trends,
      trendsLoading,
    ],
  );
  const pageErrorMessage = useMemo(() => {
    if (summaryIsError && summary === undefined && !summaryLoading) {
      return resolveDashboardQueryErrorMessage(
        summaryError,
        "The quick snapshot is unavailable right now. Please try refreshing the dashboard.",
      );
    }

    return null;
  }, [summary, summaryError, summaryIsError, summaryLoading]);
  const trendsErrorMessage = useMemo(() => {
    if (trendsIsError && trends === undefined && !trendsLoading) {
      return resolveDashboardQueryErrorMessage(
        trendsError,
        "Login trend data could not be loaded.",
      );
    }

    return null;
  }, [trends, trendsError, trendsIsError, trendsLoading]);
  const topUsersErrorMessage = useMemo(() => {
    if (topUsersIsError && topUsers === undefined && !topUsersLoading) {
      return resolveDashboardQueryErrorMessage(
        topUsersError,
        "Top active user data could not be loaded.",
      );
    }

    return null;
  }, [topUsers, topUsersError, topUsersIsError, topUsersLoading]);
  const peakHoursErrorMessage = useMemo(() => {
    if (peakHoursIsError && peakHours === undefined && !peakHoursLoading) {
      return resolveDashboardQueryErrorMessage(
        peakHoursError,
        "Peak activity hour data could not be loaded.",
      );
    }

    return null;
  }, [peakHours, peakHoursError, peakHoursIsError, peakHoursLoading]);
  const roleErrorMessage = useMemo(() => {
    if (roleIsError && roleDistribution === undefined && !roleLoading) {
      return resolveDashboardQueryErrorMessage(
        roleError,
        "User role distribution could not be loaded.",
      );
    }

    return null;
  }, [roleDistribution, roleError, roleIsError, roleLoading]);
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

  const handleRefreshClick = useCallback(() => {
    void handleRefreshAll();
  }, [handleRefreshAll]);

  const handleExportPdfClick = useCallback(() => {
    void handleExportPdf();
  }, [handleExportPdf]);

  const handleRetrySummary = useCallback(() => {
    void refetchSummary();
  }, [refetchSummary]);

  const handleRetryTrends = useCallback(() => {
    void refetchTrends();
  }, [refetchTrends]);

  const handleRetryTopUsers = useCallback(() => {
    void refetchTopUsers();
  }, [refetchTopUsers]);

  const handleRetryPeakHours = useCallback(() => {
    void refetchPeakHours();
  }, [refetchPeakHours]);

  const handleRetryRoles = useCallback(() => {
    void refetchRoles();
  }, [refetchRoles]);

  return (
    <DashboardContentView
      dashboardRef={dashboardRef}
      deferSecondary={shouldDeferSecondaryMobileSections}
      exportBlockReason={exportBlockReason}
      exportingPdf={exportingPdf}
      initialLoading={initialLoading}
      isMobile={isMobile}
      onExportPdf={handleExportPdfClick}
      onRefresh={handleRefreshClick}
      onRetryPeakHours={handleRetryPeakHours}
      onRetryRoleDistribution={handleRetryRoles}
      onRetryTopUsers={handleRetryTopUsers}
      onRetryTrends={pageErrorMessage ? handleRetrySummary : handleRetryTrends}
      pageErrorMessage={pageErrorMessage}
      peakHours={peakHours}
      peakHoursErrorMessage={peakHoursErrorMessage}
      peakHoursLoading={peakHoursLoading}
      refreshing={refreshing}
      roleDistribution={roleDistribution}
      roleErrorMessage={roleErrorMessage}
      roleLoading={roleLoading}
      summaryCards={summaryCards}
      summaryLoading={summaryLoading}
      topUsers={topUsers}
      topUsersErrorMessage={topUsersErrorMessage}
      topUsersLoading={topUsersLoading}
      trendDays={trendDays}
      trends={trends}
      trendsErrorMessage={pageErrorMessage ? null : trendsErrorMessage}
      trendsLoading={trendsLoading}
      onTrendDaysChange={setTrendDays}
    />
  );
}

export default function Dashboard() {
  return (
    <AppQueryProvider>
      <DashboardContent />
    </AppQueryProvider>
  );
}
