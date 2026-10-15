import { useId } from "react";
import {
  COLLECTION_DAILY_CALENDAR_VIEW_MODE_OPTIONS,
  getCollectionDailyCalendarViewModeStatusText,
  normalizeCollectionDailyCalendarViewMode,
  type CollectionDailyCalendarViewMode,
} from "@/pages/collection/collection-daily-calendar-view-mode-utils";

type CollectionDailyCalendarViewModeControlProps = {
  value: CollectionDailyCalendarViewMode;
  onChange: (mode: CollectionDailyCalendarViewMode) => void;
};

export function CollectionDailyCalendarViewModeControl({
  value,
  onChange,
}: CollectionDailyCalendarViewModeControlProps) {
  const statusText = getCollectionDailyCalendarViewModeStatusText(value);
  const controlId = useId();

  return (
    <section
      className="collection-daily-calendar-view-mode"
      aria-label="Calendar display options"
      data-testid="collection-daily-calendar-view-mode"
    >
      <div className="collection-daily-calendar-view-mode-header">
        <label className="collection-daily-calendar-view-mode-title" htmlFor={controlId}>
          Calendar display mode
        </label>
        <select
          id={controlId}
          aria-label="Choose calendar display mode"
          aria-describedby={`${controlId}-description`}
          className="collection-daily-calendar-view-mode-select"
          value={value}
          onChange={(event) => onChange(normalizeCollectionDailyCalendarViewMode(event.target.value))}
        >
          {COLLECTION_DAILY_CALENDAR_VIEW_MODE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </div>
      <p
        id={`${controlId}-description`}
        className="collection-daily-calendar-view-mode-status"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusText}
      </p>
    </section>
  );
}
