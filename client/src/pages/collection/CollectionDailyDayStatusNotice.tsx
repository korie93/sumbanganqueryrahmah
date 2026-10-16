import { BriefcaseBusiness, CalendarOff, ChevronDown, StickyNote } from "lucide-react";
import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  getCollectionDailyLeaveTypeLabel,
  getCollectionDailyOperationalStatusLabel,
  getCollectionDailyStatusScopeLabel,
  getCollectionDailySuperuserRemark,
  getCollectionDailyWorkingDayLabel,
} from "@/pages/collection/collection-daily-day-status-text";
import { CollectionDailyCalendarAuditMeta } from "@/pages/collection/CollectionDailyCalendarAuditMeta";

type CollectionDailyDayStatusNoticeProps = {
  day: CollectionDailyOverviewDay | null;
  dayDetails: CollectionDailyDayDetailsResponse;
};

export function CollectionDailyDayStatusNotice({
  day,
  dayDetails,
}: CollectionDailyDayStatusNoticeProps) {
  const isHoliday = day?.calendarStatus === "HOLIDAY";
  const note = day?.note?.trim();
  const hasImportantContext = isHoliday || Boolean(note);

  return (
    <section
      className={cn(
        "collection-day-status-notice",
        hasImportantContext && "collection-day-status-notice--important",
      )}
      aria-label="Daily calendar status and superuser remark"
    >
      {hasImportantContext ? (
        <div className="collection-day-important-context">
          {isHoliday ? (
            <div className="collection-day-status-notice-header">
              <CalendarOff className="h-4 w-4" aria-hidden="true" />
              <p><strong>{getCollectionDailyLeaveTypeLabel(day)}</strong> · {getCollectionDailyWorkingDayLabel(day)}</p>
            </div>
          ) : null}
          {isHoliday && dayDetails.amount > 0 ? (
            <p className="collection-day-status-conflict">Kutipan direkodkan pada hari cuti / tidak bekerja.</p>
          ) : null}
          {note ? (
            <div className="collection-day-status-remark">
              <StickyNote className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <p><span className="collection-day-status-remark-label">Remark Superuser: </span>{note}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      <details className="collection-day-operation-details">
        <summary>
          <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
          <span>Maklumat operasi &amp; audit</span>
          <ChevronDown className="collection-day-disclosure-chevron h-3.5 w-3.5" aria-hidden="true" />
        </summary>
        <div className="collection-day-operation-details-content">
          <div className="collection-day-operation-status">
            <span>Daily Calendar Status: <strong>{getCollectionDailyOperationalStatusLabel(day)}</strong></span>
            <span>{getCollectionDailyStatusScopeLabel(dayDetails)}</span>
          </div>
          {!isHoliday ? (
            <p>Jenis cuti: {getCollectionDailyLeaveTypeLabel(day)} · {getCollectionDailyWorkingDayLabel(day)}</p>
          ) : null}
          {!note ? <p>{getCollectionDailySuperuserRemark(day)}</p> : null}
          {day ? <CollectionDailyCalendarAuditMeta day={day} compact /> : null}
          <p>{dayDetails.message}</p>
          {dayDetails.freshness?.status === "fresh" ? <p>{dayDetails.freshness.message}</p> : null}
        </div>
      </details>
    </section>
  );
}
