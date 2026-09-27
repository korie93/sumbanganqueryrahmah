import { Suspense, lazy } from "react";
import { AlertCircle, Filter, RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FilterRow } from "@/pages/general-search/types";

const GeneralSearchAdvancedControls = lazy(() =>
  import("@/pages/general-search/GeneralSearchAdvancedControls").then((module) => ({
    default: module.GeneralSearchAdvancedControls,
  })),
);

interface GeneralSearchDesktopControlsProps {
  activeFiltersCount: number;
  advancedMode: boolean;
  columns: string[];
  error: string;
  filters: FilterRow[];
  loading: boolean;
  loadingColumns: boolean;
  logic: "AND" | "OR";
  query: string;
  onAddFilter: () => void;
  onLogicChange: (value: "AND" | "OR") => void;
  onModeChange: (value: boolean) => void;
  onQueryChange: (value: string) => void;
  onRemoveFilter: (id: string) => void;
  onReset: () => void;
  onSearch: () => void;
  onUpdateFilter: (id: string, updates: Partial<FilterRow>) => void;
}

export function GeneralSearchDesktopControls({
  activeFiltersCount,
  advancedMode,
  columns,
  error,
  filters,
  loading,
  loadingColumns,
  logic,
  query,
  onAddFilter,
  onLogicChange,
  onModeChange,
  onQueryChange,
  onRemoveFilter,
  onReset,
  onSearch,
  onUpdateFilter,
}: GeneralSearchDesktopControlsProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4" data-floating-ai-avoid="true">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          variant={advancedMode ? "outline" : "default"}
          size="sm"
          className="h-9"
          onClick={() => onModeChange(false)}
          data-testid="button-simple-search"
        >
          <Search className="mr-2 h-4 w-4" />
          Simple Search
        </Button>
        <Button
          variant={advancedMode ? "default" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => onModeChange(true)}
          data-testid="button-advanced-search"
        >
          <Filter className="mr-2 h-4 w-4" />
          Advanced Search
          {activeFiltersCount > 0 ? (
            <Badge variant="secondary" className="ml-2">
              {activeFiltersCount}
            </Badge>
          ) : null}
        </Button>
      </div>

      {!advancedMode ? (
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="general-search-desktop-query"
              name="generalSearchQuery"
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch();
              }}
              placeholder="Enter IC No., name, or other keywords..."
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-9 pl-9 text-sm"
              data-testid="input-search"
            />
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              onClick={onSearch}
              disabled={loading}
              className="h-9 px-4"
              data-testid="button-search"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Searching...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Search
                </div>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={onReset}
              className="h-9 px-4"
              data-testid="button-reset"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </div>
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="flex min-h-[160px] items-center justify-center rounded-md border border-border bg-muted/20">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
          }
        >
          <GeneralSearchAdvancedControls
            columns={columns}
            filters={filters}
            loading={loading}
            loadingColumns={loadingColumns}
            logic={logic}
            onAddFilter={onAddFilter}
            onLogicChange={onLogicChange}
            onRemoveFilter={onRemoveFilter}
            onReset={onReset}
            onSearch={onSearch}
            onUpdateFilter={onUpdateFilter}
          />
        </Suspense>
      )}

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      ) : null}
    </div>
  );
}
