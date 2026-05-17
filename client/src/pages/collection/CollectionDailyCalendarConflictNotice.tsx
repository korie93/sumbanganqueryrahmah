import { AlertTriangle } from "lucide-react";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { hasCollectionDailyCalendarCollectionConflict } from "@/pages/collection/collection-daily-calendar-conflict-utils";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailyCalendarConflictNoticeProps = {
  day: CollectionDailyOverviewDay;
  editableDay: EditableCalendarDay;
  compact?: boolean;
};

export function CollectionDailyCalendarConflictNotice({
  day,
  editableDay,
  compact = false,
}: CollectionDailyCalendarConflictNoticeProps) {
  if (!hasCollectionDailyCalendarCollectionConflict(day, editableDay)) {
    return null;
  }

  return (
    <div
      className={`collection-daily-calendar-conflict-notice ${
        compact ? "collection-daily-calendar-conflict-notice-compact" : ""
      }`}
      role="alert"
    >
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <p>
        Tarikh ini ada {formatAmountRM(day.amount)} kutipan
        {day.customerCount ? ` daripada ${day.customerCount} rekod` : ""}. Semak dahulu sebelum
        set sebagai Holiday/Leave atau OFF.
      </p>
    </div>
  );
}

