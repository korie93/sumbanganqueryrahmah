import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionDailyOverviewResponse } from "@/lib/api";
import { CollectionDailyCalendarEditDialog } from "@/pages/collection/CollectionDailyCalendarEditDialog";
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
  const editDialogOpen = canManage && editingDay !== null && editingEditableDay !== null;

  useEffect(() => {
    if (!canManage || !overview?.days.length) {
      if (editingDayNumber !== null) {
        setEditingDayNumber(null);
      }
      return;
    }

    const stillAvailable =
      editingDayNumber != null && overview.days.some((day) => day.day === editingDayNumber);

    if (editingDayNumber != null && !stillAvailable) {
      setEditingDayNumber(null);
    }
  }, [canManage, editingDayNumber, overview?.days]);

  const handleEditDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setEditingDayNumber(null);
    }
  }, []);

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
            {canManage ? (
              <div className="collection-daily-edit-helper" aria-live="polite" aria-atomic="true">
                <span className="collection-daily-edit-helper-dot" aria-hidden="true" />
                <span>
                  Klik <strong>Edit status</strong> pada mana-mana tarikh untuk buka popup editor.
                  Perubahan hanya update tarikh dan nickname yang dipilih.
                </span>
              </div>
            ) : null}

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
            )}

            {canManage ? (
              <CollectionDailyCalendarEditDialog
                open={editDialogOpen}
                day={editingDay}
                editableDay={editingEditableDay}
                isDirty={
                  editingEditableDay ? dirtyCalendarDayNumbers.has(editingEditableDay.day) : false
                }
                savingCalendar={savingCalendar}
                onOpenChange={handleEditDialogOpenChange}
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
