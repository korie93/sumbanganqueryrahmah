import { Suspense, lazy, startTransition, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { DashboardLoginReviewSidebar } from "@/pages/dashboard/DashboardLoginReviewSidebar";
import { DashboardSectionRenderBoundary } from "@/pages/dashboard/DashboardSectionRenderBoundary";
import type {
  LoginTrend,
  PeakHour,
  RecentLoginActivity,
  RecentLoginActivityFilter,
  RoleData,
  SummaryData,
  TopUser,
} from "@/pages/dashboard/types";

const DashboardChartsGrid = lazy(() =>
  import("@/pages/dashboard/DashboardChartsGrid").then((module) => ({
    default: module.DashboardChartsGrid,
  })),
);
const DashboardUserInsightsGrid = lazy(() =>
  import("@/pages/dashboard/DashboardUserInsightsGrid").then((module) => ({
    default: module.DashboardUserInsightsGrid,
  })),
);
const DashboardRecentLoginActivity = lazy(() =>
  import("@/pages/dashboard/DashboardRecentLoginActivity").then((module) => ({
    default: module.DashboardRecentLoginActivity,
  })),
);
const DashboardLoginRiskInsights = lazy(() =>
  import("@/pages/dashboard/DashboardLoginRiskInsights").then((module) => ({
    default: module.DashboardLoginRiskInsights,
  })),
);
const DEFERRED_DASHBOARD_SECTION_ROOT_MARGIN_DEFAULT = "320px 0px";
const DEFERRED_DASHBOARD_SECTION_TIMEOUT_MS_DEFAULT = 1_400;
const DASHBOARD_LOGIN_RISK_DEFER_ROOT_MARGIN = "340px 0px";
const DASHBOARD_LOGIN_RISK_DEFER_TIMEOUT_MS = 1_250;
const DASHBOARD_RECENT_ACTIVITY_DEFER_ROOT_MARGIN = "360px 0px";
const DASHBOARD_RECENT_ACTIVITY_DEFER_TIMEOUT_MS = 1_300;
const DASHBOARD_CHARTS_DEFER_ROOT_MARGIN = "260px 0px";
const DASHBOARD_CHARTS_DEFER_TIMEOUT_MS = 1_200;
const DASHBOARD_USER_INSIGHTS_DEFER_ROOT_MARGIN = "420px 0px";
const DASHBOARD_USER_INSIGHTS_DEFER_TIMEOUT_MS = 1_700;

function DashboardSectionFallback({
  className,
  label,
  visualClassName = "h-[220px]",
}: {
  className?: string;
  label: string;
  visualClassName?: string;
}) {
  const statusAriaLabelProps = label ? { "aria-label": label } : {};

  return (
    <OperationalSectionCard
      className={`border-border/60 bg-background shadow-sm ${className ?? ""}`}
      contentClassName="space-y-4 p-6"
    >
      <div role="status" aria-live="polite" {...statusAriaLabelProps} className="space-y-4">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200/80 dark:bg-muted" />
        <div className={`animate-pulse rounded-xl bg-slate-200/60 dark:bg-muted ${visualClassName}`} />
      </div>
    </OperationalSectionCard>
  );
}

function DashboardChartsFallback({ labelPrefix }: { labelPrefix: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
      <DashboardSectionFallback label={`${labelPrefix} login trends`} />
      <DashboardSectionFallback label={`${labelPrefix} peak hours`} />
    </div>
  );
}

function DashboardUserInsightsFallback({ labelPrefix }: { labelPrefix: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
      <DashboardSectionFallback
        label={`${labelPrefix} top active users`}
        visualClassName="h-[360px]"
      />
      <DashboardSectionFallback
        label={`${labelPrefix} user roles`}
        visualClassName="h-[360px]"
      />
    </div>
  );
}

function DashboardCollapsiblePanel({
  children,
  description,
  id,
  open,
  onOpenChange,
  title,
}: {
  children: ReactNode;
  description: string;
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const contentId = `${id}-content`;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="space-y-3" data-testid={`panel-${id}`}>
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-controls={contentId}
            {...getAriaExpandedProps(open)}
            className="h-10 rounded-xl sm:h-9"
            data-testid={`button-toggle-${id}`}
          >
            {open ? "Tutup" : "Buka"}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent id={contentId} className="min-w-0">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

type DeferredDashboardSectionOptions = {
  enabled: boolean;
  rootMargin?: string;
  timeoutMs?: number;
};

function useDeferredDashboardSectionMount({
  enabled,
  rootMargin = DEFERRED_DASHBOARD_SECTION_ROOT_MARGIN_DEFAULT,
  timeoutMs = DEFERRED_DASHBOARD_SECTION_TIMEOUT_MS_DEFAULT,
}: DeferredDashboardSectionOptions) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(() => !enabled);

  useEffect(() => {
    if (!enabled) {
      setShouldRender(true);
      return;
    }

    if (shouldRender) {
      return;
    }

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let timeoutHandle: number | null = null;

    const markReady = () => {
      if (cancelled) {
        return;
      }

      startTransition(() => {
        setShouldRender(true);
      });
    };

    if (typeof window.IntersectionObserver === "function" && triggerRef.current) {
      observer = new window.IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) {
            return;
          }

          observer?.disconnect();
          observer = null;
          markReady();
        },
        {
          rootMargin,
        },
      );
      observer.observe(triggerRef.current);
    } else {
      timeoutHandle = window.setTimeout(markReady, timeoutMs);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      observer = null;
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [enabled, rootMargin, shouldRender, timeoutMs]);

  return { shouldRender, triggerRef };
}

type DashboardDeferredSectionsProps = {
  canViewExactNetwork: boolean;
  defer: boolean;
  trendDays: number;
  onTrendDaysChange: (days: number) => void;
  onRetryPeakHours: () => void;
  onRetryRecentLoginActivity: () => void;
  onRetryRoleDistribution: () => void;
  onRetryTopUsers: () => void;
  onRetryTrends: () => void;
  onCleanupEndedLoginActivities?: (() => void) | undefined;
  onClearRecentLoginActivityFilters: () => void;
  onRecentLoginActivityDateFromChange: (value: string) => void;
  onRecentLoginActivityDateToChange: (value: string) => void;
  onDeleteEndedLoginActivity?: ((activity: RecentLoginActivity) => void) | undefined;
  onRecentLoginActivityFilterChange: (filter: RecentLoginActivityFilter) => void;
  onRecentLoginActivityPageChange: (page: number) => void;
  onRecentLoginActivityPageSizeChange: (pageSize: number) => void;
  onRecentLoginActivityRoleChange: (role: string) => void;
  onRecentLoginActivitySearchChange: (value: string) => void;
  onRecentLoginActivitySortChange: (value: string) => void;
  peakHoursErrorMessage: string | null;
  trends: LoginTrend[] | undefined;
  trendsErrorMessage: string | null;
  trendsLoading: boolean;
  trendsRetrying: boolean;
  peakHours: PeakHour[] | undefined;
  peakHoursLoading: boolean;
  peakHoursRetrying: boolean;
  recentLoginActivities: RecentLoginActivity[] | undefined;
  recentLoginActivityDateFrom: string;
  recentLoginActivityDateTo: string;
  recentLoginActivityFilter: RecentLoginActivityFilter;
  recentLoginActivityFilterCounts: Record<RecentLoginActivityFilter, number>;
  recentLoginActivityPage: number;
  recentLoginActivityPageItems: RecentLoginActivity[] | undefined;
  recentLoginActivityPageSize: number;
  recentLoginActivityRole: string;
  recentLoginActivitySearch: string;
  recentLoginActivitySort: string;
  recentLoginActivityTotalItems: number;
  recentLoginActivityTotalPages: number;
  recentLoginActivityCleaningEndedLogs?: boolean | undefined;
  recentLoginActivityDeletingId?: string | null | undefined;
  recentLoginActivityErrorMessage: string | null;
  recentLoginActivityLoading: boolean;
  recentLoginActivityRetrying: boolean;
  recentLoginActivitySnapshotLoading: boolean;
  roleDistribution: RoleData[] | undefined;
  roleErrorMessage: string | null;
  roleLoading: boolean;
  roleRetrying: boolean;
  summary: SummaryData | undefined;
  summaryLoading: boolean;
  topUsers: TopUser[] | undefined;
  topUsersErrorMessage: string | null;
  topUsersLoading: boolean;
  topUsersRetrying: boolean;
};

export function DashboardDeferredSections({
  canViewExactNetwork,
  defer,
  trendDays,
  onTrendDaysChange,
  onRetryPeakHours,
  onRetryRecentLoginActivity,
  onRetryRoleDistribution,
  onRetryTopUsers,
  onRetryTrends,
  onCleanupEndedLoginActivities,
  onClearRecentLoginActivityFilters,
  onRecentLoginActivityDateFromChange,
  onRecentLoginActivityDateToChange,
  onDeleteEndedLoginActivity,
  onRecentLoginActivityFilterChange,
  onRecentLoginActivityPageChange,
  onRecentLoginActivityPageSizeChange,
  onRecentLoginActivityRoleChange,
  onRecentLoginActivitySearchChange,
  onRecentLoginActivitySortChange,
  peakHoursErrorMessage,
  trends,
  trendsErrorMessage,
  trendsLoading,
  trendsRetrying,
  peakHours,
  peakHoursLoading,
  peakHoursRetrying,
  recentLoginActivities,
  recentLoginActivityDateFrom,
  recentLoginActivityDateTo,
  recentLoginActivityFilter,
  recentLoginActivityFilterCounts,
  recentLoginActivityPage,
  recentLoginActivityPageItems,
  recentLoginActivityPageSize,
  recentLoginActivityRole,
  recentLoginActivitySearch,
  recentLoginActivitySort,
  recentLoginActivityTotalItems,
  recentLoginActivityTotalPages,
  recentLoginActivityCleaningEndedLogs,
  recentLoginActivityDeletingId,
  recentLoginActivityErrorMessage,
  recentLoginActivityLoading,
  recentLoginActivityRetrying,
  recentLoginActivitySnapshotLoading,
  roleDistribution,
  roleErrorMessage,
  roleLoading,
  roleRetrying,
  summary,
  summaryLoading,
  topUsers,
  topUsersErrorMessage,
  topUsersLoading,
  topUsersRetrying,
}: DashboardDeferredSectionsProps) {
  const loginRiskSection = useDeferredDashboardSectionMount({
    enabled: defer,
    rootMargin: DASHBOARD_LOGIN_RISK_DEFER_ROOT_MARGIN,
    timeoutMs: DASHBOARD_LOGIN_RISK_DEFER_TIMEOUT_MS,
  });
  const recentLoginActivitySection = useDeferredDashboardSectionMount({
    enabled: defer,
    rootMargin: DASHBOARD_RECENT_ACTIVITY_DEFER_ROOT_MARGIN,
    timeoutMs: DASHBOARD_RECENT_ACTIVITY_DEFER_TIMEOUT_MS,
  });
  const chartsSection = useDeferredDashboardSectionMount({
    enabled: defer,
    rootMargin: DASHBOARD_CHARTS_DEFER_ROOT_MARGIN,
    timeoutMs: DASHBOARD_CHARTS_DEFER_TIMEOUT_MS,
  });
  const userInsightsSection = useDeferredDashboardSectionMount({
    enabled: defer,
    rootMargin: DASHBOARD_USER_INSIGHTS_DEFER_ROOT_MARGIN,
    timeoutMs: DASHBOARD_USER_INSIGHTS_DEFER_TIMEOUT_MS,
  });
  const [loginRiskOpen, setLoginRiskOpen] = useState(true);
  const [recentActivityOpen, setRecentActivityOpen] = useState(true);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [userInsightsOpen, setUserInsightsOpen] = useState(false);
  const chartsBoundaryKey = [
    "charts",
    trendDays,
    trendsLoading,
    peakHoursLoading,
    trendsErrorMessage ?? "ok",
    peakHoursErrorMessage ?? "ok",
  ].join(":");
  const userInsightsBoundaryKey = [
    "user-insights",
    topUsersLoading,
    roleLoading,
    topUsersErrorMessage ?? "ok",
    roleErrorMessage ?? "ok",
  ].join(":");
  const recentLoginActivityBoundaryKey = [
    "recent-login-activity",
    recentLoginActivityLoading,
    recentLoginActivityErrorMessage ?? "ok",
    recentLoginActivityPageItems?.length ?? 0,
    recentLoginActivityPage,
    recentLoginActivityFilter,
  ].join(":");
  const loginRiskBoundaryKey = [
    "login-risk-insights",
    summaryLoading,
    trendsLoading,
    recentLoginActivitySnapshotLoading,
    summary?.loginFailures24h ?? 0,
    recentLoginActivities?.length ?? 0,
  ].join(":");

  return (
    <section
      className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(250px,320px)_minmax(0,1fr)] xl:items-start"
      aria-label="Dashboard login review workspace"
    >
      <aside
        className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(var(--viewport-min-height-value)-2rem)] xl:overflow-y-auto xl:pr-1 scroll-fade-y"
        aria-label="Dashboard login review sidebar"
        data-testid="dashboard-login-review-sidebar-container"
      >
        <DashboardLoginReviewSidebar
          loading={summaryLoading || trendsLoading || recentLoginActivitySnapshotLoading}
          peakHours={peakHours}
          recentLoginActivities={recentLoginActivities}
          summary={summary}
          topUsers={topUsers}
          trends={trends}
        />
      </aside>
      <div className="min-w-0 space-y-4">
        <div className="min-w-0 space-y-4">
          <div id="dashboard-login-risk-insights" ref={loginRiskSection.triggerRef} className="min-w-0 scroll-mt-24">
            <DashboardCollapsiblePanel
              id="dashboard-login-risk-insights-panel"
              title="Risk insights"
              description="Signal risiko utama dan tindakan terbaik untuk login."
              open={loginRiskOpen}
              onOpenChange={setLoginRiskOpen}
            >
              {loginRiskSection.shouldRender ? (
                <DashboardSectionRenderBoundary
                  sectionName="Insight risiko login dashboard"
                  boundaryKey={loginRiskBoundaryKey}
                >
                  <Suspense
                    fallback={
                      <DashboardSectionFallback
                        label="Loading login risk insights"
                        visualClassName="h-[220px]"
                      />
                    }
                  >
                    <DashboardLoginRiskInsights
                      loading={summaryLoading || trendsLoading || recentLoginActivitySnapshotLoading}
                      recentLoginActivities={recentLoginActivities}
                      summary={summary}
                      trends={trends}
                    />
                  </Suspense>
                </DashboardSectionRenderBoundary>
              ) : (
                <DashboardSectionFallback
                  label="Login risk insights will load as you scroll"
                  visualClassName="h-[220px]"
                />
              )}
            </DashboardCollapsiblePanel>
          </div>
          <div id="dashboard-recent-login-activity" ref={recentLoginActivitySection.triggerRef} className="min-w-0 scroll-mt-24">
            <DashboardCollapsiblePanel
              id="dashboard-recent-login-activity-panel"
              title="Recent activity"
              description="Rekod login terbaru dengan fokus kepada event yang perlu semakan."
              open={recentActivityOpen}
              onOpenChange={setRecentActivityOpen}
            >
              {recentLoginActivitySection.shouldRender ? (
                <DashboardSectionRenderBoundary
                  sectionName="Aktiviti login dashboard"
                  boundaryKey={recentLoginActivityBoundaryKey}
                >
                  <Suspense
                    fallback={
                      <DashboardSectionFallback
                        label="Loading recent login activity"
                        visualClassName="h-[260px]"
                      />
                    }
                  >
                    <DashboardRecentLoginActivity
                      activities={recentLoginActivityPageItems}
                      canViewExactNetwork={canViewExactNetwork}
                      cleaningEndedActivityLogs={recentLoginActivityCleaningEndedLogs}
                      deletingActivityId={recentLoginActivityDeletingId}
                      dateFrom={recentLoginActivityDateFrom}
                      dateTo={recentLoginActivityDateTo}
                      errorMessage={recentLoginActivityErrorMessage}
                      filterCounts={recentLoginActivityFilterCounts}
                      loading={recentLoginActivityLoading}
                      onCleanupEndedActivities={onCleanupEndedLoginActivities}
                      onClearFilters={onClearRecentLoginActivityFilters}
                      onDateFromChange={onRecentLoginActivityDateFromChange}
                      onDateToChange={onRecentLoginActivityDateToChange}
                      onDeleteEndedActivity={onDeleteEndedLoginActivity}
                      onFilterChange={onRecentLoginActivityFilterChange}
                      onPageChange={onRecentLoginActivityPageChange}
                      onPageSizeChange={onRecentLoginActivityPageSizeChange}
                      onRoleChange={onRecentLoginActivityRoleChange}
                      onRetry={onRetryRecentLoginActivity}
                      onSearchChange={onRecentLoginActivitySearchChange}
                      onSortChange={onRecentLoginActivitySortChange}
                      page={recentLoginActivityPage}
                      pageSize={recentLoginActivityPageSize}
                      role={recentLoginActivityRole}
                      retrying={recentLoginActivityRetrying}
                      search={recentLoginActivitySearch}
                      selectedFilter={recentLoginActivityFilter}
                      sort={recentLoginActivitySort}
                      totalItems={recentLoginActivityTotalItems}
                      totalPages={recentLoginActivityTotalPages}
                    />
                  </Suspense>
                </DashboardSectionRenderBoundary>
              ) : (
                <DashboardSectionFallback
                  label="Recent login activity will load as you scroll"
                  visualClassName="h-[260px]"
                />
              )}
            </DashboardCollapsiblePanel>
          </div>
        </div>
        <div id="dashboard-login-charts" ref={chartsSection.triggerRef} className="scroll-mt-24">
          <DashboardCollapsiblePanel
            id="dashboard-login-charts-panel"
            title="Charts"
            description="Trend dan waktu puncak login, dibuka bila perlu analisis visual."
            open={chartsOpen}
            onOpenChange={setChartsOpen}
          >
            {chartsSection.shouldRender ? (
              <DashboardSectionRenderBoundary
                sectionName="Carta dashboard"
                boundaryKey={chartsBoundaryKey}
              >
                <Suspense fallback={<DashboardChartsFallback labelPrefix="Loading dashboard charts" />}>
                  <DashboardChartsGrid
                    onTrendDaysChange={onTrendDaysChange}
                    onRetryPeakHours={onRetryPeakHours}
                    onRetryTrends={onRetryTrends}
                    peakHoursErrorMessage={peakHoursErrorMessage}
                    peakHours={peakHours}
                    peakHoursLoading={peakHoursLoading}
                    peakHoursRetrying={peakHoursRetrying}
                    trendDays={trendDays}
                    trendsErrorMessage={trendsErrorMessage}
                    trends={trends}
                    trendsLoading={trendsLoading}
                    trendsRetrying={trendsRetrying}
                  />
                </Suspense>
              </DashboardSectionRenderBoundary>
            ) : (
              <DashboardChartsFallback labelPrefix="Dashboard charts will load as you scroll" />
            )}
          </DashboardCollapsiblePanel>
        </div>
        <div id="dashboard-user-insights" ref={userInsightsSection.triggerRef} className="scroll-mt-24">
          <DashboardCollapsiblePanel
            id="dashboard-user-insights-panel"
            title="User insights"
            description="Pengguna aktif dan taburan peranan, disimpan sebagai detail sekunder."
            open={userInsightsOpen}
            onOpenChange={setUserInsightsOpen}
          >
            {userInsightsSection.shouldRender ? (
              <DashboardSectionRenderBoundary
                sectionName="Insight pengguna dashboard"
                boundaryKey={userInsightsBoundaryKey}
              >
                <Suspense fallback={<DashboardUserInsightsFallback labelPrefix="Loading dashboard user insights" />}>
                  <DashboardUserInsightsGrid
                    onRetryRoleDistribution={onRetryRoleDistribution}
                    onRetryTopUsers={onRetryTopUsers}
                    roleErrorMessage={roleErrorMessage}
                    roleDistribution={roleDistribution}
                    roleLoading={roleLoading}
                    roleRetrying={roleRetrying}
                    topUsersErrorMessage={topUsersErrorMessage}
                    topUsers={topUsers}
                    topUsersLoading={topUsersLoading}
                    topUsersRetrying={topUsersRetrying}
                  />
                </Suspense>
              </DashboardSectionRenderBoundary>
            ) : (
              <DashboardUserInsightsFallback labelPrefix="Dashboard user insights will load as you scroll" />
            )}
          </DashboardCollapsiblePanel>
        </div>
      </div>
    </section>
  );
}
