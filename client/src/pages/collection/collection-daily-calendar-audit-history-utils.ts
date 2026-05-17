import type { CollectionDailyOverviewDay } from "@/lib/api";

export type CollectionDailyCalendarAuditHistoryItem = {
  id: string;
  label: string;
  actor: string;
  occurredAt: string;
  detail: string;
};

function hasAuditValue(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function buildCollectionDailyCalendarAuditHistoryItems(
  day: CollectionDailyOverviewDay | null,
): CollectionDailyCalendarAuditHistoryItem[] {
  if (!day) return [];

  const items: CollectionDailyCalendarAuditHistoryItem[] = [];
  const statusDetail =
    day.calendarStatus === "WORKING"
      ? "Status disimpan sebagai Working."
      : `Status disimpan sebagai ${day.leaveType ?? "Holiday/Leave"}${
          day.note ? ` dengan remark: ${day.note}` : "."
        }`;

  if (hasAuditValue(day.createdAt) || hasAuditValue(day.createdBy)) {
    items.push({
      id: `${day.date}-created`,
      label: "Rekod dibuat",
      actor: day.createdBy?.trim() || "Sistem",
      occurredAt: day.createdAt?.trim() || "",
      detail: "Rekod status harian pertama kali disimpan.",
    });
  }

  if (hasAuditValue(day.updatedAt) || hasAuditValue(day.updatedBy)) {
    const isDuplicateCreatedUpdate =
      day.createdAt === day.updatedAt && day.createdBy === day.updatedBy;
    if (!isDuplicateCreatedUpdate) {
      items.push({
        id: `${day.date}-updated`,
        label: "Kemaskini terakhir",
        actor: day.updatedBy?.trim() || "Sistem",
        occurredAt: day.updatedAt?.trim() || "",
        detail: statusDetail,
      });
    }
  }

  if (items.length === 0) {
    items.push({
      id: `${day.date}-default`,
      label: "Status default",
      actor: "Sistem",
      occurredAt: "",
      detail: "Belum ada rekod kemaskini superuser untuk tarikh ini.",
    });
  }

  return items;
}
