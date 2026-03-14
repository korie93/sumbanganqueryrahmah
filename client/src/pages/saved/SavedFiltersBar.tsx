import { CalendarIcon, Search, X } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SavedFiltersBarProps {
  searchTerm: string;
  dateFilter?: Date;
  hasActiveFilters: boolean;
  onSearchTermChange: (value: string) => void;
  onDateFilterChange: (date?: Date) => void;
  onClearFilters: () => void;
}

export function SavedFiltersBar({
  searchTerm,
  dateFilter,
  hasActiveFilters,
  onSearchTermChange,
  onDateFilterChange,
  onClearFilters,
}: SavedFiltersBarProps) {
  return (
    <div className="glass-wrapper p-4 mb-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Search by name or filename..."
            className="pl-9"
            data-testid="input-search-saved"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={dateFilter ? "border-primary" : ""}
              data-testid="button-date-filter"
            >
              <CalendarIcon className="w-4 h-4 mr-2" />
              {dateFilter ? format(dateFilter, "dd MMM yyyy") : "Filter by date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFilter}
              onSelect={(date) => {
                if (date) {
                  onDateFilterChange(
                    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0),
                  );
                  return;
                }

                onDateFilterChange(undefined);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
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
    </div>
  );
}
