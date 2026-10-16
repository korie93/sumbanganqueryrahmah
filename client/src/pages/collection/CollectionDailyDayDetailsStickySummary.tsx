import { ClipboardList, Users } from "lucide-react";
import { CollectionReportFreshnessBadge } from "@/components/collection-report/CollectionReportFreshnessBadge";
import { Badge } from "@/components/ui/badge";
import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import { getCollectionDailyOperationalStatusLabel } from "@/pages/collection/collection-daily-day-status-text";

type CollectionDailyDayDetailsStickySummaryProps = {
  customerCount: number;
  dayDetails: CollectionDailyDayDetailsResponse;
  selectedOverviewDay: CollectionDailyOverviewDay | null;
};

export function CollectionDailyDayDetailsStickySummary({
  customerCount,
  dayDetails,
  selectedOverviewDay,
}: CollectionDailyDayDetailsStickySummaryProps) {
  return (
    <div className="collection-day-context" role="group" aria-label="Ringkasan hari kutipan yang sedang dilihat">
      <Badge variant="outline" className="collection-day-operational-badge">
        {getCollectionDailyOperationalStatusLabel(selectedOverviewDay)}
      </Badge>
      <span className="collection-day-context-count">
        <ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span><strong>{dayDetails.pagination.totalRecords}</strong> rekod</span>
      </span>
      <span className="collection-day-context-count">
        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span><strong>{customerCount}</strong> pelanggan</span>
      </span>
      <CollectionReportFreshnessBadge freshness={dayDetails.freshness} className="collection-day-freshness" />
    </div>
  );
}
