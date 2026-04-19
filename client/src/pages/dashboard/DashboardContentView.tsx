import type { RefObject } from "react";
import { OperationalPage, OperationalPageHeader, OperationalSectionCard } from "@/components/layout/OperationalPage";
import { QueryErrorFallback } from "@/components/QueryErrorFallback";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardDeferredSections } from "@/pages/dashboard/DashboardDeferredSections";
import { DashboardPageHeader } from "@/pages/dashboard/DashboardPageHeader";
import { DashboardSectionBoundary } from "@/pages/dashboard/DashboardSectionBoundary";
import { DashboardSnapshotSection } from "@/pages/dashboard/DashboardSnapshotSection";
import type { LoginTrend, PeakHour, RoleData, SummaryCardItem, TopUser } from "@/pages/dashboard/types";

type DashboardContentViewProps = {
  dashboardRef: RefObject<HTMLDivElement>;
  deferSecondary: boolean;
  exportBlockReason: string | null;
  exportingPdf: boolean;
  initialLoading: boolean;
  isMobile: boolean;
  onExportPdf: () => void;
  onRefresh: () => void;
  onRetryPeakHours: () => void;
  onRetryRoleDistribution: () => void;
  onRetryTopUsers: () => void;
  onRetryTrends: () => void;
  pageErrorMessage: string | null;
  peakHours: PeakHour[] | undefined;
  peakHoursErrorMessage: string | null;
  peakHoursLoading: boolean;
  refreshing: boolean;
  roleDistribution: RoleData[] | undefined;
  roleErrorMessage: string | null;
  roleLoading: boolean;
  summaryCards: SummaryCardItem[];
  summaryLoading: boolean;
  topUsers: TopUser[] | undefined;
  topUsersErrorMessage: string | null;
  topUsersLoading: boolean;
  trendDays: number;
  trends: LoginTrend[] | undefined;
  trendsErrorMessage: string | null;
  trendsLoading: boolean;
  onTrendDaysChange: (days: number) => void;
};

function DashboardHeaderSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <OperationalPageHeader
      title={<Skeleton className="h-8 w-56" />}
      eyebrow={<Skeleton className="h-4 w-20" />}
      description={<Skeleton className="h-4 w-full max-w-3xl" />}
      badge={
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      }
      actions={
        <>
          <Skeleton className={`h-11 rounded-md ${isMobile ? "w-full" : "w-36"}`} />
          <Skeleton className={`h-11 rounded-md ${isMobile ? "w-full" : "w-32"}`} />
        </>
      }
      className={isMobile ? "rounded-[28px] border-border/60 bg-background/85" : undefined}
    />
  );
}

export function DashboardContentView({
  dashboardRef,
  deferSecondary,
  exportBlockReason,
  exportingPdf,
  initialLoading,
  isMobile,
  onExportPdf,
  onRefresh,
  onRetryPeakHours,
  onRetryRoleDistribution,
  onRetryTopUsers,
  onRetryTrends,
  pageErrorMessage,
  peakHours,
  peakHoursErrorMessage,
  peakHoursLoading,
  refreshing,
  roleDistribution,
  roleErrorMessage,
  roleLoading,
  summaryCards,
  summaryLoading,
  topUsers,
  topUsersErrorMessage,
  topUsersLoading,
  trendDays,
  trends,
  trendsErrorMessage,
  trendsLoading,
  onTrendDaysChange,
}: DashboardContentViewProps) {
  if (initialLoading) {
    return (
      <OperationalPage width="content">
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading dashboard analytics"
          aria-busy="true"
          className="space-y-4 sm:space-y-6"
        >
          <DashboardHeaderSkeleton isMobile={isMobile} />
          <DashboardSnapshotSection summaryCards={summaryCards} summaryLoading />
          <DashboardDeferredSections
            defer={false}
            trendDays={trendDays}
            onTrendDaysChange={onTrendDaysChange}
            trends={undefined}
            trendsLoading
            trendsErrorMessage={null}
            onRetryTrends={onRetryTrends}
            peakHours={undefined}
            peakHoursLoading
            peakHoursErrorMessage={null}
            onRetryPeakHours={onRetryPeakHours}
            roleDistribution={undefined}
            roleLoading
            roleErrorMessage={null}
            onRetryRoleDistribution={onRetryRoleDistribution}
            topUsers={undefined}
            topUsersLoading
            topUsersErrorMessage={null}
            onRetryTopUsers={onRetryTopUsers}
          />
        </div>
      </OperationalPage>
    );
  }

  return (
    <OperationalPage width="content">
      <DashboardPageHeader
        isMobile={isMobile}
        trendDays={trendDays}
        exportingPdf={exportingPdf}
        exportBlockReason={pageErrorMessage ?? exportBlockReason}
        refreshing={refreshing}
        onExportPdf={onExportPdf}
        onRefresh={onRefresh}
      />

      {pageErrorMessage ? (
        <OperationalSectionCard contentClassName="p-6">
          <QueryErrorFallback
            title="Dashboard data could not be loaded"
            description={pageErrorMessage}
            onRetry={onRefresh}
            data-testid="dashboard-page-error"
          />
        </OperationalSectionCard>
      ) : (
        <div ref={dashboardRef} className="space-y-4 sm:space-y-6">
          <DashboardSectionBoundary
            boundaryKey={`dashboard-snapshot:${summaryLoading ? "loading" : "ready"}:${summaryCards.length}`}
            panelLabel="Dashboard snapshot"
          >
            <DashboardSnapshotSection summaryCards={summaryCards} summaryLoading={summaryLoading} />
          </DashboardSectionBoundary>
          <DashboardDeferredSections
            defer={deferSecondary}
            trendDays={trendDays}
            onTrendDaysChange={onTrendDaysChange}
            trends={trends}
            trendsLoading={trendsLoading}
            trendsErrorMessage={trendsErrorMessage}
            onRetryTrends={onRetryTrends}
            peakHours={peakHours}
            peakHoursLoading={peakHoursLoading}
            peakHoursErrorMessage={peakHoursErrorMessage}
            onRetryPeakHours={onRetryPeakHours}
            roleDistribution={roleDistribution}
            roleLoading={roleLoading}
            roleErrorMessage={roleErrorMessage}
            onRetryRoleDistribution={onRetryRoleDistribution}
            topUsers={topUsers}
            topUsersLoading={topUsersLoading}
            topUsersErrorMessage={topUsersErrorMessage}
            onRetryTopUsers={onRetryTopUsers}
          />
        </div>
      )}
    </OperationalPage>
  );
}
