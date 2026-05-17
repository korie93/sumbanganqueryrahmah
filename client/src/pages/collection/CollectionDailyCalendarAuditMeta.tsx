import { History } from "lucide-react";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { formatOperationalDateTime } from "@/lib/date-format";

type CollectionDailyCalendarAuditMetaProps = {
  day: CollectionDailyOverviewDay;
  compact?: boolean;
};

export function CollectionDailyCalendarAuditMeta({
  day,
  compact = false,
}: CollectionDailyCalendarAuditMetaProps) {
  const updatedBy = day.updatedBy || day.createdBy || "";
  const updatedAt = day.updatedAt || day.createdAt || "";

  if (!updatedBy && !updatedAt) {
    return (
      <p className="collection-daily-calendar-audit-meta collection-daily-calendar-audit-meta-muted">
        Status default, belum ada rekod kemaskini superuser.
      </p>
    );
  }

  const formattedTime = formatOperationalDateTime(updatedAt, { fallback: "" });
  const copy = [
    updatedBy ? `Dikemaskini oleh ${updatedBy}` : "Dikemaskini",
    formattedTime ? `pada ${formattedTime}` : "",
  ].filter(Boolean).join(" ");

  return (
    <p
      className={`collection-daily-calendar-audit-meta ${
        compact ? "collection-daily-calendar-audit-meta-compact" : ""
      }`}
    >
      <History className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{copy}</span>
    </p>
  );
}

