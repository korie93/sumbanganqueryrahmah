import { Target, TrendingUp, Users } from "lucide-react";
import { CollectionReportFreshnessBadge } from "@/components/collection-report/CollectionReportFreshnessBadge";
import { Badge } from "@/components/ui/badge";
import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import { cn } from "@/lib/utils";
import { statusLabel, statusTextClass } from "@/pages/collection/CollectionDailyShared";
import {
  CollectionDayMetric,
  getProgressBarClass,
  getStatusPillClass,
} from "@/pages/collection/CollectionDailyDayDetailsDialogParts";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailyDayDetailsSummaryProps = {
  balancedAmount: number;
  customerCount: number;
  dayDetails: CollectionDailyDayDetailsResponse;
  selectedOverviewDay: CollectionDailyOverviewDay | null;
  targetProgressPercent: number;
};

export function CollectionDailyDayDetailsSummary({
  balancedAmount,
  customerCount,
  dayDetails,
  selectedOverviewDay,
  targetProgressPercent,
}: CollectionDailyDayDetailsSummaryProps) {
  return (
    <section className="space-y-4 rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", getStatusPillClass(dayDetails.status))}
            >
              {statusLabel(dayDetails.status)}
            </Badge>
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
              {customerCount} customers
            </Badge>
            {selectedOverviewDay?.isHoliday && selectedOverviewDay.holidayName ? (
              <Badge variant="outline" className="max-w-full rounded-full px-3 py-1 text-[11px]">
                <span className="truncate">Holiday: {selectedOverviewDay.holidayName}</span>
              </Badge>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {dayDetails.freshness?.message || "Day details are using the latest available rollups."}
          </p>
        </div>
        <CollectionReportFreshnessBadge freshness={dayDetails.freshness} />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-muted-foreground">Daily target progress</span>
          <span className={cn("font-semibold", statusTextClass(dayDetails.status))}>
            {targetProgressPercent}% of target
          </span>
        </div>
        <progress
          className={cn("collection-day-target-progress", getProgressBarClass(dayDetails.status))}
          aria-label="Daily target progress"
          value={targetProgressPercent}
          max={100}
        >
          {targetProgressPercent}% of target
        </progress>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
        <CollectionDayMetric
          icon={Target}
          label="Daily Target"
          value={formatAmountRM(dayDetails.dailyTarget)}
        />
        <CollectionDayMetric
          icon={TrendingUp}
          label="Collected"
          tone={dayDetails.status === "green" ? "success" : "default"}
          value={formatAmountRM(dayDetails.amount)}
        />
        <CollectionDayMetric
          icon={Target}
          label="Balanced"
          tone={balancedAmount > 0 ? "warning" : "success"}
          value={formatAmountRM(balancedAmount)}
        />
        <CollectionDayMetric
          icon={Users}
          label="Records"
          value={dayDetails.pagination.totalRecords}
        />
      </div>

      <p className="rounded-xl border border-border/50 bg-muted/10 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {dayDetails.message}
      </p>
    </section>
  );
}
