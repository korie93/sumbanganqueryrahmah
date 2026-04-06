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
  isMobile,
  containerClassName,
}: CollectionDailyPeriodFieldsProps) {
  const inputClassName = isMobile ? "h-12 rounded-2xl" : undefined;
  const wrapperClassName =
    containerClassName ?? `grid gap-4 ${isMobile ? "sm:grid-cols-2" : "md:grid-cols-4"}`;

  return (
    <div className={wrapperClassName}>
      <div className="space-y-2">
        <Label>Year</Label>
        <Input
          type="number"
          min={minYear}
          max={maxYear}
          value={yearInput}
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
        <Label>Month</Label>
        <Input
          type="number"
          min={1}
          max={12}
          value={monthInput}
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
  );
}
