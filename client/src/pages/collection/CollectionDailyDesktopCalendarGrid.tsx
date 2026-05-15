import { AlertTriangle, CheckCircle2, CircleSlash } from "lucide-react";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { DailyStatusForm } from "@/pages/collection/DailyStatusForm";
import {
  statusCardClass,
  statusLabel,
  statusTextClass,
  type EditableCalendarDay,
} from "@/pages/collection/CollectionDailyShared";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailyDesktopCalendarGridProps = {
  days: CollectionDailyOverviewDay[];
  firstWeekday: number;
  selectedDate: string | null;
  canManage: boolean;
  editableCalendarByDay: Map<number, EditableCalendarDay>;
  onSelectDate: (date: string) => void;
  onUpdateEditableDay: (day: number, patch: Partial<EditableCalendarDay>) => void;
};

function DayStatusIcon({ status }: { status: CollectionDailyOverviewDay["status"] }) {
  if (status === "green") return <CheckCircle2 className="h-3.5 w-3.5 text-green-700" />;
  if (status === "yellow") return <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />;
  if (status === "red") return <CircleSlash className="h-3.5 w-3.5 text-rose-700" />;
  return null;
}

function getDailyProgressPercent(day: CollectionDailyOverviewDay) {
  if (!Number.isFinite(day.amount) || !Number.isFinite(day.target)) return 0;
  if (day.target <= 0) return day.amount > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, (day.amount / day.target) * 100));
}

export function CollectionDailyDesktopCalendarGrid({
  days,
  firstWeekday,
  selectedDate,
  canManage,
  editableCalendarByDay,
  onSelectDate,
  onUpdateEditableDay,
}: CollectionDailyDesktopCalendarGridProps) {
  return (
    <div className="collection-daily-desktop-grid grid grid-cols-7 gap-2" data-testid="collection-daily-calendar-grid">
      {Array.from({ length: firstWeekday }).map((_, index) => (
        <div className="collection-daily-calendar-blank" key={`blank-${index}`} />
      ))}
      {days.map((day) => {
        const editable = editableCalendarByDay.get(day.day);
        const isSelected = selectedDate === day.date;
        const progressPercent = getDailyProgressPercent(day);

        return (
          <div
            key={day.date}
            className={`collection-daily-desktop-day rounded-xl border text-xs shadow-sm ${isSelected ? "ring-2 ring-ring ring-offset-1" : ""} ${statusCardClass(day.status)}`}
          >
            <button
              type="button"
              className="collection-daily-day-button w-full rounded-md p-2 text-left transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label={`${formatDateDDMMYYYY(day.date)} - ${statusLabel(day.status)} - Collected ${formatAmountRM(day.amount)} - Target ${formatAmountRM(day.target)}${isSelected ? " - Selected" : ""}`}
              onClick={() => onSelectDate(day.date)}
              data-testid={`collection-daily-day-${day.day}`}
            >
              <div className="collection-daily-day-header mb-1 flex items-center justify-between">
                <div className="font-semibold">{day.day}</div>
                <DayStatusIcon status={day.status} />
              </div>
              <div className={`collection-daily-day-status ${statusTextClass(day.status)}`}>
                {statusLabel(day.status)}
              </div>
              <div className="collection-daily-day-amount">Collected: {formatAmountRM(day.amount)}</div>
              <div className="text-[10px] text-muted-foreground">Customers: {day.customerCount}</div>
              <div className="text-[10px] text-muted-foreground">Required Today: {formatAmountRM(day.target)}</div>
              <progress
                className="collection-daily-day-progress mt-2"
                max={100}
                value={progressPercent}
                aria-hidden="true"
              />
              {day.isHoliday && day.holidayName ? (
                <div className="truncate text-[10px] text-muted-foreground" title={day.holidayName}>
                  {day.holidayName}
                </div>
              ) : null}
            </button>
            {canManage && editable ? (
              <div className="collection-daily-day-edit border-t border-border/40 px-2 pb-2 pt-1.5">
                <DailyStatusForm
                  day={editable}
                  label={`Status day ${editable.day}`}
                  onChange={(patch) => onUpdateEditableDay(editable.day, patch)}
                  compact
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
