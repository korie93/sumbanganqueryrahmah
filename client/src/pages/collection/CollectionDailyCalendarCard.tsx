import { AlertTriangle, CheckCircle2, CircleSlash, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CollectionDailyOverviewDay, CollectionDailyOverviewResponse } from "@/lib/api";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import {
  statusCardClass,
  statusLabel,
  statusTextClass,
  type EditableCalendarDay,
} from "@/pages/collection/CollectionDailyShared";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailyCalendarCardProps = {
  loadingOverview: boolean;
  overview: CollectionDailyOverviewResponse | null;
  emptyOverviewMessage: string;
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

export function CollectionDailyCalendarCard({
  loadingOverview,
  overview,
  emptyOverviewMessage,
  firstWeekday,
  selectedDate,
  canManage,
  editableCalendarByDay,
  onSelectDate,
  onUpdateEditableDay,
}: CollectionDailyCalendarCardProps) {
  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader>
        <CardTitle className="text-lg">Monthly Daily Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4" data-testid="collection-daily-legend">
          <div className="flex items-center gap-2 rounded border border-rose-300/60 bg-rose-50/70 px-2 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span>Red: No collection</span>
          </div>
          <div className="flex items-center gap-2 rounded border border-amber-300/60 bg-amber-50/70 px-2 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span>Yellow: Collection recorded but daily target not achieved</span>
          </div>
          <div className="flex items-center gap-2 rounded border border-green-300/60 bg-green-50/70 px-2 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <span>Green: Daily target achieved</span>
          </div>
          <div className="flex items-center gap-2 rounded border border-slate-300/60 bg-slate-100/80 px-2 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
            <span>Grey: Holiday / non-working day</span>
          </div>
        </div>

        {loadingOverview ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Loading monthly daily status...
          </div>
        ) : !overview ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{emptyOverviewMessage}</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted-foreground">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>
            <div className="grid grid-cols-7 gap-2" data-testid="collection-daily-calendar">
              {Array.from({ length: firstWeekday }).map((_, index) => (
                <div key={`blank-${index}`} />
              ))}
              {overview.days.map((day) => {
                const editable = editableCalendarByDay.get(day.day);
                const isSelected = selectedDate === day.date;
                return (
                  <div
                    key={day.date}
                    className={`rounded-md border text-xs ${isSelected ? "ring-2 ring-ring ring-offset-1" : ""} ${statusCardClass(day.status)}`}
                  >
                    <button
                      type="button"
                      className="w-full rounded-md p-2 text-left transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      aria-label={`${formatDateDDMMYYYY(day.date)} - ${statusLabel(day.status)} - Collected ${formatAmountRM(day.amount)} - Target ${formatAmountRM(day.target)}${isSelected ? " - Selected" : ""}`}
                      onClick={() => onSelectDate(day.date)}
                      data-testid={`collection-daily-day-${day.day}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <div className="font-semibold">{day.day}</div>
                        <DayStatusIcon status={day.status} />
                      </div>
                      <div className={statusTextClass(day.status)}>{statusLabel(day.status)}</div>
                      <div>Collected: {formatAmountRM(day.amount)}</div>
                      <div className="text-[10px] text-muted-foreground">Customers: {day.customerCount}</div>
                      <div className="text-[10px] text-muted-foreground">Target: {formatAmountRM(day.target)}</div>
                      {day.isHoliday && day.holidayName ? (
                        <div className="truncate text-[10px] text-muted-foreground" title={day.holidayName}>
                          {day.holidayName}
                        </div>
                      ) : null}
                    </button>
                    {canManage && editable ? (
                      <div className="space-y-1 border-t border-border/40 px-2 pb-2 pt-1">
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={editable.isWorkingDay}
                            onChange={(event) =>
                              onUpdateEditableDay(editable.day, { isWorkingDay: event.target.checked })
                            }
                          />
                          Working
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={editable.isHoliday}
                            onChange={(event) =>
                              onUpdateEditableDay(editable.day, { isHoliday: event.target.checked })
                            }
                          />
                          Holiday
                        </label>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
