import { memo, useCallback, type ChangeEvent, type RefObject } from "react";
import { Search } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { Input } from "@/components/ui/input";
import { buildViewerSearchShortcutHint } from "@/pages/viewer/search-bar-utils";
import { ViewerSearchSummary } from "@/pages/viewer/ViewerSearchSummary";

interface ViewerSearchBarProps {
  search: string;
  filteredRowsCount: number;
  rowsCount: number;
  showResultsSummary: boolean;
  activeFilters: ActiveFilterChip[];
  searchInputRef?: RefObject<HTMLInputElement>;
  onClearAllFilters: () => void;
  onSearchChange: (value: string) => void;
}

function ViewerSearchBarImpl({
  search,
  filteredRowsCount,
  rowsCount,
  showResultsSummary,
  activeFilters,
  searchInputRef,
  onClearAllFilters,
  onSearchChange,
}: ViewerSearchBarProps) {
  const handleSearchInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value);
  }, [onSearchChange]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="relative min-w-0 max-w-xl flex-1">
          <label htmlFor="viewer-search-query" className="sr-only">
            Search all rows
          </label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            id="viewer-search-query"
            name="viewerSearchQuery"
            type="search"
            value={search}
            onChange={handleSearchInputChange}
            placeholder="Search all rows..."
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="pl-9"
            data-testid="input-search-viewer"
          />
        </div>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Press <span className="font-medium text-foreground">{buildViewerSearchShortcutHint()}</span> to focus search
        </p>
        {showResultsSummary ? (
          <ViewerSearchSummary filteredRowsCount={filteredRowsCount} rowsCount={rowsCount} />
        ) : null}
      </div>
      <ActiveFilterChips
        items={activeFilters}
        onClearAll={activeFilters.length > 0 ? onClearAllFilters : undefined}
      />
    </div>
  );
}

export const ViewerSearchBar = memo(ViewerSearchBarImpl);
