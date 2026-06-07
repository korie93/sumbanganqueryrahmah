import { Suspense, lazy, startTransition, useEffect, useRef, useState } from "react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { DashboardActionQueue } from "@/pages/dashboard/DashboardActionQueue";
import { DashboardSectionRenderBoundary } from "@/pages/dashboard/DashboardSectionRenderBoundary";
import { DashboardSessionHealthStrip } from "@/pages/dashboard/DashboardSessionHealthStrip";
import type {
  LoginTrend,
  PeakHour,
  RecentLoginActivity,
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
      <DashboardSectionFallback
        className="lg:col-span-2"
        label={`${labelPrefix} top active users`}
        visualClassName="h-[300px]"
      />
      <DashboardSectionFallback
        label={`${labelPrefix} user roles`}
        visualClassName="h-[260px]"
      />
    </div>
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
  defer: boolean;
  trendDays: number;
  onTrendDaysChange: (days: number) => void;
  onRetryPeakHours: () => void;
  onRetryRecentLoginActivity: () => void;
  onRetryRoleDistribution: () => void;
  onRetryTopUsers: () => void;
  onRetryTrends: () => void;
  peakHoursErrorMessage: string | null;
  trends: LoginTrend[] | undefined;
  trendsErrorMessage: string | null;
  trendsLoading: boolean;
  trendsRetrying: boolean;
  peakHours: PeakHour[] | undefined;
  peakHoursLoading: boolean;
  peakHoursRetrying: boolean;
  recentLoginActivities: RecentLoginActivity[] | undefined;
  recentLoginActivityErrorMessage: string | null;
  recentLoginActivityLoading: boolean;
  recentLoginActivityRetrying: boolean;
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
  defer,
  trendDays,
  onTrendDaysChange,
  onRetryPeakHours,
  onRetryRecentLoginActivity,
  onRetryRoleDistribution,
  onRetryTopUsers,
  onRetryTrends,
  peakHoursErrorMessage,
  trends,
  trendsErrorMessage,
  trendsLoading,
  trendsRetrying,
  peakHours,
  peakHoursLoading,
  peakHoursRetrying,
  recentLoginActivities,
  recentLoginActivityErrorMessage,
  recentLoginActivityLoading,
  recentLoginActivityRetrying,
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
    recentLoginActivities?.length ?? 0,
  ].join(":");
  const loginRiskBoundaryKey = [
    "login-risk-insights",
    summaryLoading,
    trendsLoading,
    recentLoginActivityLoading,
    summary?.loginFailures24h ?? 0,
    recentLoginActivities?.length ?? 0,
  ].join(":");

  return (
    <>
      <section className="space-y-4" aria-label="Dashboard login review workspace">
        <DashboardActionQueue
          loading={summaryLoading || trendsLoading || recentLoginActivityLoading}
          recentLoginActivities={recentLoginActivities}
          summary={summary}
          trends={trends}
        />
        <DashboardSessionHealthStrip
          loading={recentLoginActivityLoading}
          recentLoginActivities={recentLoginActivities}
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:items-start">
          <div ref={loginRiskSection.triggerRef}>
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
                    loading={summaryLoading || trendsLoading || recentLoginActivityLoading}
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
          </div>
          <div ref={recentLoginActivitySection.triggerRef}>
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
                    activities={recentLoginActivities}
                    errorMessage={recentLoginActivityErrorMessage}
                    loading={recentLoginActivityLoading}
                    onRetry={onRetryRecentLoginActivity}
                    retrying={recentLoginActivityRetrying}
                  />
                </Suspense>
              </DashboardSectionRenderBoundary>
            ) : (
              <DashboardSectionFallback
                label="Recent login activity will load as you scroll"
                visualClassName="h-[260px]"
              />
            )}
          </div>
        </div>
      </section>
      <div ref={chartsSection.triggerRef}>
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
      </div>
      <div ref={userInsightsSection.triggerRef}>
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
      </div>
    </>
  );
}
