import { Suspense, memo, startTransition, useEffect, useRef, useState } from "react";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { DashboardSectionBoundary } from "@/pages/dashboard/DashboardSectionBoundary";
import type { LoginTrend, PeakHour, RoleData, TopUser } from "@/pages/dashboard/types";

const DashboardChartsGrid = lazyWithPreload(() =>
  import("@/pages/dashboard/DashboardChartsGrid").then((module) => ({
    default: module.DashboardChartsGrid,
  })),
);
const DashboardUserInsightsGrid = lazyWithPreload(() =>
  import("@/pages/dashboard/DashboardUserInsightsGrid").then((module) => ({
    default: module.DashboardUserInsightsGrid,
  })),
);
const DEFERRED_DASHBOARD_SECTION_ROOT_MARGIN_DEFAULT = "320px 0px";
const DEFERRED_DASHBOARD_SECTION_TIMEOUT_MS_DEFAULT = 1_400;
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
      className={`bg-background/80 ${className ?? ""}`}
      contentClassName="space-y-4 p-6"
    >
      <div role="status" aria-live="polite" {...statusAriaLabelProps} className="space-y-4">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200/80 dark:bg-slate-700/80" />
        <div className={`animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-800/70 ${visualClassName}`} />
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
  onRetryRoleDistribution: () => void;
  onRetryTopUsers: () => void;
  onRetryTrends: () => void;
  trends: LoginTrend[] | undefined;
  trendsErrorMessage: string | null;
  trendsLoading: boolean;
  peakHours: PeakHour[] | undefined;
  peakHoursErrorMessage: string | null;
  peakHoursLoading: boolean;
  roleDistribution: RoleData[] | undefined;
  roleErrorMessage: string | null;
  roleLoading: boolean;
  topUsers: TopUser[] | undefined;
  topUsersErrorMessage: string | null;
  topUsersLoading: boolean;
};

export const DashboardDeferredSections = memo(function DashboardDeferredSections({
  defer,
  trendDays,
  onTrendDaysChange,
  onRetryPeakHours,
  onRetryRoleDistribution,
  onRetryTopUsers,
  onRetryTrends,
  trends,
  trendsErrorMessage,
  trendsLoading,
  peakHours,
  peakHoursErrorMessage,
  peakHoursLoading,
  roleDistribution,
  roleErrorMessage,
  roleLoading,
  topUsers,
  topUsersErrorMessage,
  topUsersLoading,
}: DashboardDeferredSectionsProps) {
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

  return (
    <>
      <div ref={chartsSection.triggerRef}>
        {chartsSection.shouldRender ? (
          <DashboardSectionBoundary
            boundaryKey={`dashboard-charts:${trendDays}:${trendsLoading ? "loading" : "ready"}:${peakHoursLoading ? "loading" : "ready"}`}
            panelLabel="Dashboard charts"
          >
            <Suspense fallback={<DashboardChartsFallback labelPrefix="Loading dashboard charts" />}>
              <DashboardChartsGrid
                onTrendDaysChange={onTrendDaysChange}
                onRetryPeakHours={onRetryPeakHours}
                onRetryTrends={onRetryTrends}
                peakHours={peakHours}
                peakHoursErrorMessage={peakHoursErrorMessage}
                peakHoursLoading={peakHoursLoading}
                trendDays={trendDays}
                trends={trends}
                trendsErrorMessage={trendsErrorMessage}
                trendsLoading={trendsLoading}
              />
            </Suspense>
          </DashboardSectionBoundary>
        ) : (
          <DashboardChartsFallback labelPrefix="Dashboard charts will load as you scroll" />
        )}
      </div>
      <div ref={userInsightsSection.triggerRef}>
        {userInsightsSection.shouldRender ? (
          <DashboardSectionBoundary
            boundaryKey={`dashboard-user-insights:${roleLoading ? "loading" : "ready"}:${topUsersLoading ? "loading" : "ready"}`}
            panelLabel="Dashboard user insights"
          >
            <Suspense fallback={<DashboardUserInsightsFallback labelPrefix="Loading dashboard user insights" />}>
              <DashboardUserInsightsGrid
                onRetryRoleDistribution={onRetryRoleDistribution}
                onRetryTopUsers={onRetryTopUsers}
                roleDistribution={roleDistribution}
                roleErrorMessage={roleErrorMessage}
                roleLoading={roleLoading}
                topUsers={topUsers}
                topUsersErrorMessage={topUsersErrorMessage}
                topUsersLoading={topUsersLoading}
              />
            </Suspense>
          </DashboardSectionBoundary>
        ) : (
          <DashboardUserInsightsFallback labelPrefix="Dashboard user insights will load as you scroll" />
        )}
      </div>
    </>
  );
});
