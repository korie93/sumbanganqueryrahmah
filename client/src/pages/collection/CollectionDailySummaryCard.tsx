import { CollectionReportFreshnessBadge } from "@/components/collection-report/CollectionReportFreshnessBadge";
import { Card, CardContent } from "@/components/ui/card";
import type { CollectionDailyOverviewResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailySummaryCardProps = {
  overview: CollectionDailyOverviewResponse;
};

export function CollectionDailySummaryCard({ overview }: CollectionDailySummaryCardProps) {
  const varianceClassName =
    overview.summary.progressVarianceAmount >= 0 ? "font-semibold text-green-700" : "font-semibold text-rose-700";
  const remainingTarget = overview.summary.remainingTarget ?? overview.summary.balancedAmount;
  const requiredPerRemainingWorkingDay =
    overview.summary.requiredPerRemainingWorkingDay
    || (overview.summary.remainingWorkingDays > 0
      ? remainingTarget / overview.summary.remainingWorkingDays
      : 0);

  return (
    <Card className="border-border/60 bg-background/70">
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Report Freshness</p>
            <p className="text-xs text-muted-foreground">
              {overview.freshness?.message || "Collection daily summary is using the latest available rollups."}
            </p>
          </div>
          <CollectionReportFreshnessBadge freshness={overview.freshness} />
        </div>
        <div className="grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-4" data-testid="collection-daily-summary">
          <div>
            Monthly Target: <span className="font-semibold">{formatAmountRM(overview.summary.monthlyTarget)}</span>
          </div>
          <div>
            Collected To Date: <span className="font-semibold">{formatAmountRM(overview.summary.collectedToDate ?? overview.summary.collectedAmount)}</span>
          </div>
          <div>
            Remaining Target: <span className="font-semibold">{formatAmountRM(remainingTarget)}</span>
          </div>
          <div>
            Base Daily Working-Day Target: <span className="font-semibold">{formatAmountRM(overview.summary.dailyTarget)}</span>
          </div>
          <div>
            Expected Progress: <span className="font-semibold">{formatAmountRM(overview.summary.expectedProgressAmount)}</span>
          </div>
          <div>
            Progress Variance: <span className={varianceClassName}>{formatAmountRM(overview.summary.progressVarianceAmount)}</span>
          </div>
          <div>
            Required Per Remaining Working Day: <span className="font-semibold">{formatAmountRM(requiredPerRemainingWorkingDay)}</span>
          </div>
          <div>
            Working Days: <span className="font-semibold">{overview.summary.workingDays}</span>
          </div>
          <div>
            Elapsed Working Days: <span className="font-semibold">{overview.summary.elapsedWorkingDays}</span>
          </div>
          <div>
            Remaining Working Days: <span className="font-semibold">{overview.summary.remainingWorkingDays}</span>
          </div>
          <div>
            Completed Days: <span className="font-semibold text-green-700">{overview.summary.completedDays}</span>
          </div>
          <div>
            Incomplete Days: <span className="font-semibold text-amber-700">{overview.summary.incompleteDays}</span>
          </div>
          <div>
            No Collection Days: <span className="font-semibold text-rose-700">{overview.summary.noCollectionDays}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Remaining target is always capped to monthly target minus collected amount. Daily requirement is recalculated
          from remaining target divided by remaining working days.
        </p>
      </CardContent>
    </Card>
  );
}
