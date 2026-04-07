import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppQueryProvider } from "@/app/AppQueryProvider";
import { Download, RefreshCw } from "lucide-react";
import {
  OperationalPage,
  OperationalPageHeader,
  OperationalSectionCard,
} from "@/components/layout/OperationalPage";
import {
  getAnalyticsSummary,
  getLoginTrends,
  getPeakHours,
  getRoleDistribution,
  getTopActiveUsers,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
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
    <OperationalSectionCard
      className="bg-background/80"
      contentClassName="space-y-4 p-6"
    >
      <div role="status" aria-live="polite" aria-label={label} className="space-y-4">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200/80 dark:bg-slate-700/80" />
        <div className="h-[220px] animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-800/70" />
      </div>
    </OperationalSectionCard>
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

function DashboardContent() {
  const isMobile = useIsMobile();
  const shouldDeferSecondaryMobileSections =
    isMobile || (typeof window !== "undefined" && window.innerWidth < 768);
  const [trendDays, setTrendDays] = useState(7);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const exportInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const chartsSection = useDeferredDashboardSectionMount({
    enabled: shouldDeferSecondaryMobileSections,
    rootMargin: "260px 0px",
    timeoutMs: 1200,
  });
  const userInsightsSection = useDeferredDashboardSectionMount({
    enabled: shouldDeferSecondaryMobileSections,
    rootMargin: "420px 0px",
    timeoutMs: 1700,
  });

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
      const description = error instanceof Error ? error.message : "Unknown error. Try on desktop browser.";
      console.error("Failed to export PDF:", error instanceof Error ? error.message : error);
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
      <OperationalPageHeader
        title={<span data-testid="text-dashboard-title">Dashboard Analytics</span>}
        eyebrow="Insights"
        description={
          isMobile
            ? "System health, activity, and usage insights in one mobile-friendly view."
            : "System overview and activity insights."
        }
        badge={
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Trend {trendDays}d
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              7 summary cards
            </Badge>
          </div>
        }
        actions={
          <>
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
          </>
        }
        className={isMobile ? "rounded-[28px] border-border/60 bg-background/85" : undefined}
      />

      <div ref={dashboardRef} className="space-y-4 sm:space-y-6">
        <OperationalSectionCard
          title="Quick Snapshot"
          description="Core user, session, import, and conflict counts in a shared admin summary strip."
          contentClassName="space-y-0"
        >
          <DashboardSummaryCards items={summaryCards} summaryLoading={summaryLoading} />
        </OperationalSectionCard>

        <div ref={chartsSection.triggerRef}>
          {chartsSection.shouldRender ? (
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
          ) : (
            <DashboardSectionFallback label="Dashboard charts will load as you scroll" />
          )}
        </div>
        <div ref={userInsightsSection.triggerRef}>
          {userInsightsSection.shouldRender ? (
            <Suspense fallback={<DashboardSectionFallback label="Loading dashboard user insights" />}>
              <DashboardUserInsightsGrid
                roleDistribution={roleDistribution}
                roleLoading={roleLoading}
                topUsers={topUsers}
                topUsersLoading={topUsersLoading}
              />
            </Suspense>
          ) : (
            <DashboardSectionFallback label="Dashboard user insights will load as you scroll" />
          )}
        </div>
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
