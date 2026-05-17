import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionDailyOverviewResponse } from "@/lib/api";
import { CollectionDailyCalendarAttentionSummary } from "@/pages/collection/CollectionDailyCalendarAttentionSummary";
import { CollectionDailyCalendarBulkToolbar } from "@/pages/collection/CollectionDailyCalendarBulkToolbar";
import { CollectionDailyCalendarEditDialog } from "@/pages/collection/CollectionDailyCalendarEditDialog";
import { CollectionDailyCalendarChangeReview } from "@/pages/collection/CollectionDailyCalendarChangeReview";
import { CollectionDailyCalendarConflictReport } from "@/pages/collection/CollectionDailyCalendarConflictReport";
import { CollectionDailyCalendarLegend } from "@/pages/collection/CollectionDailyCalendarLegend";
import { CollectionDailyCalendarMonthlyBreakdown } from "@/pages/collection/CollectionDailyCalendarMonthlyBreakdown";
import { CollectionDailyCalendarQuickFilter } from "@/pages/collection/CollectionDailyCalendarQuickFilter";
import { CollectionDailyCalendarRoleModeNotice } from "@/pages/collection/CollectionDailyCalendarRoleModeNotice";
import { CollectionDailyCalendarState } from "@/pages/collection/CollectionDailyCalendarState";
import { CollectionDailyCalendarStatusSummary } from "@/pages/collection/CollectionDailyCalendarStatusSummary";
import { CollectionDailyCalendarViewModeControl } from "@/pages/collection/CollectionDailyCalendarViewModeControl";
import { CollectionDailyMobileDayList } from "@/pages/collection/CollectionDailyMobileDayList";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import {
  filterCollectionDailyCalendarDays,
  type CollectionDailyCalendarFilter,
} from "@/pages/collection/collection-daily-calendar-filter-utils";
import { useCollectionDailyCalendarViewMode } from "@/pages/collection/useCollectionDailyCalendarViewMode";

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
  onUpdateEditableDays: (dayNumbers: readonly number[], patch: Partial<EditableCalendarDay>) => void;
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
  onUpdateEditableDays,
}: CollectionDailyCalendarCardProps) {
  const isMobile = useIsMobile();
  const { viewMode, setViewMode } = useCollectionDailyCalendarViewMode();
  const [editingDayNumber, setEditingDayNumber] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<CollectionDailyCalendarFilter>("all");
  const [bulkSelectedDayNumbers, setBulkSelectedDayNumbers] = useState<Set<number>>(
    () => new Set(),
  );
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
      if (bulkSelectedDayNumbers.size > 0) {
        setBulkSelectedDayNumbers(new Set());
      }
      return;
    }

    const stillAvailable =
      editingDayNumber != null && overview.days.some((day) => day.day === editingDayNumber);

    if (editingDayNumber != null && !stillAvailable) {
      setEditingDayNumber(null);
    }

    if (bulkSelectedDayNumbers.size > 0) {
      const availableDayNumbers = new Set(overview.days.map((day) => day.day));
      const nextBulkSelectedDayNumbers = new Set(
        Array.from(bulkSelectedDayNumbers).filter((day) => availableDayNumbers.has(day)),
      );
      if (nextBulkSelectedDayNumbers.size !== bulkSelectedDayNumbers.size) {
        setBulkSelectedDayNumbers(nextBulkSelectedDayNumbers);
      }
    }
  }, [bulkSelectedDayNumbers, canManage, editingDayNumber, overview?.days]);

  const handleEditDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setEditingDayNumber(null);
    }
  }, []);

  const handleFilterChange = useCallback((filter: CollectionDailyCalendarFilter) => {
    setActiveFilter(filter);
    setEditingDayNumber(null);
  }, []);

  const handleBulkToggleDay = useCallback((dayNumber: number) => {
    setBulkSelectedDayNumbers((previous) => {
      const next = new Set(previous);
      if (next.has(dayNumber)) {
        next.delete(dayNumber);
      } else {
        next.add(dayNumber);
      }
      return next;
    });
  }, []);

  const handleBulkSelectDays = useCallback((dayNumbers: number[]) => {
    setBulkSelectedDayNumbers(new Set(dayNumbers));
  }, []);

  const handleBulkClearSelection = useCallback(() => {
    setBulkSelectedDayNumbers((previous) => (previous.size > 0 ? new Set() : previous));
  }, []);

  const handleBulkApply = useCallback((
    dayNumbers: number[],
    patch: Partial<EditableCalendarDay>,
  ) => {
    onUpdateEditableDays(dayNumbers, patch);
  }, [onUpdateEditableDays]);

  const filteredMobileDays = useMemo(() => {
    if (!overview?.days.length) return [];
    return filterCollectionDailyCalendarDays(
      overview.days,
      activeFilter,
      dirtyCalendarDayNumbers,
    );
  }, [activeFilter, dirtyCalendarDayNumbers, overview?.days]);

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
            <CollectionDailyCalendarStatusSummary
              days={overview.days}
              dirtyCalendarDayNumbers={dirtyCalendarDayNumbers}
              canManage={canManage}
            />

            <CollectionDailyCalendarAttentionSummary
              days={overview.days}
              editableCalendarByDay={editableCalendarByDay}
              dirtyCalendarDayNumbers={dirtyCalendarDayNumbers}
            />

            <CollectionDailyCalendarMonthlyBreakdown days={overview.days} />

            <CollectionDailyCalendarRoleModeNotice canEditCalendar={canManage} />

            <CollectionDailyCalendarQuickFilter
              days={overview.days}
              dirtyCalendarDayNumbers={dirtyCalendarDayNumbers}
              activeFilter={activeFilter}
              canManage={canManage}
              onFilterChange={handleFilterChange}
            />

            <CollectionDailyCalendarViewModeControl
              value={viewMode}
              onChange={setViewMode}
            />

            {canManage ? (
              <CollectionDailyCalendarBulkToolbar
                days={overview.days}
                selectedDayNumbers={bulkSelectedDayNumbers}
                onSelectDays={handleBulkSelectDays}
                onClearSelection={handleBulkClearSelection}
                onApply={handleBulkApply}
              />
            ) : null}

            <CollectionDailyCalendarConflictReport
              days={overview.days}
              editableCalendarByDay={editableCalendarByDay}
              dirtyCalendarDayNumbers={dirtyCalendarDayNumbers}
            />

            {canManage ? (
              <div className="collection-daily-edit-helper" aria-live="polite" aria-atomic="true">
                <span className="collection-daily-edit-helper-dot" aria-hidden="true" />
                <span>
                  Klik <strong>Edit status</strong> pada mana-mana tarikh untuk buka popup editor.
                  Perubahan hanya update tarikh dan nickname yang dipilih.
                </span>
              </div>
            ) : null}

            {canManage ? (
              <CollectionDailyCalendarChangeReview
                days={overview.days}
                editableCalendarByDay={editableCalendarByDay}
                dirtyCalendarDayNumbers={dirtyCalendarDayNumbers}
                savingCalendar={savingCalendar}
                onSaveCalendar={onSaveCalendar}
              />
            ) : null}

            {isMobile ? (
              filteredMobileDays.length ? (
                <CollectionDailyMobileDayList
                  days={filteredMobileDays}
                  viewMode={viewMode}
                  selectedDate={selectedDate}
                  editingDayNumber={editingDayNumber}
                  canManage={canManage}
                  dirtyCalendarDayNumbers={dirtyCalendarDayNumbers}
                  bulkSelectedDayNumbers={bulkSelectedDayNumbers}
                  onSelectDate={onSelectDate}
                  onEditDay={setEditingDayNumber}
                  onToggleBulkDay={handleBulkToggleDay}
                />
              ) : (
                <div className="collection-daily-calendar-filter-empty" role="status">
                  Tiada tarikh yang sepadan dengan filter ini.
                </div>
              )
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
                    viewMode={viewMode}
                    firstWeekday={firstWeekday}
                    selectedDate={selectedDate}
                    editingDayNumber={editingDayNumber}
                    activeFilter={activeFilter}
                    canManage={canManage}
                    editableCalendarByDay={editableCalendarByDay}
                    dirtyCalendarDayNumbers={dirtyCalendarDayNumbers}
                    bulkSelectedDayNumbers={bulkSelectedDayNumbers}
                    onEditDay={setEditingDayNumber}
                    onSelectDate={onSelectDate}
                    onToggleBulkDay={handleBulkToggleDay}
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
                username={overview.username}
                year={overview.month.year}
                month={overview.month.month}
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
