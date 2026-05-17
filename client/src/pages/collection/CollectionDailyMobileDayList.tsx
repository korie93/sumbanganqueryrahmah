import { Edit3, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import {
  statusCardClass,
  statusLabel,
  statusTextClass,
} from "@/pages/collection/CollectionDailyShared";
import {
  CollectionDailyCalendarDayBadge,
  getCollectionDailyCalendarDayBadgeLabel,
} from "@/pages/collection/CollectionDailyCalendarDayBadge";
import { CollectionDailyDayStatusIcon } from "@/pages/collection/CollectionDailyDayStatusIcon";
import {
  isCollectionDailyCalendarIconViewMode,
  type CollectionDailyCalendarViewMode,
} from "@/pages/collection/collection-daily-calendar-view-mode-utils";
import { getCollectionDailyCalendarProgressBand } from "@/pages/collection/collection-daily-calendar-progress-utils";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailyMobileDayListProps = {
  days: CollectionDailyOverviewDay[];
  viewMode: CollectionDailyCalendarViewMode;
  selectedDate: string | null;
  editingDayNumber: number | null;
  canManage: boolean;
  dirtyCalendarDayNumbers: ReadonlySet<number>;
  bulkSelectedDayNumbers: ReadonlySet<number>;
  onSelectDate: (date: string) => void;
  onEditDay: (day: number) => void;
  onToggleBulkDay: (day: number) => void;
};

export function CollectionDailyMobileDayList({
  days,
  viewMode,
  selectedDate,
  editingDayNumber,
  canManage,
  dirtyCalendarDayNumbers,
  bulkSelectedDayNumbers,
  onSelectDate,
  onEditDay,
  onToggleBulkDay,
}: CollectionDailyMobileDayListProps) {
  const iconMode = isCollectionDailyCalendarIconViewMode(viewMode);
  const showFullContent = viewMode === "content" || viewMode === "list";
  const showTileContent = viewMode === "tiles";
  const showHeatmapContent = viewMode === "heatmap";
  const showLargeIconContent = viewMode === "icon-lg";
  const showMediumIconContent = viewMode === "icon-md" || showLargeIconContent;

  return (
    <div
      className={`collection-daily-mobile-day-list collection-daily-mobile-day-list-mode-${viewMode} space-y-3`}
      data-testid="collection-daily-calendar-mobile-list"
    >
      {days.map((day) => {
        const isSelected = selectedDate === day.date;
        const isEditing = editingDayNumber === day.day;
        const isDirty = dirtyCalendarDayNumbers.has(day.day);
        const isBulkSelected = bulkSelectedDayNumbers.has(day.day);
        const progressBand = getCollectionDailyCalendarProgressBand(day);
        const calendarBadgeLabel = getCollectionDailyCalendarDayBadgeLabel(day);

        return (
          <article
            key={day.date}
            className={`collection-daily-mobile-day-card collection-daily-day-progress-band-${progressBand} rounded-2xl border shadow-sm ${statusCardClass(day.status)} ${
              isSelected ? "ring-2 ring-ring ring-offset-1" : ""
            } ${isEditing ? "collection-daily-day-card-editing" : ""}`}
          >
            <div className="px-3 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="collection-daily-mobile-day-kicker text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Day {day.day}
                  </p>
                  <p className="collection-daily-mobile-day-date font-semibold text-foreground">
                    {formatDateDDMMYYYY(day.date)}
                  </p>
                </div>
                <span className="collection-daily-mobile-status-pill inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground">
                  {isDirty ? (
                    <span
                      className="collection-daily-unsaved-dot"
                      role="img"
                      aria-label="Unsaved calendar change"
                    />
                  ) : null}
                  <CollectionDailyDayStatusIcon status={day.status} />
                  {statusLabel(day.status)}
                </span>
              </div>

              {showFullContent || showTileContent || showHeatmapContent || showLargeIconContent ? (
                <div className="collection-daily-mobile-day-metrics mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="collection-daily-day-metric collection-daily-day-metric-primary rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                      <p className="uppercase tracking-[0.12em] text-muted-foreground">Collected</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {formatAmountRM(day.amount)}
                    </p>
                  </div>
                  {showFullContent || showTileContent || showHeatmapContent ? (
                    <div className="collection-daily-day-metric rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                      <p className="uppercase tracking-[0.12em] text-muted-foreground">Target</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {formatAmountRM(day.target)}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {showFullContent || showTileContent || showHeatmapContent ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border/50 bg-background/70 px-2.5 py-1">
                    Customers {day.customerCount}
                  </span>
                  <span
                    className={`rounded-full border border-border/50 bg-background/70 px-2.5 py-1 ${statusTextClass(day.status)}`}
                  >
                    {statusLabel(day.status)}
                  </span>
                </div>
              ) : null}

              {showFullContent || showTileContent || showHeatmapContent || showMediumIconContent ? (
                <CollectionDailyCalendarDayBadge
                  day={day}
                  compact={iconMode || showTileContent || showHeatmapContent}
                />
              ) : null}

              {canManage ? (
                <label className="collection-daily-bulk-day-toggle collection-daily-bulk-day-toggle-mobile">
                  <input
                    type="checkbox"
                    checked={isBulkSelected}
                    onChange={() => onToggleBulkDay(day.day)}
                    aria-label={`Select ${formatDateDDMMYYYY(day.date)} for bulk status update`}
                  />
                  <span>Pilih untuk bulk update</span>
                </label>
              ) : null}

              <div className="mt-3 grid gap-2 sm:grid-cols-2" data-floating-ai-avoid="true">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl bg-background/80"
                  aria-label={`View collection details for ${formatDateDDMMYYYY(day.date)}${calendarBadgeLabel ? ` - ${calendarBadgeLabel}` : ""}`}
                  onClick={() => onSelectDate(day.date)}
                  data-testid={`collection-daily-day-${day.day}`}
                >
                  <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                  View details
                </Button>
                {canManage && isEditing ? (
                  <Button
                    type="button"
                    variant="default"
                    className="h-10 rounded-xl"
                    aria-pressed="true"
                    aria-label={`Edit calendar status for ${formatDateDDMMYYYY(day.date)}`}
                    onClick={() => onEditDay(day.day)}
                  >
                    <Edit3 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isDirty ? "Unsaved change" : "Edit status"}
                  </Button>
                ) : null}
                {canManage && !isEditing ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl"
                    aria-pressed="false"
                    aria-label={`Edit calendar status for ${formatDateDDMMYYYY(day.date)}`}
                    onClick={() => onEditDay(day.day)}
                  >
                    <Edit3 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isDirty ? "Unsaved change" : "Edit status"}
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
