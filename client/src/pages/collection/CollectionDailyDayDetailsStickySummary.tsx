import { CircleDollarSign, ClipboardList, type LucideIcon, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { getCollectionDailyOperationalStatusLabel } from "@/pages/collection/collection-daily-day-status-text";
import { getStatusPillClass } from "@/pages/collection/CollectionDailyDayDetailsDialogParts";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailyDayDetailsStickySummaryProps = {
  customerCount: number;
  dayDetails: CollectionDailyDayDetailsResponse;
  selectedOverviewDay: CollectionDailyOverviewDay | null;
};

function StickySummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="collection-day-sticky-summary-item">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="collection-day-sticky-summary-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function CollectionDailyDayDetailsStickySummary({
  customerCount,
  dayDetails,
  selectedOverviewDay,
}: CollectionDailyDayDetailsStickySummaryProps) {
  return (
    <section className="collection-day-sticky-summary" aria-label="Ringkasan hari kutipan yang sedang dilihat">
      <div className="collection-day-sticky-summary-main">
        <div className="min-w-0">
          <p className="collection-day-sticky-summary-eyebrow">Ringkasan hari</p>
          <h3>{formatDateDDMMYYYY(dayDetails.date)}</h3>
        </div>
        <Badge
          variant="outline"
          className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", getStatusPillClass(dayDetails.status))}
        >
          {getCollectionDailyOperationalStatusLabel(selectedOverviewDay)}
        </Badge>
      </div>

      <div className="collection-day-sticky-summary-grid">
        <StickySummaryItem icon={CircleDollarSign} label="Kutipan" value={formatAmountRM(dayDetails.amount)} />
        <StickySummaryItem icon={ClipboardList} label="Rekod" value={dayDetails.pagination.totalRecords} />
        <StickySummaryItem icon={Users} label="Customer" value={customerCount} />
      </div>
    </section>
  );
}
