import { Target, TrendingUp } from "lucide-react";
import type { CollectionDailyDayDetailsResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/pages/collection/CollectionDailyShared";
import {
  CollectionDayMetric,
  getProgressBarClass,
} from "@/pages/collection/CollectionDailyDayDetailsDialogParts";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailyDayDetailsSummaryProps = {
  balancedAmount: number;
  dayDetails: CollectionDailyDayDetailsResponse;
  targetProgressPercent: number;
};

export function CollectionDailyDayDetailsSummary({
  balancedAmount,
  dayDetails,
  targetProgressPercent,
}: CollectionDailyDayDetailsSummaryProps) {
  return (
    <section className="collection-day-financial-summary" aria-label="Target, kutipan dan baki harian">
      <div className="collection-day-financial-grid">
        <CollectionDayMetric
          icon={Target}
          label="Target"
          value={formatAmountRM(dayDetails.dailyTarget)}
        />
        <CollectionDayMetric
          icon={TrendingUp}
          label="Kutipan"
          className="collection-day-metric--collected"
          tone={dayDetails.status === "green" ? "success" : "default"}
          value={formatAmountRM(dayDetails.amount)}
        />
        <CollectionDayMetric
          icon={Target}
          label="Baki"
          tone={dayDetails.dailyTarget <= 0 ? "default" : balancedAmount > 0 ? "warning" : "success"}
          value={formatAmountRM(balancedAmount)}
        />
      </div>
      {dayDetails.dailyTarget > 0 ? (
        <div className="collection-day-progress-row">
          <span className="collection-day-progress-label">{statusLabel(dayDetails.status)}</span>
          <progress
            className={cn("collection-day-target-progress", getProgressBarClass(dayDetails.status))}
            aria-label="Daily target progress"
            value={targetProgressPercent}
            max={100}
          >
            {targetProgressPercent}% of target
          </progress>
          <span className="collection-day-progress-value">{targetProgressPercent}%</span>
        </div>
      ) : <p className="collection-day-no-target">Tiada target harian ditetapkan.</p>}
      {dayDetails.freshness && dayDetails.freshness.status !== "fresh" ? (
        <p className="collection-day-freshness-notice" role="status">{dayDetails.freshness.message}</p>
      ) : null}
    </section>
  );
}
