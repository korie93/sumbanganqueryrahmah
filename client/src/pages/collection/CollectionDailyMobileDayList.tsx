import { Edit3, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import {
  statusCardClass,
  statusLabel,
  statusTextClass,
} from "@/pages/collection/CollectionDailyShared";
import { CollectionDailyDayStatusIcon } from "@/pages/collection/CollectionDailyDayStatusIcon";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailyMobileDayListProps = {
  days: CollectionDailyOverviewDay[];
  selectedDate: string | null;
  editingDayNumber: number | null;
  canManage: boolean;
  onSelectDate: (date: string) => void;
  onEditDay: (day: number) => void;
};

export function CollectionDailyMobileDayList({
  days,
  selectedDate,
  editingDayNumber,
  canManage,
  onSelectDate,
  onEditDay,
}: CollectionDailyMobileDayListProps) {
  return (
    <div className="space-y-3" data-testid="collection-daily-calendar-mobile-list">
      {days.map((day) => {
        const isSelected = selectedDate === day.date;
        const isEditing = editingDayNumber === day.day;

        return (
          <article
            key={day.date}
            className={`collection-daily-mobile-day-card rounded-2xl border shadow-sm ${statusCardClass(day.status)} ${
              isSelected ? "ring-2 ring-ring ring-offset-1" : ""
            } ${isEditing ? "collection-daily-day-card-editing" : ""}`}
          >
            <div className="px-3 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Day {day.day}
                  </p>
                  <p className="font-semibold text-foreground">{formatDateDDMMYYYY(day.date)}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground">
                  <CollectionDailyDayStatusIcon status={day.status} />
                  {statusLabel(day.status)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="collection-daily-day-metric rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                  <p className="uppercase tracking-[0.12em] text-muted-foreground">Collected</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {formatAmountRM(day.amount)}
                  </p>
                </div>
                <div className="collection-daily-day-metric rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                  <p className="uppercase tracking-[0.12em] text-muted-foreground">Target</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {formatAmountRM(day.target)}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border/50 bg-background/70 px-2.5 py-1">
                  Customers {day.customerCount}
                </span>
                <span
                  className={`rounded-full border border-border/50 bg-background/70 px-2.5 py-1 ${statusTextClass(day.status)}`}
                >
                  {statusLabel(day.status)}
                </span>
                {day.isHoliday && day.holidayName ? (
                  <span className="rounded-full border border-border/50 bg-background/70 px-2.5 py-1 text-foreground">
                    Holiday: {day.holidayName}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2" data-floating-ai-avoid="true">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl bg-background/80"
                  aria-label={`View collection details for ${formatDateDDMMYYYY(day.date)}`}
                  onClick={() => onSelectDate(day.date)}
                  data-testid={`collection-daily-day-${day.day}`}
                >
                  <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                  View details
                </Button>
                {canManage ? (
                  <Button
                    type="button"
                    variant={isEditing ? "default" : "outline"}
                    className="h-10 rounded-xl"
                    aria-pressed={isEditing}
                    aria-label={`Edit calendar status for ${formatDateDDMMYYYY(day.date)}`}
                    onClick={() => onEditDay(day.day)}
                  >
                    <Edit3 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Edit status
                  </Button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
