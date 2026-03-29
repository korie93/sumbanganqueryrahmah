import { AlertTriangle, CheckCircle2, CircleSlash, Loader2 } from "lucide-react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
  const selectedDay = overview?.days.find((day) => day.date === selectedDate) || null;
  const selectedEditableDay =
    selectedDay ? editableCalendarByDay.get(selectedDay.day) || null : null;

  return (
    <div data-testid="collection-daily-calendar">
      <OperationalSectionCard
        title="Monthly Daily Status"
        description="Scan the month quickly, then click a day to inspect collection details."
        contentClassName="space-y-4"
      >
        <div className="grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4" data-testid="collection-daily-legend">
          <div className="flex items-center gap-2 rounded-xl border border-rose-300/60 bg-rose-50/70 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span>Red: No collection</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50/70 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span>Yellow: Collection recorded but daily target not achieved</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-green-300/60 bg-green-50/70 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <span>Green: Daily target achieved</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-300/60 bg-slate-100/80 px-3 py-2">
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
            {isMobile ? (
              <div className="space-y-3" data-testid="collection-daily-calendar-mobile-list">
                <p className="text-xs text-muted-foreground">
                  Tap a day to open details. Mobile view shows each day as a full card for easier scanning.
                </p>
                {overview.days.map((day) => {
                  const isSelected = selectedDate === day.date;

                  return (
                    <article
                      key={day.date}
                      className={`rounded-2xl border shadow-sm ${statusCardClass(day.status)} ${
                        isSelected ? "ring-2 ring-ring ring-offset-1" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full rounded-[inherit] p-3 text-left transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        aria-label={`${formatDateDDMMYYYY(day.date)} - ${statusLabel(day.status)} - Collected ${formatAmountRM(day.amount)} - Target ${formatAmountRM(day.target)}${isSelected ? " - Selected" : ""}`}
                        onClick={() => onSelectDate(day.date)}
                        data-testid={`collection-daily-day-${day.day}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Day {day.day}
                            </p>
                            <p className="font-semibold text-foreground">
                              {formatDateDDMMYYYY(day.date)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <DayStatusIcon status={day.status} />
                            <span className="rounded-full border border-border/50 bg-background/75 px-2 py-1 text-[11px] font-medium text-foreground">
                              {statusLabel(day.status)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                            <p className="uppercase tracking-[0.12em] text-muted-foreground">Collected</p>
                            <p className="mt-1 font-medium text-foreground">{formatAmountRM(day.amount)}</p>
                          </div>
                          <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                            <p className="uppercase tracking-[0.12em] text-muted-foreground">Target</p>
                            <p className="mt-1 font-medium text-foreground">{formatAmountRM(day.target)}</p>
                          </div>
                          <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                            <p className="uppercase tracking-[0.12em] text-muted-foreground">Customers</p>
                            <p className="mt-1 font-medium text-foreground">{day.customerCount}</p>
                          </div>
                          <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                            <p className="uppercase tracking-[0.12em] text-muted-foreground">Status</p>
                            <p className={`mt-1 font-medium ${statusTextClass(day.status)}`}>
                              {statusLabel(day.status)}
                            </p>
                          </div>
                        </div>

                        {day.isHoliday && day.holidayName ? (
                          <div className="mt-3 rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                            Holiday: <span className="font-medium text-foreground">{day.holidayName}</span>
                          </div>
                        ) : null}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted-foreground">
                  <div>Sun</div>
                  <div>Mon</div>
                  <div>Tue</div>
                  <div>Wed</div>
                  <div>Thu</div>
                  <div>Fri</div>
                  <div>Sat</div>
                </div>
                <div
                  className="grid grid-cols-7 gap-2"
                  data-testid="collection-daily-calendar-grid"
                >
                  {Array.from({ length: firstWeekday }).map((_, index) => (
                    <div key={`blank-${index}`} />
                  ))}
                  {overview.days.map((day) => {
                    const editable = editableCalendarByDay.get(day.day);
                    const isSelected = selectedDate === day.date;
                    return (
                      <div
                        key={day.date}
                        className={`rounded-xl border text-xs shadow-sm ${isSelected ? "ring-2 ring-ring ring-offset-1" : ""} ${statusCardClass(day.status)}`}
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
                          <div className="text-[10px] text-muted-foreground">Required Today: {formatAmountRM(day.target)}</div>
                          {day.isHoliday && day.holidayName ? (
                            <div className="truncate text-[10px] text-muted-foreground" title={day.holidayName}>
                              {day.holidayName}
                            </div>
                          ) : null}
                        </button>
                        {canManage && editable ? (
                          <div className="space-y-1 border-t border-border/40 px-2 pb-2 pt-1.5">
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
              </>
            )}

            {canManage && isMobile && selectedDay && selectedEditableDay ? (
              <div className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-4" data-floating-ai-avoid="true">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    Edit {formatDateDDMMYYYY(selectedDay.date)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Collected {formatAmountRM(selectedDay.amount)} | Required {formatAmountRM(selectedDay.target)}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedEditableDay.isWorkingDay}
                      onChange={(event) =>
                        onUpdateEditableDay(selectedEditableDay.day, { isWorkingDay: event.target.checked })
                      }
                    />
                    <span>Working day</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedEditableDay.isHoliday}
                      onChange={(event) =>
                        onUpdateEditableDay(selectedEditableDay.day, { isHoliday: event.target.checked })
                      }
                    />
                    <span>Holiday</span>
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </OperationalSectionCard>
    </div>
  );
}
