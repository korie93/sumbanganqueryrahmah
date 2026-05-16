import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionDailyOverviewResponse } from "@/lib/api";
import { CollectionDailyCalendarEditPanel } from "@/pages/collection/CollectionDailyCalendarEditPanel";
import { CollectionDailyCalendarLegend } from "@/pages/collection/CollectionDailyCalendarLegend";
import { CollectionDailyCalendarState } from "@/pages/collection/CollectionDailyCalendarState";
import { CollectionDailyMobileDayList } from "@/pages/collection/CollectionDailyMobileDayList";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

export type CollectionDailyCalendarCardProps = {
  loadingOverview: boolean;
  overview: CollectionDailyOverviewResponse | null;
  emptyOverviewMessage: string;
  firstWeekday: number;
  selectedDate: string | null;
  canManage: boolean;
  editableCalendarByDay: Map<number, EditableCalendarDay>;
  dirtyCalendarDayNumbers: ReadonlySet<number>;
  savingCalendar: boolean;
  onSaveCalendar: () => void;
  onSelectDate: (date: string) => void;
  onUpdateEditableDay: (day: number, patch: Partial<EditableCalendarDay>) => void;
};

const CollectionDailyDesktopCalendarGrid = lazy(() =>
  import("@/pages/collection/CollectionDailyDesktopCalendarGrid").then((module) => ({
    default: module.CollectionDailyDesktopCalendarGrid,
  })),
);

export function CollectionDailyCalendarCard({
  loadingOverview,
  overview,
  emptyOverviewMessage,
  firstWeekday,
  selectedDate,
  canManage,
  editableCalendarByDay,
  dirtyCalendarDayNumbers,
  savingCalendar,
  onSaveCalendar,
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
        <CollectionDailyCalendarLegend isMobile={isMobile} />

        {loadingOverview ? (
          <CollectionDailyCalendarState loading message="Loading monthly daily status..." />
        ) : !overview ? (
          <CollectionDailyCalendarState loading={false} message={emptyOverviewMessage} />
        ) : (
          <div className="space-y-3">
            {isMobile ? (
              <CollectionDailyMobileDayList
                days={overview.days}
                selectedDate={selectedDate}
                editingDayNumber={editingDayNumber}
                canManage={canManage}
                dirtyCalendarDayNumbers={dirtyCalendarDayNumbers}
                onSelectDate={onSelectDate}
                onEditDay={setEditingDayNumber}
              />
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
                      dirtyCalendarDayNumbers={dirtyCalendarDayNumbers}
                      onEditDay={setEditingDayNumber}
                      onSelectDate={onSelectDate}
                    />
                  </Suspense>
                </div>
                <CollectionDailyCalendarEditPanel
                  day={editingDay}
                  editableDay={editingEditableDay}
                  canManage={canManage}
                  isDirty={
                    editingEditableDay ? dirtyCalendarDayNumbers.has(editingEditableDay.day) : false
                  }
                  savingCalendar={savingCalendar}
                  onSaveCalendar={onSaveCalendar}
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
                isDirty={
                  editingEditableDay ? dirtyCalendarDayNumbers.has(editingEditableDay.day) : false
                }
                savingCalendar={savingCalendar}
                onSaveCalendar={onSaveCalendar}
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
