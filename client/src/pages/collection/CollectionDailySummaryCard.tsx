import { Card, CardContent } from "@/components/ui/card";
import type { CollectionDailyOverviewResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailySummaryCardProps = {
  overview: CollectionDailyOverviewResponse;
};

export function CollectionDailySummaryCard({ overview }: CollectionDailySummaryCardProps) {
  return (
    <Card className="border-border/60 bg-background/70">
      <CardContent className="space-y-3 pt-6">
        <div className="grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-4" data-testid="collection-daily-summary">
          <div>
            Monthly Target: <span className="font-semibold">{formatAmountRM(overview.summary.monthlyTarget)}</span>
          </div>
          <div>
            Collected: <span className="font-semibold">{formatAmountRM(overview.summary.collectedAmount)}</span>
          </div>
          <div>
            Balanced: <span className="font-semibold">{formatAmountRM(overview.summary.balancedAmount)}</span>
          </div>
          <div>
            Daily Target: <span className="font-semibold">{formatAmountRM(overview.summary.dailyTarget)}</span>
          </div>
          <div>
            Working Days: <span className="font-semibold">{overview.summary.workingDays}</span>
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
          Carry-forward rule: shortfall from a working day is added to the next working day target.
          Excess collection reduces future required target.
        </p>
      </CardContent>
    </Card>
  );
}
