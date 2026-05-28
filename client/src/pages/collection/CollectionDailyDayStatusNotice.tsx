import { BriefcaseBusiness, CalendarOff, StickyNote } from "lucide-react";
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
  if (!day) {
    return null;
  }

  const isHoliday = day.calendarStatus === "HOLIDAY";

  return (
    <section
      className={cn(
        "collection-day-status-notice",
        isHoliday ? "collection-day-status-notice--holiday" : "collection-day-status-notice--working",
      )}
      aria-label="Daily calendar status and superuser remark"
    >
      <div className="collection-day-status-notice-header">
        <span className="collection-day-status-notice-icon" aria-hidden="true">
          {isHoliday ? (
            <CalendarOff className="h-4 w-4" />
          ) : (
            <BriefcaseBusiness className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="collection-day-status-notice-eyebrow">Daily Calendar Status</p>
          <h3 className="collection-day-status-notice-title">{getCollectionDailyOperationalStatusLabel(day)}</h3>
          <p className="collection-day-status-notice-scope">{getCollectionDailyStatusScopeLabel(dayDetails)}</p>
        </div>
      </div>

      <div className="collection-day-status-notice-grid">
        <div className="collection-day-status-notice-field">
          <span>Jenis cuti</span>
          <strong>{getCollectionDailyLeaveTypeLabel(day)}</strong>
        </div>
        <div className="collection-day-status-notice-field">
          <span>Status operasi</span>
          <strong>{getCollectionDailyWorkingDayLabel(day)}</strong>
        </div>
      </div>

      <div className="collection-day-status-remark">
        <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-label-sm text-muted-foreground">
          <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Remark Superuser</span>
        </div>
        <p>{getCollectionDailySuperuserRemark(day)}</p>
        <div className="mt-2">
          <CollectionDailyCalendarAuditMeta day={day} />
        </div>
      </div>
    </section>
  );
}
