import { AlertTriangle } from "lucide-react";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { buildCollectionDailyCalendarConflictReportItems } from "@/pages/collection/collection-daily-calendar-conflict-report-utils";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailyCalendarConflictReportProps = {
  days: CollectionDailyOverviewDay[];
  editableCalendarByDay: ReadonlyMap<number, EditableCalendarDay>;
  dirtyCalendarDayNumbers: ReadonlySet<number>;
};

export function CollectionDailyCalendarConflictReport({
  days,
  editableCalendarByDay,
  dirtyCalendarDayNumbers,
}: CollectionDailyCalendarConflictReportProps) {
  const items = buildCollectionDailyCalendarConflictReportItems(
    days,
    editableCalendarByDay,
    dirtyCalendarDayNumbers,
  );

  if (items.length === 0) return null;

  return (
    <details className="collection-daily-conflict-report">
      <summary className="collection-daily-conflict-report-summary">
        <span className="collection-daily-conflict-report-icon" aria-hidden="true">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <span>
          <strong>{items.length} conflict status</strong>
          <small>Holiday/OFF tetapi masih ada kutipan. Semak sebelum audit bulanan.</small>
        </span>
      </summary>

      <ul className="collection-daily-conflict-report-list">
        {items.slice(0, 8).map((item) => (
          <li key={`${item.day.date}-${item.source}`}>
            <span>{formatDateDDMMYYYY(item.day.date)}</span>
            <strong>{formatAmountRM(item.day.amount)}</strong>
            <small>{item.source === "draft" ? "Draft belum save" : "Status tersimpan"}</small>
          </li>
        ))}
      </ul>
      {items.length > 8 ? (
        <p className="collection-daily-conflict-report-more">
          +{items.length - 8} lagi conflict tidak dipaparkan.
        </p>
      ) : null}
    </details>
  );
}
