import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import { COLLECTION_DAILY_LEAVE_TYPE_LABELS } from "@shared/collection-daily-status";

export function getCollectionDailyOperationalStatusLabel(day: CollectionDailyOverviewDay | null) {
  if (!day) return "Status belum tersedia";
  if (day.calendarStatus === "WORKING") return "Working";
  if (day.leaveType) return `${day.leaveType} - ${COLLECTION_DAILY_LEAVE_TYPE_LABELS[day.leaveType]}`;
  return "Holiday / Leave";
}

export function getCollectionDailyLeaveTypeLabel(day: CollectionDailyOverviewDay | null) {
  if (!day || day.calendarStatus !== "HOLIDAY") return "Tidak berkaitan";
  if (!day.leaveType) return "Jenis cuti belum ditetapkan";
  return `${day.leaveType} - ${COLLECTION_DAILY_LEAVE_TYPE_LABELS[day.leaveType]}`;
}

export function getCollectionDailyWorkingDayLabel(day: CollectionDailyOverviewDay | null) {
  if (!day) return "Status operasi belum tersedia";
  return day.calendarStatus === "HOLIDAY"
    ? "Tidak dikira sebagai working day"
    : "Dikira sebagai working day";
}

export function getCollectionDailyStatusScopeLabel(dayDetails: CollectionDailyDayDetailsResponse) {
  if (dayDetails.usernames.length === 1) return `Nickname: ${dayDetails.usernames[0]}`;
  if (dayDetails.usernames.length > 1) return `${dayDetails.usernames.length} selected nicknames`;
  return "Selected staff scope";
}

export function getCollectionDailySuperuserRemark(day: CollectionDailyOverviewDay | null) {
  const note = day?.note?.trim();
  return note || "Tiada remark daripada superuser untuk tarikh ini.";
}
