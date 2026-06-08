import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { AppQueryProvider } from "@/app/AppQueryProvider";
import { OperationalPage } from "@/components/layout/OperationalPage";
import {
  cleanupEndedActivityLogs,
  deleteActivityLog,
  getAnalyticsSummary,
  getLoginTrends,
  getPeakHours,
  getRecentLoginActivity,
  getRecentLoginActivityPage,
  getRoleDistribution,
  getTopActiveUsers,
} from "@/lib/api";
import { logClientError } from "@/lib/client-logger";
import { queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { isMobileViewportWidth } from "@/lib/responsive";
import { DashboardDeferredSections } from "@/pages/dashboard/DashboardDeferredSections";
import { DashboardLoginCommandBar } from "@/pages/dashboard/DashboardLoginCommandBar";
import { DashboardLoginFocusStrip } from "@/pages/dashboard/DashboardLoginFocusStrip";
import { DashboardLoginIncidentTimeline } from "@/pages/dashboard/DashboardLoginIncidentTimeline";
import { DashboardLoginSituationSummary } from "@/pages/dashboard/DashboardLoginSituationSummary";
import { DashboardPageHeader } from "@/pages/dashboard/DashboardPageHeader";
import { DashboardSectionRenderBoundary } from "@/pages/dashboard/DashboardSectionRenderBoundary";
import { DashboardSnapshotSection } from "@/pages/dashboard/DashboardSnapshotSection";
import {
  buildDashboardQueryErrorMessages,
  getDashboardQueryErrorDetail,
} from "@/pages/dashboard/dashboard-query-errors";
import { resolveDashboardLatestUpdatedAt } from "@/pages/dashboard/dashboard-freshness";
import { resolveDashboardExportBlockReason } from "@/pages/dashboard/export-guards";
import {
  DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS,
  DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS,
  resolveVisibleDashboardRefetchInterval,
} from "@/pages/dashboard/refetch-visibility";
import type {
  LoginTrend,
  PeakHour,
  RecentLoginActivity,
  RecentLoginActivityFilter,
  RecentLoginActivityPage,
  RoleData,
  SummaryData,
  TopUser,
} from "@/pages/dashboard/types";
import { buildSummaryCards, exportDashboardToPdf } from "@/pages/dashboard/utils";

type DashboardRefetch = () => Promise<unknown>;
const RECENT_LOGIN_ACTIVITY_CLEANUP_DAYS = 30;
const RECENT_LOGIN_ACTIVITY_CLEANUP_LIMIT = 500;
const RECENT_LOGIN_ACTIVITY_DEFAULT_PAGE_SIZE = 4;

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
  const [recentLoginActivityDateFrom, setRecentLoginActivityDateFrom] = useState("");
  const [recentLoginActivityDateTo, setRecentLoginActivityDateTo] = useState("");
  const [recentLoginActivityFilter, setRecentLoginActivityFilter] =
    useState<RecentLoginActivityFilter>("all");
  const [recentLoginActivityPageNumber, setRecentLoginActivityPageNumber] = useState(1);
  const [recentLoginActivityPageSize, setRecentLoginActivityPageSize] =
    useState(RECENT_LOGIN_ACTIVITY_DEFAULT_PAGE_SIZE);
  const [recentLoginActivitySearch, setRecentLoginActivitySearch] = useState("");
  const deferredRecentLoginActivitySearch = useDeferredValue(recentLoginActivitySearch.trim());
  const [exportingPdf, setExportingPdf] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const exportInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const lifecycleAbortControllerRef = useRef<AbortController | null>(null);

  const {
    data: summary,
    dataUpdatedAt: summaryUpdatedAt,
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
    dataUpdatedAt: trendsUpdatedAt,
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
    dataUpdatedAt: topUsersUpdatedAt,
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

  const {
    data: recentLoginActivities,
    dataUpdatedAt: recentLoginActivityUpdatedAt,
    error: recentLoginActivityError,
    isError: recentLoginActivityIsError,
    isLoading: recentLoginActivityLoading,
    refetch: refetchRecentLoginActivity,
  } = useQuery<RecentLoginActivity[]>({
    queryKey: ["/api/analytics/recent-login-activity"],
    queryFn: ({ signal }) => getRecentLoginActivity(8, { signal }),
    refetchInterval: () => resolveVisibleDashboardRefetchInterval(DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS),
    refetchIntervalInBackground: false,
  });

  const recentLoginActivityPageQuery = useMemo(
    () => ({
      page: recentLoginActivityPageNumber,
      pageSize: recentLoginActivityPageSize,
      status: recentLoginActivityFilter,
      ...(recentLoginActivityDateFrom ? { dateFrom: recentLoginActivityDateFrom } : {}),
      ...(recentLoginActivityDateTo ? { dateTo: recentLoginActivityDateTo } : {}),
      ...(deferredRecentLoginActivitySearch
        ? { search: deferredRecentLoginActivitySearch }
        : {}),
    }),
    [
      deferredRecentLoginActivitySearch,
      recentLoginActivityDateFrom,
      recentLoginActivityDateTo,
      recentLoginActivityFilter,
      recentLoginActivityPageNumber,
      recentLoginActivityPageSize,
    ],
  );
  const {
    data: recentLoginActivityPage,
    error: recentLoginActivityPageError,
    isError: recentLoginActivityPageIsError,
    isFetching: recentLoginActivityPageFetching,
    isLoading: recentLoginActivityPageLoading,
    refetch: refetchRecentLoginActivityPage,
  } = useQuery<RecentLoginActivityPage>({
    queryKey: [
      "/api/analytics/recent-login-activity-page",
      recentLoginActivityPageQuery,
    ],
    queryFn: ({ signal }) =>
      getRecentLoginActivityPage(recentLoginActivityPageQuery, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: () =>
      resolveVisibleDashboardRefetchInterval(DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS),
    refetchIntervalInBackground: false,
  });

  const secondaryDashboardQueriesEnabled = !summaryLoading && !trendsLoading && !topUsersLoading;

  const {
    data: peakHours,
    dataUpdatedAt: peakHoursUpdatedAt,
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
    dataUpdatedAt: roleDistributionUpdatedAt,
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
  const recentLoginActivityErrorMessage = useMemo(
    () => (
      recentLoginActivityPageIsError
        ? getDashboardQueryErrorDetail(recentLoginActivityPageError)
        : null
    ),
    [recentLoginActivityPageError, recentLoginActivityPageIsError],
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
  const latestDashboardUpdatedAt = useMemo(
    () =>
      resolveDashboardLatestUpdatedAt([
        summaryUpdatedAt,
        trendsUpdatedAt,
        topUsersUpdatedAt,
        recentLoginActivityUpdatedAt,
        peakHoursUpdatedAt,
        roleDistributionUpdatedAt,
      ]),
    [
      peakHoursUpdatedAt,
      recentLoginActivityUpdatedAt,
      roleDistributionUpdatedAt,
      summaryUpdatedAt,
      topUsersUpdatedAt,
      trendsUpdatedAt,
    ],
  );
  const dashboardErrorMessages = useMemo(
    () =>
      buildDashboardQueryErrorMessages([
        { error: summaryError, failed: summaryIsError, label: "Ringkasan" },
        { error: trendsError, failed: trendsIsError, label: "Trend login" },
        { error: topUsersError, failed: topUsersIsError, label: "Pengguna aktif" },
        { error: recentLoginActivityError, failed: recentLoginActivityIsError, label: "Aktiviti login" },
        { error: peakHoursError, failed: peakHoursIsError, label: "Waktu puncak" },
        { error: roleDistributionError, failed: roleDistributionIsError, label: "Taburan peranan" },
      ]),
    [
      peakHoursError,
      peakHoursIsError,
      roleDistributionError,
      roleDistributionIsError,
      recentLoginActivityError,
      recentLoginActivityIsError,
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
  const handleRetryRecentLoginActivity = useDashboardRetryHandler(refetchRecentLoginActivityPage);
  const handleRetryPeakHours = useDashboardRetryHandler(refetchPeakHours);
  const handleRetryRoles = useDashboardRetryHandler(refetchRoles);
  const deleteRecentLoginActivityMutation = useMutation<unknown, Error, RecentLoginActivity>({
    mutationFn: async (activity) => {
      if (!activity.id || activity.status !== "ended") {
        throw new Error("Only ended login activity logs can be deleted from the dashboard.");
      }
      return deleteActivityLog(activity.id);
    },
    onSuccess: async (_result, activity) => {
      toast({
        title: "Login log deleted",
        description: `Ended login activity for ${activity.username} has been removed.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/recent-login-activity"] });
      await queryClient.invalidateQueries({
        queryKey: ["/api/analytics/recent-login-activity-page"],
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
    onError: (error, activity) => {
      logClientError("Failed to delete recent login activity:", error, {
        activityStatus: activity.status,
        hasActivityId: Boolean(activity.id),
      });
      toast({
        title: "Delete login log failed",
        description: error.message || "Unable to delete the ended login activity log.",
        variant: "destructive",
      });
    },
  });
  const cleanupEndedLoginActivityMutation = useMutation<
    Awaited<ReturnType<typeof cleanupEndedActivityLogs>>,
    Error,
    void
  >({
    mutationFn: async () =>
      cleanupEndedActivityLogs({
        limit: RECENT_LOGIN_ACTIVITY_CLEANUP_LIMIT,
        olderThanDays: RECENT_LOGIN_ACTIVITY_CLEANUP_DAYS,
      }),
    onSuccess: async (result) => {
      toast({
        title: "Old login logs cleaned",
        description:
          result.deletedCount > 0
            ? `${result.deletedCount} ended login logs older than ${result.olderThanDays} days were removed.`
            : `No ended login logs older than ${result.olderThanDays} days were found.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/recent-login-activity"] });
      await queryClient.invalidateQueries({
        queryKey: ["/api/analytics/recent-login-activity-page"],
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
    onError: (error) => {
      logClientError("Failed to clean up ended login activity logs:", error, {
        limit: RECENT_LOGIN_ACTIVITY_CLEANUP_LIMIT,
        olderThanDays: RECENT_LOGIN_ACTIVITY_CLEANUP_DAYS,
      });
      toast({
        title: "Cleanup login logs failed",
        description: error.message || "Unable to clean up old ended login activity logs.",
        variant: "destructive",
      });
    },
  });
  const handleDeleteEndedLoginActivity = useCallback(
    (activity: RecentLoginActivity) => {
      deleteRecentLoginActivityMutation.mutate(activity);
    },
    [deleteRecentLoginActivityMutation],
  );
  const handleCleanupEndedLoginActivities = useCallback(() => {
    cleanupEndedLoginActivityMutation.mutate();
  }, [cleanupEndedLoginActivityMutation]);
  const handleRecentLoginActivityFilterChange = useCallback((filter: RecentLoginActivityFilter) => {
    setRecentLoginActivityFilter(filter);
    setRecentLoginActivityPageNumber(1);
  }, []);
  const handleRecentLoginActivityPageSizeChange = useCallback((pageSize: number) => {
    setRecentLoginActivityPageSize(pageSize);
    setRecentLoginActivityPageNumber(1);
  }, []);
  const handleRecentLoginActivitySearchChange = useCallback((value: string) => {
    setRecentLoginActivitySearch(value);
    setRecentLoginActivityPageNumber(1);
  }, []);
  const handleRecentLoginActivityDateFromChange = useCallback((value: string) => {
    setRecentLoginActivityDateFrom(value);
    setRecentLoginActivityDateTo((current) =>
      current && value && current < value ? value : current);
    setRecentLoginActivityPageNumber(1);
  }, []);
  const handleRecentLoginActivityDateToChange = useCallback((value: string) => {
    setRecentLoginActivityDateTo(value);
    setRecentLoginActivityDateFrom((current) =>
      current && value && current > value ? value : current);
    setRecentLoginActivityPageNumber(1);
  }, []);
  const handleClearRecentLoginActivityFilters = useCallback(() => {
    setRecentLoginActivityDateFrom("");
    setRecentLoginActivityDateTo("");
    setRecentLoginActivityFilter("all");
    setRecentLoginActivityPageNumber(1);
    setRecentLoginActivitySearch("");
  }, []);

  useEffect(() => {
    const serverPage = recentLoginActivityPage?.pagination.page;
    if (serverPage && serverPage !== recentLoginActivityPageNumber) {
      setRecentLoginActivityPageNumber(serverPage);
    }
  }, [recentLoginActivityPage?.pagination.page, recentLoginActivityPageNumber]);

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
        refetchRecentLoginActivity(),
        refetchRecentLoginActivityPage(),
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
  }, [
    isDashboardLifecycleActive,
    refetchPeakHours,
    refetchRecentLoginActivity,
    refetchRecentLoginActivityPage,
    refetchRoles,
    refetchSummary,
    refetchTopUsers,
    refetchTrends,
  ]);

  const handleExportPdf = useCallback(async () => {
    if (!dashboardRef.current || exportBlockReason || exportInFlightRef.current) return;

    exportInFlightRef.current = true;
    setExportingPdf(true);
    try {
      await exportDashboardToPdf(dashboardRef.current, {
        peakHours: peakHours ?? [],
        recentLoginActivities: recentLoginActivities ?? [],
        summary,
        topUsers: topUsers ?? [],
        trends: trends ?? [],
      });
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
  }, [exportBlockReason, isDashboardLifecycleActive, peakHours, recentLoginActivities, summary, topUsers, trends]);

  return (
    <OperationalPage width="content">
      <DashboardPageHeader
        isMobile={isMobile}
        kpiCount={summaryCards.length}
        trendDays={trendDays}
        hasDashboardErrors={dashboardErrorMessages.length > 0}
        latestUpdatedAt={latestDashboardUpdatedAt}
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
        <DashboardLoginCommandBar
          loading={summaryLoading || trendsLoading || recentLoginActivityLoading}
          recentLoginActivities={recentLoginActivities ?? []}
          summary={summary}
          trends={trends ?? []}
        />
        <DashboardLoginFocusStrip />
        <DashboardLoginSituationSummary
          loading={summaryLoading || trendsLoading || recentLoginActivityLoading}
          recentLoginActivities={recentLoginActivities ?? []}
          summary={summary}
          trends={trends ?? []}
        />
        <DashboardLoginIncidentTimeline
          loading={summaryLoading || trendsLoading || recentLoginActivityLoading}
          recentLoginActivities={recentLoginActivities ?? []}
          summary={summary}
          trends={trends ?? []}
        />
        <div id="dashboard-login-snapshot" className="scroll-mt-24">
          <DashboardSectionRenderBoundary
            sectionName="Ringkasan dashboard"
            boundaryKey={`summary:${summaryLoading}:${summaryErrorMessage ?? "ok"}:${summaryCards.length}`}
          >
            <DashboardSnapshotSection
              summary={summary}
              summaryCards={summaryCards}
              summaryErrorMessage={summaryErrorMessage}
              summaryLoading={summaryLoading}
              summaryRetrying={summaryFetching}
              onRetrySummary={handleRetrySummary}
            />
          </DashboardSectionRenderBoundary>
        </div>
        <DashboardDeferredSections
          defer={shouldDeferSecondaryMobileSections}
          trendDays={trendDays}
          onTrendDaysChange={setTrendDays}
          onRetryPeakHours={handleRetryPeakHours}
          onRetryRecentLoginActivity={handleRetryRecentLoginActivity}
          onRetryRoleDistribution={handleRetryRoles}
          onRetryTopUsers={handleRetryTopUsers}
          onRetryTrends={handleRetryTrends}
          onCleanupEndedLoginActivities={handleCleanupEndedLoginActivities}
          onClearRecentLoginActivityFilters={handleClearRecentLoginActivityFilters}
          onRecentLoginActivityDateFromChange={handleRecentLoginActivityDateFromChange}
          onRecentLoginActivityDateToChange={handleRecentLoginActivityDateToChange}
          onDeleteEndedLoginActivity={handleDeleteEndedLoginActivity}
          onRecentLoginActivityFilterChange={handleRecentLoginActivityFilterChange}
          onRecentLoginActivityPageChange={setRecentLoginActivityPageNumber}
          onRecentLoginActivityPageSizeChange={handleRecentLoginActivityPageSizeChange}
          onRecentLoginActivitySearchChange={handleRecentLoginActivitySearchChange}
          trends={trends ?? []}
          trendsErrorMessage={trendsErrorMessage}
          trendsLoading={trendsLoading}
          trendsRetrying={trendsFetching}
          peakHours={peakHours ?? []}
          peakHoursErrorMessage={peakHoursErrorMessage}
          peakHoursLoading={!secondaryDashboardQueriesEnabled || peakHoursLoading}
          peakHoursRetrying={peakHoursFetching}
          recentLoginActivities={recentLoginActivities ?? []}
          recentLoginActivityDateFrom={recentLoginActivityDateFrom}
          recentLoginActivityDateTo={recentLoginActivityDateTo}
          recentLoginActivityFilter={recentLoginActivityFilter}
          recentLoginActivityFilterCounts={recentLoginActivityPage?.filterCounts ?? {
            active: 0,
            all: 0,
            attention: 0,
            ended: 0,
          }}
          recentLoginActivityPage={recentLoginActivityPage?.pagination.page ?? recentLoginActivityPageNumber}
          recentLoginActivityPageItems={recentLoginActivityPage?.activities ?? []}
          recentLoginActivityPageSize={recentLoginActivityPage?.pagination.pageSize ?? recentLoginActivityPageSize}
          recentLoginActivitySearch={recentLoginActivitySearch}
          recentLoginActivityTotalItems={recentLoginActivityPage?.pagination.totalItems ?? 0}
          recentLoginActivityTotalPages={recentLoginActivityPage?.pagination.totalPages ?? 1}
          recentLoginActivityCleaningEndedLogs={cleanupEndedLoginActivityMutation.isPending}
          recentLoginActivityDeletingId={deleteRecentLoginActivityMutation.variables?.id ?? null}
          recentLoginActivityErrorMessage={recentLoginActivityErrorMessage}
          recentLoginActivityLoading={recentLoginActivityPageLoading}
          recentLoginActivityRetrying={recentLoginActivityPageFetching}
          recentLoginActivitySnapshotLoading={recentLoginActivityLoading}
          roleDistribution={roleDistribution ?? []}
          roleErrorMessage={roleDistributionErrorMessage}
          roleLoading={!secondaryDashboardQueriesEnabled || roleLoading}
          roleRetrying={roleDistributionFetching}
          summary={summary}
          summaryLoading={summaryLoading}
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
