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
import { DashboardSectionRenderBoundary } from "@/pages/dashboard/DashboardSectionRenderBoundary";
import { DashboardSnapshotSection } from "@/pages/dashboard/DashboardSnapshotSection";
import {
  buildDashboardQueryErrorMessages,
  getDashboardQueryErrorDetail,
} from "@/pages/dashboard/dashboard-query-errors";
import { resolveDashboardExportBlockReason } from "@/pages/dashboard/export-guards";
import {
  DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS,
  DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS,
  resolveVisibleDashboardRefetchInterval,
} from "@/pages/dashboard/refetch-visibility";
import type { LoginTrend, PeakHour, RoleData, SummaryData, TopUser } from "@/pages/dashboard/types";
import { buildSummaryCards, exportDashboardToPdf } from "@/pages/dashboard/utils";

type DashboardRefetch = () => Promise<unknown>;

function getRejectedDashboardRefreshResults(results: PromiseSettledResult<unknown>[]) {
  return results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
}

function useDashboardRetryHandler(refetch: DashboardRefetch) {
  return useCallback(() => {
    void refetch();
  }, [refetch]);
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
  const lifecycleAbortControllerRef = useRef<AbortController | null>(null);

  const {
    data: summary,
    error: summaryError,
    isError: summaryIsError,
    isFetching: summaryFetching,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery<SummaryData>({
    queryKey: ["/api/analytics/summary"],
    queryFn: ({ signal }) => getAnalyticsSummary({ signal }),
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS),
    refetchIntervalInBackground: false,
  });

  const {
    data: trends,
    error: trendsError,
    isError: trendsIsError,
    isFetching: trendsFetching,
    isLoading: trendsLoading,
    refetch: refetchTrends,
  } = useQuery<LoginTrend[]>({
    queryKey: ["/api/analytics/login-trends", trendDays],
    queryFn: ({ signal }) => getLoginTrends(trendDays, { signal }),
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS),
    refetchIntervalInBackground: false,
  });

  const {
    data: topUsers,
    error: topUsersError,
    isError: topUsersIsError,
    isFetching: topUsersFetching,
    isLoading: topUsersLoading,
    refetch: refetchTopUsers,
  } = useQuery<TopUser[]>({
    queryKey: ["/api/analytics/top-users"],
    queryFn: ({ signal }) => getTopActiveUsers(10, { signal }),
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS),
    refetchIntervalInBackground: false,
  });

  const secondaryDashboardQueriesEnabled = !summaryLoading && !trendsLoading && !topUsersLoading;

  const {
    data: peakHours,
    error: peakHoursError,
    isError: peakHoursIsError,
    isFetching: peakHoursFetching,
    isLoading: peakHoursLoading,
    refetch: refetchPeakHours,
  } = useQuery<PeakHour[]>({
    queryKey: ["/api/analytics/peak-hours"],
    queryFn: ({ signal }) => getPeakHours({ signal }),
    enabled: secondaryDashboardQueriesEnabled,
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS),
    refetchIntervalInBackground: false,
  });

  const {
    data: roleDistribution,
    error: roleDistributionError,
    isError: roleDistributionIsError,
    isFetching: roleDistributionFetching,
    isLoading: roleLoading,
    refetch: refetchRoles,
  } = useQuery<RoleData[]>({
    queryKey: ["/api/analytics/role-distribution"],
    queryFn: ({ signal }) => getRoleDistribution({ signal }),
    enabled: secondaryDashboardQueriesEnabled,
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS),
    refetchIntervalInBackground: false,
  });

  const summaryCards = useMemo(() => buildSummaryCards(summary), [summary]);
  const summaryErrorMessage = useMemo(
    () => (summaryIsError ? getDashboardQueryErrorDetail(summaryError) : null),
    [summaryError, summaryIsError],
  );
  const trendsErrorMessage = useMemo(
    () => (trendsIsError ? getDashboardQueryErrorDetail(trendsError) : null),
    [trendsError, trendsIsError],
  );
  const topUsersErrorMessage = useMemo(
    () => (topUsersIsError ? getDashboardQueryErrorDetail(topUsersError) : null),
    [topUsersError, topUsersIsError],
  );
  const peakHoursErrorMessage = useMemo(
    () => (peakHoursIsError ? getDashboardQueryErrorDetail(peakHoursError) : null),
    [peakHoursError, peakHoursIsError],
  );
  const roleDistributionErrorMessage = useMemo(
    () => (roleDistributionIsError ? getDashboardQueryErrorDetail(roleDistributionError) : null),
    [roleDistributionError, roleDistributionIsError],
  );
  const exportBlockReason = useMemo(
    () => resolveDashboardExportBlockReason({ exportingPdf, refreshing }),
    [exportingPdf, refreshing],
  );
  const dashboardErrorMessages = useMemo(
    () =>
      buildDashboardQueryErrorMessages([
        { error: summaryError, failed: summaryIsError, label: "Ringkasan" },
        { error: trendsError, failed: trendsIsError, label: "Trend login" },
        { error: topUsersError, failed: topUsersIsError, label: "Pengguna aktif" },
        { error: peakHoursError, failed: peakHoursIsError, label: "Waktu puncak" },
        { error: roleDistributionError, failed: roleDistributionIsError, label: "Taburan peranan" },
      ]),
    [
      peakHoursError,
      peakHoursIsError,
      roleDistributionError,
      roleDistributionIsError,
      summaryError,
      summaryIsError,
      topUsersError,
      topUsersIsError,
      trendsError,
      trendsIsError,
    ],
  );
  const handleRetrySummary = useDashboardRetryHandler(refetchSummary);
  const handleRetryTrends = useDashboardRetryHandler(refetchTrends);
  const handleRetryTopUsers = useDashboardRetryHandler(refetchTopUsers);
  const handleRetryPeakHours = useDashboardRetryHandler(refetchPeakHours);
  const handleRetryRoles = useDashboardRetryHandler(refetchRoles);

  useEffect(() => {
    const controller = new AbortController();
    lifecycleAbortControllerRef.current = controller;
    return () => {
      controller.abort();
      if (lifecycleAbortControllerRef.current === controller) {
        lifecycleAbortControllerRef.current = null;
      }
      exportInFlightRef.current = false;
      refreshInFlightRef.current = false;
    };
  }, []);

  const isDashboardLifecycleActive = useCallback(() => {
    return lifecycleAbortControllerRef.current?.signal.aborted === false;
  }, []);

  const handleRefreshAll = useCallback(async () => {
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    setRefreshing(true);
    try {
      const results = await Promise.allSettled([
        refetchSummary(),
        refetchTrends(),
        refetchTopUsers(),
        refetchPeakHours(),
        refetchRoles(),
      ]);
      const failures = getRejectedDashboardRefreshResults(results);
      if (failures.length > 0) {
        for (const failure of failures) {
          logClientError("Dashboard refresh query failed:", failure.reason);
        }
        toast({
          title: "Refresh incomplete",
          description: "Some dashboard sections could not refresh. Existing section error states remain available.",
          variant: "destructive",
        });
      }
    } finally {
      refreshInFlightRef.current = false;
      if (isDashboardLifecycleActive()) {
        setRefreshing(false);
      }
    }
  }, [isDashboardLifecycleActive, refetchPeakHours, refetchRoles, refetchSummary, refetchTopUsers, refetchTrends]);

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
      if (isDashboardLifecycleActive()) {
        setExportingPdf(false);
      }
    }
  }, [exportBlockReason, isDashboardLifecycleActive]);

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

      <div ref={dashboardRef} className="space-y-4 sm:space-y-6" data-dashboard-export-root="true">
        {dashboardErrorMessages.length > 0 ? (
          <section
            className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            role="alert"
            aria-live="polite"
            data-testid="dashboard-error-state"
          >
            <p className="font-semibold">Sebahagian data dashboard gagal dimuat.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {dashboardErrorMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <DashboardSectionRenderBoundary
          sectionName="Ringkasan dashboard"
          boundaryKey={`summary:${summaryLoading}:${summaryErrorMessage ?? "ok"}:${summaryCards.length}`}
        >
          <DashboardSnapshotSection
            summaryCards={summaryCards}
            summaryErrorMessage={summaryErrorMessage}
            summaryLoading={summaryLoading}
            summaryRetrying={summaryFetching}
            onRetrySummary={handleRetrySummary}
          />
        </DashboardSectionRenderBoundary>
        <DashboardDeferredSections
          defer={shouldDeferSecondaryMobileSections}
          trendDays={trendDays}
          onTrendDaysChange={setTrendDays}
          onRetryPeakHours={handleRetryPeakHours}
          onRetryRoleDistribution={handleRetryRoles}
          onRetryTopUsers={handleRetryTopUsers}
          onRetryTrends={handleRetryTrends}
          trends={trends ?? []}
          trendsErrorMessage={trendsErrorMessage}
          trendsLoading={trendsLoading}
          trendsRetrying={trendsFetching}
          peakHours={peakHours ?? []}
          peakHoursErrorMessage={peakHoursErrorMessage}
          peakHoursLoading={!secondaryDashboardQueriesEnabled || peakHoursLoading}
          peakHoursRetrying={peakHoursFetching}
          roleDistribution={roleDistribution ?? []}
          roleErrorMessage={roleDistributionErrorMessage}
          roleLoading={!secondaryDashboardQueriesEnabled || roleLoading}
          roleRetrying={roleDistributionFetching}
          topUsers={topUsers ?? []}
          topUsersErrorMessage={topUsersErrorMessage}
          topUsersLoading={topUsersLoading}
          topUsersRetrying={topUsersFetching}
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
