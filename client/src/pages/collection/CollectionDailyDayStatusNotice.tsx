import { BriefcaseBusiness, CalendarOff, StickyNote } from "lucide-react";
import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CollectionDailyCalendarAuditMeta } from "@/pages/collection/CollectionDailyCalendarAuditMeta";
import { COLLECTION_DAILY_LEAVE_TYPE_LABELS } from "@shared/collection-daily-status";

type CollectionDailyDayStatusNoticeProps = {
  day: CollectionDailyOverviewDay | null;
  dayDetails: CollectionDailyDayDetailsResponse;
};

function getStatusLabel(day: CollectionDailyOverviewDay) {
  return day.calendarStatus === "HOLIDAY" ? "Holiday / Leave" : "Working";
}

function getLeaveTypeLabel(day: CollectionDailyOverviewDay) {
  if (day.calendarStatus !== "HOLIDAY") {
    return "Not applicable";
  }

  if (!day.leaveType) {
    return "Leave type not set";
  }

  return `${day.leaveType} - ${COLLECTION_DAILY_LEAVE_TYPE_LABELS[day.leaveType]}`;
}

function getScopeLabel(dayDetails: CollectionDailyDayDetailsResponse) {
  if (dayDetails.usernames.length === 1) {
    return `Nickname: ${dayDetails.usernames[0]}`;
  }

  if (dayDetails.usernames.length > 1) {
    return `${dayDetails.usernames.length} selected nicknames`;
  }

  return "Selected staff scope";
}

export function CollectionDailyDayStatusNotice({
  day,
  dayDetails,
}: CollectionDailyDayStatusNoticeProps) {
  if (!day) {
    return null;
  }

  const isHoliday = day.calendarStatus === "HOLIDAY";
  const note = day.note?.trim();

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
          <h3 className="collection-day-status-notice-title">{getStatusLabel(day)}</h3>
          <p className="collection-day-status-notice-scope">{getScopeLabel(dayDetails)}</p>
        </div>
      </div>

      <div className="collection-day-status-notice-grid">
        <div className="collection-day-status-notice-field">
          <span>Jenis cuti</span>
          <strong>{getLeaveTypeLabel(day)}</strong>
        </div>
        <div className="collection-day-status-notice-field">
          <span>Status operasi</span>
          <strong>{isHoliday ? "Tidak dikira sebagai working day" : "Dikira sebagai working day"}</strong>
        </div>
      </div>

      <div className="collection-day-status-remark">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Remark Superuser</span>
        </div>
        <p>{note || "Tiada remark daripada superuser untuk tarikh ini."}</p>
        <div className="mt-2">
          <CollectionDailyCalendarAuditMeta day={day} />
        </div>
      </div>
    </section>
  );
}
