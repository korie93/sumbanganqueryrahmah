import type { CollectionDailyOverviewDay } from "@/lib/api";
import {
  buildCollectionDailyCalendarFilterOptions,
  getCollectionDailyCalendarFilterStatusText,
  type CollectionDailyCalendarFilter,
} from "@/pages/collection/collection-daily-calendar-filter-utils";

type CollectionDailyCalendarQuickFilterProps = {
  days: CollectionDailyOverviewDay[];
  dirtyCalendarDayNumbers: ReadonlySet<number>;
  activeFilter: CollectionDailyCalendarFilter;
  canManage: boolean;
  onFilterChange: (filter: CollectionDailyCalendarFilter) => void;
};

export function CollectionDailyCalendarQuickFilter({
  days,
  dirtyCalendarDayNumbers,
  activeFilter,
  canManage,
  onFilterChange,
}: CollectionDailyCalendarQuickFilterProps) {
  const options = buildCollectionDailyCalendarFilterOptions(
    days,
    dirtyCalendarDayNumbers,
    canManage,
  );
  const activeOption = options.find((option) => option.id === activeFilter) ?? options[0];
  const statusText = activeOption
    ? getCollectionDailyCalendarFilterStatusText(activeOption.id, activeOption.count, days.length)
    : "";

  return (
    <section
      className="collection-daily-calendar-filter"
      aria-label="Quick filter daily calendar"
      data-testid="collection-daily-calendar-filter"
    >
      <div className="collection-daily-calendar-filter-header">
        <div>
          <p className="collection-daily-calendar-filter-title">Quick filter</p>
          <p className="collection-daily-calendar-filter-description">
            Desktop highlights matching days; mobile shows matching days only.
          </p>
        </div>
        <p className="collection-daily-calendar-filter-status" aria-live="polite" aria-atomic="true">
          {statusText}
        </p>
      </div>
      <div className="collection-daily-calendar-filter-options" role="group" aria-label="Calendar day filters">
        {options.map((option) => {
          const active = activeFilter === option.id;
          const className = `collection-daily-calendar-filter-option ${
            active ? "collection-daily-calendar-filter-option-active" : ""
          }`;
          const buttonContent = (
            <>
              <span>{option.label}</span>
              <strong>{option.count}</strong>
            </>
          );

          return active ? (
            <button
              key={option.id}
              type="button"
              className={className}
              aria-pressed="true"
              title={option.description}
              onClick={() => onFilterChange(option.id)}
            >
              {buttonContent}
            </button>
          ) : (
            <button
              key={option.id}
              type="button"
              className={className}
              aria-pressed="false"
              title={option.description}
              onClick={() => onFilterChange(option.id)}
            >
              {buttonContent}
            </button>
          );
        })}
      </div>
    </section>
  );
}
