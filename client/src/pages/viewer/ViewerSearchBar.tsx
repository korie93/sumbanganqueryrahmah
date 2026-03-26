import { Filter, Search } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { Input } from "@/components/ui/input";

interface ViewerSearchBarProps {
  search: string;
  filteredRowsCount: number;
  rowsCount: number;
  showResultsSummary: boolean;
  activeFilters: ActiveFilterChip[];
  onClearAllFilters: () => void;
  onSearchChange: (value: string) => void;
}

export function ViewerSearchBar({
  search,
  filteredRowsCount,
  rowsCount,
  showResultsSummary,
  activeFilters,
  onClearAllFilters,
  onSearchChange,
}: ViewerSearchBarProps) {
  return (
    <div className="ops-toolbar mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-48 max-w-xl flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search loaded rows..."
            className="pl-9"
            data-testid="input-search-viewer"
          />
        </div>
        {showResultsSummary ? (
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-2 text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span>
              {filteredRowsCount} results of {rowsCount}
            </span>
          </div>
        ) : null}
      </div>
      <ActiveFilterChips
        items={activeFilters}
        onClearAll={activeFilters.length > 0 ? onClearAllFilters : undefined}
      />
    </div>
  );
}
