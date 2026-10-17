import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CollectionDailyPeriodFieldsProps } from "@/pages/collection/collection-daily-filters-card-shared";

export function CollectionDailyPeriodFields({
  yearInput,
  monthInput,
  minYear,
  maxYear,
  onYearInputChange,
  onMonthInputChange,
  onYearCommit,
  onMonthCommit,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  canPreviousMonth = true,
  canNextMonth = true,
  isCurrentMonth = false,
  periodNavigationDisabled = false,
  periodNavigationDisabledReason,
  isMobile,
  containerClassName,
}: CollectionDailyPeriodFieldsProps) {
  const inputClassName = "h-11 rounded-md bg-background min-h-11 sm:h-11 sm:min-h-11";
  const wrapperClassName =
    containerClassName ?? `grid gap-3 ${isMobile ? "sm:grid-cols-2" : "md:grid-cols-4"}`;
  const showNavigation = Boolean(onPreviousMonth && onNextMonth && onCurrentMonth);
  const navigationDescriptionId = periodNavigationDisabledReason ? "collection-daily-period-help" : undefined;

  return (
    <div className="collection-daily-period-controls">
      <div className={wrapperClassName}>
        <div className="space-y-2">
          <Label className="block" htmlFor="collection-daily-year-input">Year</Label>
          <Input
            id="collection-daily-year-input"
            name="collectionDailyYear"
            type="number"
            min={minYear}
            max={maxYear}
            value={yearInput}
            disabled={periodNavigationDisabled}
            aria-describedby={navigationDescriptionId}
            onChange={(event) => onYearInputChange(event.target.value)}
            onBlur={onYearCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onYearCommit();
              }
            }}
            className={inputClassName}
          />
        </div>
        <div className="space-y-2">
          <Label className="block" htmlFor="collection-daily-month-input">Month</Label>
          <Input
            id="collection-daily-month-input"
            name="collectionDailyMonth"
            type="number"
            min={1}
            max={12}
            value={monthInput}
            disabled={periodNavigationDisabled}
            aria-describedby={navigationDescriptionId}
            onChange={(event) => onMonthInputChange(event.target.value)}
            onBlur={onMonthCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onMonthCommit();
              }
            }}
            className={inputClassName}
          />
        </div>
      </div>
      {showNavigation ? (
        <nav className="collection-daily-period-navigation" aria-label="Navigasi bulan Collection Daily">
          <Button
            type="button"
            variant="outline"
            className="collection-daily-period-step"
            aria-label="Bulan sebelumnya"
            aria-describedby={navigationDescriptionId}
            disabled={periodNavigationDisabled || !canPreviousMonth}
            onClick={onPreviousMonth}
            data-testid="collection-daily-previous-month"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="collection-daily-period-current"
            aria-label="Bulan ini"
            aria-describedby={navigationDescriptionId}
            disabled={periodNavigationDisabled || isCurrentMonth}
            onClick={onCurrentMonth}
            data-testid="collection-daily-current-month"
          >
            Bulan ini
          </Button>
          <Button
            type="button"
            variant="outline"
            className="collection-daily-period-step"
            aria-label="Bulan seterusnya"
            aria-describedby={navigationDescriptionId}
            disabled={periodNavigationDisabled || !canNextMonth}
            onClick={onNextMonth}
            data-testid="collection-daily-next-month"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </nav>
      ) : null}
      {periodNavigationDisabledReason ? (
        <p id={navigationDescriptionId} className="collection-daily-period-help" role="status">
          {periodNavigationDisabledReason}
        </p>
      ) : null}
    </div>
  );
}
