import { CalendarOff, StickyNote } from "lucide-react";
import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import {
  getCollectionDailyOperationalStatusLabel,
  getCollectionDailySuperuserRemark,
  getCollectionDailyWorkingDayLabel,
} from "@/pages/collection/collection-daily-day-status-text";

type CollectionDailyDayDetailsEmptyStateProps = {
  dayDetails: CollectionDailyDayDetailsResponse;
  selectedOverviewDay: CollectionDailyOverviewDay | null;
};

export function CollectionDailyDayDetailsEmptyState({
  dayDetails,
  selectedOverviewDay,
}: CollectionDailyDayDetailsEmptyStateProps) {
  return (
    <section className="collection-day-empty-state" aria-label="Tiada rekod kutipan untuk tarikh ini">
      <div className="collection-day-empty-state-icon" aria-hidden="true">
        <CalendarOff className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 space-y-2">
        <div>
          <p className="collection-day-empty-state-eyebrow">Tiada rekod kutipan</p>
          <h3>Tiada kutipan direkodkan untuk tarikh ini.</h3>
          <p>
            Status hari ini ialah <strong>{getCollectionDailyOperationalStatusLabel(selectedOverviewDay)}</strong>.{" "}
            {getCollectionDailyWorkingDayLabel(selectedOverviewDay)}.
          </p>
        </div>

        <div className="collection-day-empty-state-remark">
          <StickyNote className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{getCollectionDailySuperuserRemark(selectedOverviewDay)}</span>
        </div>

        <p className="text-xs text-muted-foreground">{dayDetails.message}</p>
      </div>
    </section>
  );
}
