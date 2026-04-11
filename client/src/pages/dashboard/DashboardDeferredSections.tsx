import { Suspense, lazy, startTransition, useEffect, useRef, useState } from "react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import type { LoginTrend, PeakHour, RoleData, TopUser } from "@/pages/dashboard/types";

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

function DashboardSectionFallback({
  className,
  label,
  visualClassName = "h-[220px]",
}: {
  className?: string;
  label: string;
  visualClassName?: string;
}) {
  return (
    <OperationalSectionCard
      className={`bg-background/80 ${className ?? ""}`}
      contentClassName="space-y-4 p-6"
    >
      <div role="status" aria-live="polite" aria-label={label} className="space-y-4">
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
  rootMargin = "320px 0px",
  timeoutMs = 1400,
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
  trends: LoginTrend[] | undefined;
  trendsLoading: boolean;
  peakHours: PeakHour[] | undefined;
  peakHoursLoading: boolean;
  roleDistribution: RoleData[] | undefined;
  roleLoading: boolean;
  topUsers: TopUser[] | undefined;
  topUsersLoading: boolean;
};

export function DashboardDeferredSections({
  defer,
  trendDays,
  onTrendDaysChange,
  trends,
  trendsLoading,
  peakHours,
  peakHoursLoading,
  roleDistribution,
  roleLoading,
  topUsers,
  topUsersLoading,
}: DashboardDeferredSectionsProps) {
  const chartsSection = useDeferredDashboardSectionMount({
    enabled: defer,
    rootMargin: "260px 0px",
    timeoutMs: 1200,
  });
  const userInsightsSection = useDeferredDashboardSectionMount({
    enabled: defer,
    rootMargin: "420px 0px",
    timeoutMs: 1700,
  });

  return (
    <>
      <div ref={chartsSection.triggerRef}>
        {chartsSection.shouldRender ? (
          <Suspense fallback={<DashboardChartsFallback labelPrefix="Loading dashboard charts" />}>
            <DashboardChartsGrid
              onTrendDaysChange={onTrendDaysChange}
              peakHours={peakHours}
              peakHoursLoading={peakHoursLoading}
              trendDays={trendDays}
              trends={trends}
              trendsLoading={trendsLoading}
            />
          </Suspense>
        ) : (
          <DashboardChartsFallback labelPrefix="Dashboard charts will load as you scroll" />
        )}
      </div>
      <div ref={userInsightsSection.triggerRef}>
        {userInsightsSection.shouldRender ? (
          <Suspense fallback={<DashboardUserInsightsFallback labelPrefix="Loading dashboard user insights" />}>
            <DashboardUserInsightsGrid
              roleDistribution={roleDistribution}
              roleLoading={roleLoading}
              topUsers={topUsers}
              topUsersLoading={topUsersLoading}
            />
          </Suspense>
        ) : (
          <DashboardUserInsightsFallback labelPrefix="Dashboard user insights will load as you scroll" />
        )}
      </div>
    </>
  );
}
