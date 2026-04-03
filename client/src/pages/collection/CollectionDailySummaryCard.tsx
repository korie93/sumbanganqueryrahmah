import { CollectionReportFreshnessBadge } from "@/components/collection-report/CollectionReportFreshnessBadge";
import {
  OperationalMetric,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionDailyOverviewResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailySummaryCardProps = {
  overview: CollectionDailyOverviewResponse;
};

export function CollectionDailySummaryCard({ overview }: CollectionDailySummaryCardProps) {
  const isMobile = useIsMobile();
  const remainingTarget = overview.summary.remainingTarget ?? overview.summary.balancedAmount;
  const requiredPerRemainingWorkingDay =
    overview.summary.requiredPerRemainingWorkingDay
    || (overview.summary.remainingWorkingDays > 0
      ? remainingTarget / overview.summary.remainingWorkingDays
      : 0);
  const summaryMetrics = [
    { label: "Monthly Target", value: formatAmountRM(overview.summary.monthlyTarget) },
    { label: "Collected To Date", value: formatAmountRM(overview.summary.collectedToDate ?? overview.summary.collectedAmount), tone: "success" as const },
    { label: "Remaining Target", value: formatAmountRM(remainingTarget), tone: remainingTarget > 0 ? "warning" as const : "success" as const },
    { label: "Base Daily Target", value: formatAmountRM(overview.summary.dailyTarget) },
    { label: "Expected Progress", value: formatAmountRM(overview.summary.expectedProgressAmount) },
    { label: "Progress Variance", value: formatAmountRM(overview.summary.progressVarianceAmount), tone: overview.summary.progressVarianceAmount >= 0 ? "success" as const : "danger" as const },
    { label: "Required Per Remaining Day", value: formatAmountRM(requiredPerRemainingWorkingDay) },
    { label: "Working Days", value: overview.summary.workingDays },
    { label: "Elapsed Working Days", value: overview.summary.elapsedWorkingDays },
    { label: "Remaining Working Days", value: overview.summary.remainingWorkingDays },
    { label: "Completed Days", value: overview.summary.completedDays, tone: "success" as const },
    { label: "Incomplete Days", value: overview.summary.incompleteDays, tone: "warning" as const },
    { label: "No Collection Days", value: overview.summary.noCollectionDays, tone: "danger" as const },
  ];

  return (
    <OperationalSectionCard
      title="Daily Performance Summary"
      description={overview.freshness?.message || "Collection daily summary is using the latest available rollups."}
      badge={<CollectionReportFreshnessBadge freshness={overview.freshness} />}
    >
        <OperationalSummaryStrip
          className={`grid gap-3 ${isMobile ? "grid-cols-1 sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4"}`}
          data-testid="collection-daily-summary"
        >
          {summaryMetrics.map((metric) => (
            <OperationalMetric
              key={metric.label}
              label={metric.label}
              value={metric.value}
              tone={metric.tone}
            />
          ))}
        </OperationalSummaryStrip>
        {!isMobile ? (
          <p className="ops-inline-note">
            Remaining target is always capped to monthly target minus collected amount. Daily requirement is recalculated
            from remaining target divided by remaining working days.
          </p>
        ) : null}
    </OperationalSectionCard>
  );
}
