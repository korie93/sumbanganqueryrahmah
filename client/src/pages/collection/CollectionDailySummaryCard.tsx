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

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function CollectionDailySummaryCard({ overview }: CollectionDailySummaryCardProps) {
  const isMobile = useIsMobile();
  const remainingTarget = overview.summary.remainingTarget ?? overview.summary.balancedAmount;
  const requiredPerRemainingWorkingDay =
    overview.summary.requiredPerRemainingWorkingDay
    || (overview.summary.remainingWorkingDays > 0
      ? remainingTarget / overview.summary.remainingWorkingDays
      : 0);
  const monthlyTargetProgress = clampPercent(
    overview.summary.monthlyTarget > 0
      ? ((overview.summary.collectedToDate ?? overview.summary.collectedAmount) / overview.summary.monthlyTarget) * 100
      : 0,
  );
  const progressStatus =
    remainingTarget <= 0
      ? "Monthly target completed"
      : `${monthlyTargetProgress.toFixed(1)}% of monthly target collected`;
  const primaryMetrics = [
    { label: "Monthly Target", value: formatAmountRM(overview.summary.monthlyTarget) },
    { label: "Collected To Date", value: formatAmountRM(overview.summary.collectedToDate ?? overview.summary.collectedAmount), tone: "success" as const },
    { label: "Remaining Target", value: formatAmountRM(remainingTarget), tone: remainingTarget > 0 ? "warning" as const : "success" as const },
    { label: "Required Per Remaining Day", value: formatAmountRM(requiredPerRemainingWorkingDay) },
  ];
  const supportingMetrics = [
    { label: "Base Daily Target", value: formatAmountRM(overview.summary.dailyTarget) },
    { label: "Expected Progress", value: formatAmountRM(overview.summary.expectedProgressAmount) },
    { label: "Progress Variance", value: formatAmountRM(overview.summary.progressVarianceAmount), tone: overview.summary.progressVarianceAmount >= 0 ? "success" as const : "danger" as const },
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
      contentClassName="space-y-4"
    >
      <OperationalSummaryStrip
        className={`grid gap-3 ${isMobile ? "grid-cols-1 sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4"}`}
        data-testid="collection-daily-summary"
      >
        {primaryMetrics.map((metric) => (
          <OperationalMetric
            key={metric.label}
            label={metric.label}
            value={metric.value}
            tone={metric.tone}
          />
        ))}
      </OperationalSummaryStrip>

      <section className="collection-daily-progress-panel" aria-label="Monthly target progress">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Target Progress</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">{progressStatus}</p>
          </div>
          <p className="text-sm font-semibold text-foreground">{formatAmountRM(remainingTarget)} remaining</p>
        </div>
        <progress
          className="collection-daily-progress mt-3"
          max={100}
          value={monthlyTargetProgress}
          aria-label="Monthly target progress"
        />
        <div className="collection-daily-progress-facts mt-3">
          <span>Elapsed {overview.summary.elapsedWorkingDays}/{overview.summary.workingDays} working days</span>
          <span>{overview.summary.completedDays} completed days</span>
          <span>{overview.summary.remainingWorkingDays} remaining working days</span>
        </div>
      </section>

      <div className="collection-daily-supporting-panel rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Supporting Indicators</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Use these figures to judge pacing, progress variance, and working-day balance without crowding the top summary.
          </p>
        </div>
        <OperationalSummaryStrip
          className={`mt-4 grid gap-3 ${isMobile ? "grid-cols-1 sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}
        >
          {supportingMetrics.map((metric) => (
            <OperationalMetric
              key={metric.label}
              label={metric.label}
              value={metric.value}
              tone={metric.tone}
            />
          ))}
        </OperationalSummaryStrip>
      </div>

      {!isMobile ? (
        <p className="ops-inline-note">
          Remaining target is always capped to monthly target minus collected amount. Daily requirement is recalculated
          from remaining target divided by remaining working days.
        </p>
      ) : null}
    </OperationalSectionCard>
  );
}
