import { Suspense, lazy, useState } from "react";
import { AlertCircle, Filter, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  buildGeneralSearchAdvancedStatusText,
  buildGeneralSearchMobileSheetDescription,
} from "@/pages/general-search/general-search-controls-utils";
import type { FilterRow } from "@/pages/general-search/types";

const GeneralSearchAdvancedControls = lazy(() =>
  import("@/pages/general-search/GeneralSearchAdvancedControls").then((module) => ({
    default: module.GeneralSearchAdvancedControls,
  })),
);

interface GeneralSearchMobileControlsProps {
  activeFilterSummaries: string[];
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

export function GeneralSearchMobileControls({
  activeFilterSummaries,
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
}: GeneralSearchMobileControlsProps) {
  const [mobileAdvancedOpen, setMobileAdvancedOpen] = useState(false);

  const handleMobileModeChange = (value: boolean) => {
    onModeChange(value);
    if (value) {
      setMobileAdvancedOpen(true);
      return;
    }
    setMobileAdvancedOpen(false);
  };

  return (
    <>
      <div
        className="glass-wrapper sticky top-2 z-[var(--z-sticky-content)] mb-3 space-y-2 p-2 shadow-lg supports-[backdrop-filter]:bg-background/80 supports-[backdrop-filter]:backdrop-blur-xl"
        data-floating-ai-avoid="true"
      >
        <div className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl border border-border/60 bg-muted/25 p-1">
            <Button
              variant="ghost"
              onClick={() => handleMobileModeChange(false)}
              className={cn(
                "h-11 w-full rounded-lg px-2 text-xs font-medium",
                advancedMode
                  ? "text-muted-foreground"
                  : "bg-background text-foreground shadow-sm hover:bg-background",
              )}
              data-testid="button-simple-search"
            >
              <Search className="mr-1 h-3.5 w-3.5" />
              Simple
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleMobileModeChange(true)}
              className={cn(
                "h-11 w-full rounded-lg px-2 text-xs font-medium",
                advancedMode
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "text-muted-foreground",
              )}
              data-testid="button-advanced-search"
            >
              <Filter className="mr-1 h-3.5 w-3.5" />
              Advanced
            </Button>
          </div>
          {(advancedMode || activeFiltersCount > 0) ? (
            <Badge variant="secondary" className="shrink-0 rounded-full px-2 py-1 text-[10px]">
              {advancedMode ? `${activeFiltersCount} filters` : "Quick"}
            </Badge>
          ) : null}
        </div>

        {advancedMode && activeFilterSummaries.length > 0 ? (
          <HorizontalScrollHint
            viewportClassName="-mx-1 flex gap-1.5 px-1 pb-1"
            hint="Swipe filters"
          >
            <Badge variant="secondary" className="shrink-0 rounded-full px-2 py-1 text-[10px]">
              {logic}
            </Badge>
            {activeFilterSummaries.slice(0, 2).map((summary) => (
              <Badge key={summary} variant="outline" className="shrink-0 rounded-full px-2 py-1 text-[10px]">
                {summary}
              </Badge>
            ))}
            {activeFilterSummaries.length > 2 ? (
              <Badge variant="secondary" className="shrink-0 rounded-full px-2 py-1 text-[10px]">
                +{activeFilterSummaries.length - 2}
              </Badge>
            ) : null}
          </HorizontalScrollHint>
        ) : null}

        {!advancedMode ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="general-search-mobile-query"
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
                className="h-11 rounded-xl pl-9 text-sm"
                data-testid="input-search"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={onSearch}
                disabled={loading}
                className="h-11 w-full rounded-xl text-xs"
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
                className="h-11 w-full rounded-xl text-xs"
                data-testid="button-reset"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Advanced filters ready</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {buildGeneralSearchAdvancedStatusText(activeFiltersCount, logic)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 shrink-0 rounded-lg px-3 text-xs"
                onClick={() => setMobileAdvancedOpen(true)}
              >
                <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
                Open
              </Button>
            </div>
          </div>
        )}

        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2.5 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs">{error}</span>
          </div>
        ) : null}
      </div>

      <Sheet open={mobileAdvancedOpen} onOpenChange={setMobileAdvancedOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[88dvh] rounded-t-[1.75rem] border-border/70 bg-background/98 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-4"
          data-floating-ai-avoid="true"
        >
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Advanced Search</SheetTitle>
            <SheetDescription>
              Combine filters with field rules, then run the search without leaving the current page.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {advancedMode ? "Advanced filter mode" : "Simple search mode"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {buildGeneralSearchMobileSheetDescription(advancedMode)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleMobileModeChange(!advancedMode)}
                className="h-10 shrink-0 rounded-xl px-3"
              >
                {advancedMode ? "Use Simple" : "Use Advanced"}
              </Button>
            </div>

            {!advancedMode ? (
              <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="general-search-sheet-query"
                    name="generalSearchQuery"
                    type="search"
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        onSearch();
                        setMobileAdvancedOpen(false);
                      }
                    }}
                    placeholder="Enter IC No., name, or other keywords..."
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-12 rounded-2xl pl-10 text-base"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => {
                      onSearch();
                      setMobileAdvancedOpen(false);
                    }}
                    disabled={loading}
                    className="h-12 w-full"
                  >
                    <Search className="h-4 w-4" />
                    Search
                  </Button>
                  <Button variant="outline" onClick={onReset} className="h-12 w-full">
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "rounded-2xl border border-border/60 bg-background/70",
                  "[&_.sticky]:rounded-b-[1.25rem] [&_.sticky]:border-border/60 [&_.sticky]:bg-background/96",
                )}
              >
                <Suspense
                  fallback={
                    <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-border/60 bg-background/60">
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
                    onSearch={() => {
                      onSearch();
                      setMobileAdvancedOpen(false);
                    }}
                    onUpdateFilter={onUpdateFilter}
                  />
                </Suspense>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
