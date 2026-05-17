import type { CollectionDailyOverviewDay } from "@/lib/api";
import { COLLECTION_DAILY_LEAVE_TYPE_LABELS } from "@shared/collection-daily-status";

type CollectionDailyCalendarDayBadgeProps = {
  day: CollectionDailyOverviewDay;
  compact?: boolean;
};

export function getCollectionDailyCalendarDayBadgeLabel(day: CollectionDailyOverviewDay) {
  const note = day.note?.trim() || "";

  if (day.calendarStatus !== "HOLIDAY") {
    return note ? `Working note: ${note}` : "";
  }

  const leaveLabel = day.leaveType
    ? `${day.leaveType} - ${COLLECTION_DAILY_LEAVE_TYPE_LABELS[day.leaveType]}`
    : day.holidayName || "Holiday / Leave";

  return note ? `${leaveLabel}. Remark: ${note}` : leaveLabel;
}

export function CollectionDailyCalendarDayBadge({
  day,
  compact = false,
}: CollectionDailyCalendarDayBadgeProps) {
  const summary = getCollectionDailyCalendarDayBadgeLabel(day);

  if (!summary) {
    return null;
  }

  const isHoliday = day.calendarStatus === "HOLIDAY";
  const leaveCode = isHoliday ? day.leaveType || "HOL" : "NOTE";
  const title = isHoliday
    ? day.leaveType
      ? COLLECTION_DAILY_LEAVE_TYPE_LABELS[day.leaveType]
      : "Holiday / Leave"
    : "Working note";
  const note = day.note?.trim() || "";

  return (
    <div
      className={`collection-daily-calendar-day-badge ${
        isHoliday
          ? "collection-daily-calendar-day-badge-holiday"
          : "collection-daily-calendar-day-badge-working"
      } ${compact ? "collection-daily-calendar-day-badge-compact" : ""}`}
      aria-label={summary}
      title={summary}
    >
      <span className="collection-daily-calendar-day-badge-code">{leaveCode}</span>
      <span className="collection-daily-calendar-day-badge-text">
        <span>{title}</span>
        {note ? <small>{note}</small> : null}
      </span>
    </div>
  );
}
