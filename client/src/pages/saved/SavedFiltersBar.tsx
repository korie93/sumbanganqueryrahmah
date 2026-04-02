import type { RefObject } from "react";
import { Search, X } from "lucide-react";
import { ActiveFilterChips } from "@/components/data/ActiveFilterChips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatSavedFilterDate } from "@/pages/saved/utils";
import { DatePickerField } from "@/components/ui/date-picker-field";

interface SavedFiltersBarProps {
  searchTerm: string;
  dateFilter?: Date;
  hasActiveFilters: boolean;
  searchInputRef?: RefObject<HTMLInputElement>;
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
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Search by name or filename..."
            className="pl-9"
            data-testid="input-search-saved"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Press <span className="font-medium text-foreground">/</span> to focus search
        </p>
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
          className="min-w-[210px]"
        />
        {hasActiveFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            data-testid="button-clear-filters"
          >
            <X className="w-4 h-4 mr-1" />
            Clear filters
          </Button>
        ) : null}
      </div>
      <ActiveFilterChips items={activeFilters} onClearAll={hasActiveFilters ? onClearFilters : undefined} />
    </div>
  );
}
