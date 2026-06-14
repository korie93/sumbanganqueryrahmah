import { useState, type RefObject } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { ActiveFilterChips } from "@/components/data/ActiveFilterChips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatSavedFilterDate } from "@/pages/saved/utils";
import { DatePickerField } from "@/components/ui/date-picker-field";

interface SavedFiltersBarProps {
  searchTerm: string;
  uploaderFilter: string;
  dateFilter?: Date | undefined;
  minRowsFilter: string;
  maxRowsFilter: string;
  hasActiveFilters: boolean;
  searchInputRef?: RefObject<HTMLInputElement> | undefined;
  onSearchTermChange: (value: string) => void;
  onUploaderFilterChange: (value: string) => void;
  onDateFilterChange: (date?: Date) => void;
  onMinRowsFilterChange: (value: string) => void;
  onMaxRowsFilterChange: (value: string) => void;
  onClearFilters: () => void;
}

export function SavedFiltersBar({
  searchTerm,
  uploaderFilter,
  dateFilter,
  minRowsFilter,
  maxRowsFilter,
  hasActiveFilters,
  searchInputRef,
  onSearchTermChange,
  onUploaderFilterChange,
  onDateFilterChange,
  onMinRowsFilterChange,
  onMaxRowsFilterChange,
  onClearFilters,
}: SavedFiltersBarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(
    uploaderFilter.trim() !== "" || minRowsFilter.trim() !== "" || maxRowsFilter.trim() !== "",
  );
  const activeFilters = [
    searchTerm.trim()
      ? {
          id: "saved-search",
          label: `Search: ${searchTerm.trim()}`,
          onRemove: () => onSearchTermChange(""),
        }
      : null,
    uploaderFilter.trim()
      ? {
          id: "saved-uploader",
          label: `Uploader: ${uploaderFilter.trim()}`,
          onRemove: () => onUploaderFilterChange(""),
        }
      : null,
    dateFilter
      ? {
          id: "saved-date",
          label: `Date: ${formatSavedFilterDate(dateFilter)}`,
          onRemove: () => onDateFilterChange(undefined),
        }
      : null,
    minRowsFilter.trim()
      ? {
          id: "saved-min-rows",
          label: `Rows ≥ ${minRowsFilter.trim()}`,
          onRemove: () => onMinRowsFilterChange(""),
        }
      : null,
    maxRowsFilter.trim()
      ? {
          id: "saved-max-rows",
          label: `Rows ≤ ${maxRowsFilter.trim()}`,
          onRemove: () => onMaxRowsFilterChange(""),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const dateFilterValue = dateFilter
    ? `${dateFilter.getFullYear()}-${String(dateFilter.getMonth() + 1).padStart(2, "0")}-${String(dateFilter.getDate()).padStart(2, "0")}`
    : "";

  return (
    <div className="ops-toolbar space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            id="saved-imports-search"
            name="savedImportsSearchQuery"
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Search name, filename, or uploader..."
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-10 pl-9"
            data-testid="input-search-saved"
          />
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] lg:w-auto">
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
          <Button
            type="button"
            variant="outline"
            className="h-10"
            aria-expanded={advancedOpen}
            aria-controls="saved-advanced-filters"
            onClick={() => setAdvancedOpen((open) => !open)}
            data-testid="button-toggle-saved-advanced-filters"
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            More filters
          </Button>
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
      {advancedOpen ? (
        <div
          id="saved-advanced-filters"
          className="grid gap-2 rounded-lg border border-border/60 bg-background/65 p-3 sm:grid-cols-3"
        >
          <Input
            type="search"
            value={uploaderFilter}
            onChange={(event) => onUploaderFilterChange(event.target.value)}
            placeholder="Uploader"
            aria-label="Filter saved imports by uploader"
            autoComplete="off"
            className="h-10"
            data-testid="input-saved-uploader"
          />
          <Input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={minRowsFilter}
            onChange={(event) => {
              if (event.target.value === "" || /^\d+$/.test(event.target.value)) {
                onMinRowsFilterChange(event.target.value);
              }
            }}
            placeholder="Minimum rows"
            aria-label="Minimum saved import row count"
            className="h-10"
            data-testid="input-saved-min-rows"
          />
          <Input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={maxRowsFilter}
            onChange={(event) => {
              if (event.target.value === "" || /^\d+$/.test(event.target.value)) {
                onMaxRowsFilterChange(event.target.value);
              }
            }}
            placeholder="Maximum rows"
            aria-label="Maximum saved import row count"
            className="h-10"
            data-testid="input-saved-max-rows"
          />
        </div>
      ) : null}
      <ActiveFilterChips items={activeFilters} onClearAll={hasActiveFilters ? onClearFilters : undefined} />
    </div>
  );
}
