import { CalendarCheck2, Eye, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { CollectionDailyCalendarAuditMeta } from "@/pages/collection/CollectionDailyCalendarAuditMeta";
import { CollectionDailyCalendarConflictNotice } from "@/pages/collection/CollectionDailyCalendarConflictNotice";
import { DailyStatusForm } from "@/pages/collection/DailyStatusForm";
import {
  statusLabel,
  statusTextClass,
  type EditableCalendarDay,
} from "@/pages/collection/CollectionDailyShared";
import { formatAmountRM } from "@/pages/collection/utils";
import { COLLECTION_DAILY_LEAVE_TYPE_LABELS } from "@shared/collection-daily-status";

type CollectionDailyCalendarEditPanelProps = {
  day: CollectionDailyOverviewDay | null;
  editableDay: EditableCalendarDay | null;
  canManage: boolean;
  isDirty: boolean;
  savingCalendar: boolean;
  onSaveCalendar: () => void;
  onChange: (patch: Partial<EditableCalendarDay>) => void;
  onViewDetails: (date: string) => void;
  variant?: "panel" | "dialog";
};

function getCalendarStatusText(day: CollectionDailyOverviewDay) {
  if (day.calendarStatus === "WORKING") {
    return "Working day";
  }

  if (day.leaveType) {
    return `${day.leaveType} - ${COLLECTION_DAILY_LEAVE_TYPE_LABELS[day.leaveType]}`;
  }

  return "Holiday / Leave";
}

export function CollectionDailyCalendarEditPanel({
  day,
  editableDay,
  canManage,
  isDirty,
  savingCalendar,
  onSaveCalendar,
  onChange,
  onViewDetails,
  variant = "panel",
}: CollectionDailyCalendarEditPanelProps) {
  if (!canManage) {
    return null;
  }

  if (!day || !editableDay) {
    return (
      <aside
        className={`collection-daily-edit-panel collection-daily-state-card collection-daily-edit-panel-${variant}`}
        aria-label="Daily calendar status editor"
      >
        <div className="space-y-2">
          <div className="collection-daily-edit-panel-icon">
            <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Pilih hari untuk edit status</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Klik butang Edit status pada mana-mana hari untuk set Working atau Holiday/Leave bagi nickname yang dipilih.
          </p>
        </div>
      </aside>
    );
  }

  const missingLeaveType = editableDay.status === "HOLIDAY" && !editableDay.leaveType;
  const editableStatusText =
    editableDay.status === "WORKING"
      ? "Working day"
      : editableDay.leaveType
        ? `${editableDay.leaveType} - ${COLLECTION_DAILY_LEAVE_TYPE_LABELS[editableDay.leaveType]}`
        : "Holiday / Leave";

  return (
    <aside
      className={`collection-daily-edit-panel collection-daily-state-card collection-daily-edit-panel-${variant}`}
      aria-label={`Edit daily calendar status for ${formatDateDDMMYYYY(day.date)}`}
      data-testid="collection-daily-edit-panel"
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Selected Day
            </p>
            <h3 className="text-base font-semibold text-foreground">
              {formatDateDDMMYYYY(day.date)}
            </h3>
          </div>
          <span
            className={`shrink-0 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-semibold ${statusTextClass(day.status)}`}
          >
            {statusLabel(day.status)}
          </span>
        </div>

        <div className="collection-daily-edit-panel-summary">
          <div>
            <span>Collected</span>
            <strong>{formatAmountRM(day.amount)}</strong>
          </div>
          <div>
            <span>Required</span>
            <strong>{formatAmountRM(day.target)}</strong>
          </div>
          <div>
            <span>Customers</span>
            <strong>{day.customerCount}</strong>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Status tersimpan
          </p>
          <p className="mt-1 text-xs font-semibold text-foreground">{getCalendarStatusText(day)}</p>
          {day.note ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{day.note}</p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Tiada nota status untuk hari ini.
            </p>
          )}
          <div className="mt-2">
            <CollectionDailyCalendarAuditMeta day={day} />
          </div>
        </div>

        <div
          className={`collection-daily-save-state ${isDirty ? "collection-daily-save-state-dirty" : ""}`}
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="text-xs font-semibold text-foreground">
            {isDirty ? "Perubahan belum disimpan" : "Tiada perubahan belum disimpan"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {isDirty
              ? `Preview status baru: ${editableStatusText}. Save hanya akan update tarikh ini untuk nickname dipilih.`
              : "Klik Working atau Holiday/Leave untuk ubah status tarikh ini."}
          </p>
        </div>

        <DailyStatusForm
          day={editableDay}
          label="Status untuk nickname dipilih"
          onChange={onChange}
        />

        <CollectionDailyCalendarConflictNotice day={day} editableDay={editableDay} />

        <div className="grid gap-2">
          <Button
            type="button"
            className="h-10 rounded-xl"
            onClick={onSaveCalendar}
            disabled={!isDirty || savingCalendar || missingLeaveType}
          >
            {savingCalendar ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Save changed status
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl"
            onClick={() => onViewDetails(day.date)}
          >
            <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
            View collection details
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {missingLeaveType
              ? "Pilih leave type dahulu sebelum simpan Holiday/Leave."
              : "Nickname lain pada tarikh sama tidak akan berubah."}
          </p>
        </div>
      </div>
    </aside>
  );
}
