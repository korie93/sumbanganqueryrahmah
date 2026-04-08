import type { RefObject } from "react";
import { Search, X } from "lucide-react";
import { ActiveFilterChips } from "@/components/data/ActiveFilterChips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatSavedFilterDate } from "@/pages/saved/utils";
import { DatePickerField } from "@/components/ui/date-picker-field";

interface SavedFiltersBarProps {
  searchTerm: string;
  dateFilter?: Date | undefined;
  hasActiveFilters: boolean;
  searchInputRef?: RefObject<HTMLInputElement> | undefined;
  onSearchTermChange: (value: string) => void;
  onDateFilterChange: (date?: Date) => void;
  onClearFilters: () => void;
}

export function SavedFiltersBar({
  searchTerm,
  dateFilter,
  hasActiveFilters,
  searchInputRef,
  onSearchTermChange,
  onDateFilterChange,
  onClearFilters,
}: SavedFiltersBarProps) {
  const activeFilters = [
    searchTerm.trim()
      ? {
          id: "saved-search",
          label: `Search: ${searchTerm.trim()}`,
          onRemove: () => onSearchTermChange(""),
        }
      : null,
    dateFilter
      ? {
          id: "saved-date",
          label: `Date: ${formatSavedFilterDate(dateFilter)}`,
          onRemove: () => onDateFilterChange(undefined),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const dateFilterValue = dateFilter
    ? `${dateFilter.getFullYear()}-${String(dateFilter.getMonth() + 1).padStart(2, "0")}-${String(dateFilter.getDate()).padStart(2, "0")}`
    : "";

  return (
    <div className="ops-toolbar space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="relative w-full flex-1 sm:min-w-48 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Search by name or filename..."
            className="h-10 pl-9"
            data-testid="input-search-saved"
          />
        </div>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Press <span className="font-medium text-foreground">/</span> to focus search
        </p>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center">
          <DatePickerField
            value={dateFilterValue}
            onChange={(value) => {
              if (!value) {
                onDateFilterChange(undefined);
                return;
              }

              const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
              if (!year || !month || !day) {
                onDateFilterChange(undefined);
                return;
              }

              onDateFilterChange(new Date(year, month - 1, day, 12, 0, 0));
            }}
            placeholder="Filter by date"
            buttonTestId="button-date-filter"
            ariaLabel={dateFilter ? `Filter by date, selected ${formatSavedFilterDate(dateFilter)}` : "Filter by date"}
            className="w-full min-w-0 sm:min-w-[210px]"
          />
          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 justify-center sm:h-9 sm:justify-start"
              onClick={onClearFilters}
              data-testid="button-clear-filters"
            >
              <X className="w-4 h-4 mr-1" />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>
      <ActiveFilterChips items={activeFilters} onClearAll={hasActiveFilters ? onClearFilters : undefined} />
    </div>
  );
}
