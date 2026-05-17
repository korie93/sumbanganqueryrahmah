import { AlertTriangle, CheckCircle2, CircleSlash, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import {
  statusCardClass,
  statusLabel,
  statusTextClass,
  type EditableCalendarDay,
} from "@/pages/collection/CollectionDailyShared";
import {
  CollectionDailyCalendarDayBadge,
  getCollectionDailyCalendarDayBadgeLabel,
} from "@/pages/collection/CollectionDailyCalendarDayBadge";
import {
  matchesCollectionDailyCalendarFilter,
  type CollectionDailyCalendarFilter,
} from "@/pages/collection/collection-daily-calendar-filter-utils";
import {
  isCollectionDailyCalendarIconViewMode,
  type CollectionDailyCalendarViewMode,
} from "@/pages/collection/collection-daily-calendar-view-mode-utils";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailyDesktopCalendarGridProps = {
  days: CollectionDailyOverviewDay[];
  viewMode: CollectionDailyCalendarViewMode;
  firstWeekday: number;
  selectedDate: string | null;
  editingDayNumber: number | null;
  activeFilter: CollectionDailyCalendarFilter;
  canManage: boolean;
  editableCalendarByDay: Map<number, EditableCalendarDay>;
  dirtyCalendarDayNumbers: ReadonlySet<number>;
  bulkSelectedDayNumbers: ReadonlySet<number>;
  onEditDay: (day: number) => void;
  onSelectDate: (date: string) => void;
  onToggleBulkDay: (day: number) => void;
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
  viewMode,
  firstWeekday,
  selectedDate,
  editingDayNumber,
  activeFilter,
  canManage,
  editableCalendarByDay,
  dirtyCalendarDayNumbers,
  bulkSelectedDayNumbers,
  onEditDay,
  onSelectDate,
  onToggleBulkDay,
}: CollectionDailyDesktopCalendarGridProps) {
  const iconMode = isCollectionDailyCalendarIconViewMode(viewMode);
  const showFullContent = viewMode === "content" || viewMode === "list";
  const showTileContent = viewMode === "tiles";
  const showHeatmapContent = viewMode === "heatmap";
  const showLargeIconContent = viewMode === "icon-lg";
  const showMediumIconContent = viewMode === "icon-md" || showLargeIconContent;

  return (
    <div
      className={`collection-daily-desktop-grid collection-daily-desktop-grid-mode-${viewMode} grid gap-2`}
      data-testid="collection-daily-calendar-grid"
    >
      {Array.from({ length: firstWeekday }).map((_, index) => (
        <div className="collection-daily-calendar-blank" key={`blank-${index}`} />
      ))}
      {days.map((day) => {
        const editable = editableCalendarByDay.get(day.day);
        const isSelected = selectedDate === day.date;
        const isEditing = editingDayNumber === day.day;
        const isDirty = dirtyCalendarDayNumbers.has(day.day);
        const isBulkSelected = bulkSelectedDayNumbers.has(day.day);
        const progressPercent = getDailyProgressPercent(day);
        const calendarBadgeLabel = getCollectionDailyCalendarDayBadgeLabel(day);
        const matchesActiveFilter = matchesCollectionDailyCalendarFilter(
          day,
          activeFilter,
          dirtyCalendarDayNumbers,
        );

        return (
          <div
            key={day.date}
            className={`collection-daily-desktop-day collection-daily-day-view-${viewMode} rounded-xl border text-xs shadow-sm ${
              isSelected ? "ring-2 ring-ring ring-offset-1" : ""
            } ${isEditing ? "collection-daily-day-card-editing" : ""} ${
              matchesActiveFilter ? "" : "collection-daily-day-card-filter-muted"
            } ${statusCardClass(day.status)}`}
          >
            <button
              type="button"
              className="collection-daily-day-button w-full rounded-md p-2 text-left transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label={`${formatDateDDMMYYYY(day.date)} - ${statusLabel(day.status)} - Collected ${formatAmountRM(day.amount)} - Target ${formatAmountRM(day.target)}${calendarBadgeLabel ? ` - ${calendarBadgeLabel}` : ""}${matchesActiveFilter ? "" : " - Not matching current quick filter"}${isSelected ? " - Selected" : ""}`}
              onClick={() => onSelectDate(day.date)}
              data-testid={`collection-daily-day-${day.day}`}
            >
              <div className="collection-daily-day-header mb-1 flex items-center justify-between">
                <div className="font-semibold">{day.day}</div>
                <div className="flex items-center gap-1.5">
                  {isDirty ? (
                    <span
                      className="collection-daily-unsaved-dot"
                      role="img"
                      aria-label="Unsaved calendar change"
                    />
                  ) : null}
                  <DayStatusIcon status={day.status} />
                </div>
              </div>
              <div className={`collection-daily-day-status ${statusTextClass(day.status)}`}>
                {statusLabel(day.status)}
              </div>
              {showFullContent || showTileContent || showHeatmapContent || showLargeIconContent ? (
                <div className="collection-daily-day-amount">
                  {showFullContent ? "Collected: " : ""}
                  {formatAmountRM(day.amount)}
                </div>
              ) : null}
              {showFullContent || showTileContent || showHeatmapContent ? (
                <div className="text-[10px] text-muted-foreground">
                  Customers: {day.customerCount}
                </div>
              ) : null}
              {showFullContent ? (
                <>
                  <div className="text-[10px] text-muted-foreground">
                    Required Today: {formatAmountRM(day.target)}
                  </div>
                  <progress
                    className="collection-daily-day-progress mt-2"
                    max={100}
                    value={progressPercent}
                    aria-hidden="true"
                  />
                </>
              ) : null}
              {showFullContent || showTileContent || showHeatmapContent || showMediumIconContent ? (
                <CollectionDailyCalendarDayBadge
                  day={day}
                  compact={iconMode || showTileContent || showHeatmapContent}
                />
              ) : null}
            </button>
            {canManage && editable ? (
              <div className="collection-daily-day-edit border-t border-border/40 p-2" data-floating-ai-avoid="true">
                <label className="collection-daily-bulk-day-toggle">
                  <input
                    type="checkbox"
                    checked={isBulkSelected}
                    onChange={() => onToggleBulkDay(day.day)}
                    aria-label={`Select ${formatDateDDMMYYYY(day.date)} for bulk status update`}
                  />
                  <span>Bulk select</span>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant={isEditing ? "default" : "outline"}
                  className="h-8 w-full rounded-lg text-[11px]"
                  aria-pressed={isEditing}
                  aria-label={`Edit calendar status for ${formatDateDDMMYYYY(day.date)}`}
                  onClick={() => onEditDay(day.day)}
                >
                  <Edit3 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {isDirty ? "Unsaved change" : "Edit status"}
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
