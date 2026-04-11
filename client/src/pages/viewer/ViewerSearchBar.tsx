import type { RefObject } from "react";
import { Search } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
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

export function ViewerSearchBar({
  search,
  filteredRowsCount,
  rowsCount,
  showResultsSummary,
  activeFilters,
  searchInputRef,
  onClearAllFilters,
  onSearchChange,
}: ViewerSearchBarProps) {
  const isMobile = useIsMobile();

  return (
    <div
      className={`ops-toolbar mb-4 space-y-3 ${
        isMobile
          ? "sticky top-2 z-[var(--z-sticky-content)] border-border/70 bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85"
          : ""
      }`}
      data-floating-ai-avoid={isMobile ? "true" : undefined}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-48 max-w-xl flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            id="viewer-search-query"
            name="viewerSearchQuery"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search all rows..."
            autoComplete="off"
            className="pl-9"
            data-testid="input-search-viewer"
          />
        </div>
        <p className="text-xs text-muted-foreground">
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
