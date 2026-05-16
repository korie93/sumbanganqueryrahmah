import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, Edit3, Eye, Loader2 } from "lucide-react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionDailyOverviewDay, CollectionDailyOverviewResponse } from "@/lib/api";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { CollectionDailyCalendarEditPanel } from "@/pages/collection/CollectionDailyCalendarEditPanel";
import {
  statusCardClass,
  statusLabel,
  statusTextClass,
  type EditableCalendarDay,
} from "@/pages/collection/CollectionDailyShared";
import { formatAmountRM } from "@/pages/collection/utils";

export type CollectionDailyCalendarCardProps = {
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

const CollectionDailyDesktopCalendarGrid = lazy(() =>
  import("@/pages/collection/CollectionDailyDesktopCalendarGrid").then((module) => ({
    default: module.CollectionDailyDesktopCalendarGrid,
  })),
);

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
  const [editingDayNumber, setEditingDayNumber] = useState<number | null>(null);
  const editingDay = useMemo(() => {
    if (!overview?.days.length || editingDayNumber == null) return null;
    return overview.days.find((day) => day.day === editingDayNumber) || null;
  }, [editingDayNumber, overview?.days]);
  const editingEditableDay = editingDay ? editableCalendarByDay.get(editingDay.day) || null : null;

  useEffect(() => {
    if (!canManage || !overview?.days.length) {
      if (editingDayNumber !== null) {
        setEditingDayNumber(null);
      }
      return;
    }

    const stillAvailable =
      editingDayNumber != null && overview.days.some((day) => day.day === editingDayNumber);

    if (!stillAvailable) {
      setEditingDayNumber(overview.days[0]?.day ?? null);
    }
  }, [canManage, editingDayNumber, overview?.days]);

  return (
    <div className="collection-daily-calendar" data-testid="collection-daily-calendar">
      <OperationalSectionCard
        title="Monthly Daily Status"
        description={
          isMobile
            ? "Scan the month quickly and tap a day to open its collection details."
            : "Scan the month quickly, then click a day to inspect collection details."
        }
        className="collection-daily-calendar-card"
        contentClassName="space-y-4"
      >
        {isMobile ? (
          <div className="collection-daily-legend space-y-2" data-testid="collection-daily-legend">
            <div className="flex flex-wrap gap-2">
              <Badge className="collection-daily-legend-badge border-rose-300/70 bg-rose-50 text-rose-700 hover:bg-rose-50">
                Red: No collection
              </Badge>
              <Badge className="collection-daily-legend-badge border-amber-300/70 bg-amber-50 text-amber-700 hover:bg-amber-50">
                Yellow: Below target
              </Badge>
              <Badge className="collection-daily-legend-badge border-green-300/70 bg-green-50 text-green-700 hover:bg-green-50">
                Green: Target achieved
              </Badge>
              <Badge className="collection-daily-legend-badge border-slate-300/70 bg-slate-100 text-slate-700 hover:bg-slate-100">
                Grey: Holiday
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Each card shows the key daily figures first so you can decide quickly which date to open.
            </p>
          </div>
        ) : (
          <div className="collection-daily-legend grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4" data-testid="collection-daily-legend">
            <div className="collection-daily-legend-item flex items-center gap-2 rounded-xl border border-rose-300/60 bg-rose-50/70 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span>Red: No collection</span>
            </div>
            <div className="collection-daily-legend-item flex items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50/70 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span>Yellow: Collection recorded but daily target not achieved</span>
            </div>
            <div className="collection-daily-legend-item flex items-center gap-2 rounded-xl border border-green-300/60 bg-green-50/70 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span>Green: Daily target achieved</span>
            </div>
            <div className="collection-daily-legend-item flex items-center gap-2 rounded-xl border border-slate-300/60 bg-slate-100/80 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
              <span>Grey: Holiday / non-working day</span>
            </div>
          </div>
        )}

        {loadingOverview ? (
          <div className="collection-daily-state-card rounded-2xl border border-border/60 bg-background px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Loading monthly daily status...
          </div>
        ) : !overview ? (
          <div className="collection-daily-state-card rounded-2xl border border-border/60 bg-background px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
            {emptyOverviewMessage}
          </div>
        ) : (
          <div className="space-y-3">
            {isMobile ? (
              <div className="space-y-3" data-testid="collection-daily-calendar-mobile-list">
                {overview.days.map((day) => {
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
                            <p className="font-semibold text-foreground">
                              {formatDateDDMMYYYY(day.date)}
                            </p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground">
                            <DayStatusIcon status={day.status} />
                            {statusLabel(day.status)}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="collection-daily-day-metric rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                            <p className="uppercase tracking-[0.12em] text-muted-foreground">Collected</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">{formatAmountRM(day.amount)}</p>
                          </div>
                          <div className="collection-daily-day-metric rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                            <p className="uppercase tracking-[0.12em] text-muted-foreground">Target</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">{formatAmountRM(day.target)}</p>
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
                              onClick={() => setEditingDayNumber(day.day)}
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
            ) : (
              <div className={canManage ? "collection-daily-calendar-workspace" : "space-y-3"}>
                <div className="min-w-0 space-y-3">
                  <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted-foreground">
                    <div>Sun</div>
                    <div>Mon</div>
                    <div>Tue</div>
                    <div>Wed</div>
                    <div>Thu</div>
                    <div>Fri</div>
                    <div>Sat</div>
                  </div>
                  <Suspense
                    fallback={<div className="grid grid-cols-7 gap-2" data-testid="collection-daily-calendar-grid" />}
                  >
                    <CollectionDailyDesktopCalendarGrid
                      days={overview.days}
                      firstWeekday={firstWeekday}
                      selectedDate={selectedDate}
                      editingDayNumber={editingDayNumber}
                      canManage={canManage}
                      editableCalendarByDay={editableCalendarByDay}
                      onEditDay={setEditingDayNumber}
                      onSelectDate={onSelectDate}
                    />
                  </Suspense>
                </div>
                <CollectionDailyCalendarEditPanel
                  day={editingDay}
                  editableDay={editingEditableDay}
                  canManage={canManage}
                  onChange={(patch) => {
                    if (editingEditableDay) onUpdateEditableDay(editingEditableDay.day, patch);
                  }}
                  onViewDetails={onSelectDate}
                />
              </div>
            )}

            {canManage && isMobile ? (
              <CollectionDailyCalendarEditPanel
                day={editingDay}
                editableDay={editingEditableDay}
                canManage={canManage}
                onChange={(patch) => {
                  if (editingEditableDay) onUpdateEditableDay(editingEditableDay.day, patch);
                }}
                onViewDetails={onSelectDate}
              />
            ) : null}
          </div>
        )}
      </OperationalSectionCard>
    </div>
  );
}
