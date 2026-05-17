import {
  LayoutGrid,
  LayoutPanelTop,
  List,
  Maximize2,
  Minimize2,
  Rows3,
  type LucideIcon,
} from "lucide-react";
import {
  COLLECTION_DAILY_CALENDAR_VIEW_MODE_OPTIONS,
  getCollectionDailyCalendarViewModeStatusText,
  type CollectionDailyCalendarViewMode,
} from "@/pages/collection/collection-daily-calendar-view-mode-utils";

type CollectionDailyCalendarViewModeControlProps = {
  value: CollectionDailyCalendarViewMode;
  onChange: (mode: CollectionDailyCalendarViewMode) => void;
};

const VIEW_MODE_ICONS: Record<CollectionDailyCalendarViewMode, LucideIcon> = {
  list: List,
  "icon-sm": Minimize2,
  "icon-md": Rows3,
  "icon-lg": Maximize2,
  tiles: LayoutGrid,
  content: LayoutPanelTop,
};

export function CollectionDailyCalendarViewModeControl({
  value,
  onChange,
}: CollectionDailyCalendarViewModeControlProps) {
  const statusText = getCollectionDailyCalendarViewModeStatusText(value);

  return (
    <section
      className="collection-daily-calendar-view-mode"
      aria-label="Calendar display options"
      data-testid="collection-daily-calendar-view-mode"
    >
      <div className="collection-daily-calendar-view-mode-header">
        <div>
          <p className="collection-daily-calendar-view-mode-title">Paparan kalendar</p>
          <p className="collection-daily-calendar-view-mode-description">
            Tukar rupa kalendar ikut keselesaan: list, tile, ikon kecil, sederhana atau besar.
          </p>
        </div>
        <p
          className="collection-daily-calendar-view-mode-status"
          aria-live="polite"
          aria-atomic="true"
        >
          {statusText}
        </p>
      </div>
      <div
        className="collection-daily-calendar-view-mode-options"
        role="group"
        aria-label="Choose calendar display mode"
      >
        {COLLECTION_DAILY_CALENDAR_VIEW_MODE_OPTIONS.map((option) => {
          const Icon = VIEW_MODE_ICONS[option.id];
          const active = value === option.id;

          return (
            <button
              key={option.id}
              type="button"
              className={`collection-daily-calendar-view-mode-option ${
                active ? "collection-daily-calendar-view-mode-option-active" : ""
              }`}
              aria-pressed={active}
              aria-label={`${option.label}. ${option.description}`}
              title={option.description}
              onClick={() => onChange(option.id)}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
