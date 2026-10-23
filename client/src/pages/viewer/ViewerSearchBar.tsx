import { memo, useCallback, type ChangeEvent, type ReactNode, type RefObject } from "react";
import { Search, X } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { Input } from "@/components/ui/input";
import { buildViewerSearchShortcutHint } from "@/pages/viewer/search-bar-utils";
import { ViewerSearchSummary } from "@/pages/viewer/ViewerSearchSummary";

interface ViewerSearchBarProps {
  actions?: ReactNode;
  search: string;
  filteredRowsCount: number;
  rowsCount: number;
  showResultsSummary: boolean;
  activeFilters: ActiveFilterChip[];
  searchInputRef?: RefObject<HTMLInputElement>;
  totalRows?: number | undefined;
  loading?: boolean | undefined;
  hasError?: boolean | undefined;
  isSearchBelowMinLength?: boolean | undefined;
  minSearchLength?: number | undefined;
  onClearAllFilters: () => void;
  onSearchChange: (value: string) => void;
}

function ViewerSearchBarImpl({
  actions,
  search,
  filteredRowsCount,
  rowsCount,
  showResultsSummary,
  activeFilters,
  searchInputRef,
  totalRows,
  loading = false,
  hasError = false,
  isSearchBelowMinLength = false,
  minSearchLength = 2,
  onClearAllFilters,
  onSearchChange,
}: ViewerSearchBarProps) {
  const handleSearchInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value);
  }, [onSearchChange]);
  const handleClearSearch = useCallback(() => {
    onSearchChange("");
    searchInputRef?.current?.focus({ preventScroll: true });
  }, [onSearchChange, searchInputRef]);
  const resultMessage = loading
    ? search.trim() ? "Mencari rekod..." : "Memuatkan rekod..."
    : hasError ? "Rekod tidak dapat dimuatkan."
      : isSearchBelowMinLength ? `Masukkan sekurang-kurangnya ${minSearchLength} aksara untuk carian.`
        : undefined;

  return (
    <div className="viewer-search-controls space-y-2">
      <div className="viewer-search-toolbar">
        <div className="viewer-search-input relative min-w-0 flex-1">
          <label htmlFor="viewer-search-query" className="sr-only">
            Search all rows
          </label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={searchInputRef}
            id="viewer-search-query"
            name="viewerSearchQuery"
            type="search"
            value={search}
            onChange={handleSearchInputChange}
            placeholder="Cari semua rekod..."
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="pl-9 pr-11"
            data-testid="input-search-viewer"
          />
          {search ? (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <kbd
              aria-hidden="true"
              title="Press / to search"
              className="pointer-events-none absolute right-3 top-1/2 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded border border-border bg-muted px-1 text-xs text-muted-foreground sm:inline-flex"
            >
              {buildViewerSearchShortcutHint()}
            </kbd>
          )}
        </div>
        {actions ? <div className="viewer-search-actions min-w-0">{actions}</div> : null}
      </div>
      <ViewerSearchSummary
        filteredRowsCount={filteredRowsCount}
        rowsCount={rowsCount}
        totalRows={totalRows}
        message={resultMessage}
        visible={showResultsSummary || Boolean(resultMessage)}
      />
      <ActiveFilterChips
        items={activeFilters}
        onClearAll={activeFilters.length > 0 ? onClearAllFilters : undefined}
      />
    </div>
  );
}

export const ViewerSearchBar = memo(ViewerSearchBarImpl);
