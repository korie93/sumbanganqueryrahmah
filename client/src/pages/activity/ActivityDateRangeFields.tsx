import { DatePickerField } from "@/components/ui/date-picker-field";
import { Label } from "@/components/ui/label";
import type { ActivityFilters } from "@/lib/api";

type ActivityDateRangeFieldsProps = {
  dateFromOpen: boolean;
  dateToOpen: boolean;
  filters: ActivityFilters;
  onDateFromOpenChange: (open: boolean) => void;
  onDateToOpenChange: (open: boolean) => void;
  onFieldChange: (field: keyof ActivityFilters, value: string) => void;
};

export function ActivityDateRangeFields({
  dateFromOpen,
  dateToOpen,
  filters,
  onDateFromOpenChange,
  onDateToOpenChange,
  onFieldChange,
}: ActivityDateRangeFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <Label className="mb-2 block text-sm font-medium">Start Date</Label>
        <DatePickerField
          value={filters.dateFrom || ""}
          onChange={(value) => onFieldChange("dateFrom", value)}
          placeholder="Select date..."
          buttonTestId="button-date-from"
          ariaLabel="Start date"
          open={dateFromOpen}
          onOpenChange={onDateFromOpenChange}
        />
      </div>

      <div>
        <Label className="mb-2 block text-sm font-medium">End Date</Label>
        <DatePickerField
          value={filters.dateTo || ""}
          onChange={(value) => onFieldChange("dateTo", value)}
          placeholder="Select date..."
          buttonTestId="button-date-to"
          ariaLabel="End date"
          open={dateToOpen}
          onOpenChange={onDateToOpenChange}
        />
      </div>
    </div>
  );
}
