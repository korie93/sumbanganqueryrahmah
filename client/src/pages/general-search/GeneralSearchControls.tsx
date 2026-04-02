import { Suspense, lazy, useState } from "react";
import { AlertCircle, Filter, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { FilterRow } from "@/pages/general-search/types";

const GeneralSearchAdvancedControls = lazy(() =>
  import("@/pages/general-search/GeneralSearchAdvancedControls").then((module) => ({
    default: module.GeneralSearchAdvancedControls,
  })),
);

interface GeneralSearchControlsProps {
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

export function GeneralSearchControls({
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
}: GeneralSearchControlsProps) {
  const isMobile = useIsMobile();
  const [mobileAdvancedOpen, setMobileAdvancedOpen] = useState(false);

  const handleMobileModeChange = (value: boolean) => {
    onModeChange(value);
    if (value) {
      setMobileAdvancedOpen(true);
    } else {
      setMobileAdvancedOpen(false);
    }
  };

  if (isMobile) {
    return (
      <>
        <div className="glass-wrapper mb-6 space-y-4 p-4" data-floating-ai-avoid="true">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Search Controls
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">Find records quickly</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Use quick keyword search or open the advanced filter sheet for field-by-field matching.
              </p>
            </div>
            {(advancedMode || activeFiltersCount > 0) ? (
              <Badge variant="secondary" className="shrink-0 rounded-full px-3 py-1 text-xs">
                {advancedMode ? `${activeFiltersCount} filters` : "Quick search"}
              </Badge>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={advancedMode ? "outline" : "default"}
              size="default"
              onClick={() => handleMobileModeChange(false)}
              className="h-11 w-full"
              data-testid="button-simple-search"
            >
              <Search className="mr-2 h-4 w-4" />
              Simple Search
            </Button>
            <Button
              variant={advancedMode ? "default" : "outline"}
              size="default"
              onClick={() => handleMobileModeChange(true)}
              className="h-11 w-full"
              data-testid="button-advanced-search"
            >
              <Filter className="mr-2 h-4 w-4" />
              Advanced
              {activeFiltersCount > 0 ? (
                <Badge variant="secondary" className="ml-2">
                  {activeFiltersCount}
                </Badge>
              ) : null}
            </Button>
          </div>

          {!advancedMode ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onSearch();
                  }}
                  placeholder="Enter IC No., name, or other keywords..."
                  className="h-12 rounded-2xl pl-10 text-base"
                  data-testid="input-search"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={onSearch}
                  disabled={loading}
                  className="h-12 w-full"
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
                  className="h-12 w-full"
                  data-testid="button-reset"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Advanced filters ready</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {activeFiltersCount > 0
                      ? `${activeFiltersCount} filter${activeFiltersCount === 1 ? "" : "s"} configured with ${logic} logic.`
                      : "Open the filter sheet to choose fields, operators, and values."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 shrink-0 rounded-xl px-3"
                  onClick={() => setMobileAdvancedOpen(true)}
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Open
                </Button>
              </div>
            </div>
          )}

          {error ? (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
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
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={advancedMode ? "outline" : "default"}
                  size="default"
                  onClick={() => handleMobileModeChange(false)}
                  className="h-11 w-full"
                >
                  <Search className="mr-2 h-4 w-4" />
                  Simple
                </Button>
                <Button
                  variant={advancedMode ? "default" : "outline"}
                  size="default"
                  onClick={() => handleMobileModeChange(true)}
                  className="h-11 w-full"
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Advanced
                </Button>
              </div>

              {!advancedMode ? (
                <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => onQueryChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          onSearch();
                          setMobileAdvancedOpen(false);
                        }
                      }}
                      placeholder="Enter IC No., name, or other keywords..."
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

  return (
    <div className="glass-wrapper mb-6 p-4 sm:p-6" data-floating-ai-avoid="true">
      <div className={`mb-4 ${isMobile ? "grid grid-cols-2 gap-2" : "flex flex-wrap items-center gap-3"}`}>
        <Button
          variant={advancedMode ? "outline" : "default"}
          size={isMobile ? "default" : "sm"}
          onClick={() => onModeChange(false)}
          className={isMobile ? "h-11 w-full" : ""}
          data-testid="button-simple-search"
        >
          <Search className="mr-2 h-4 w-4" />
          Simple Search
        </Button>
        <Button
          variant={advancedMode ? "default" : "outline"}
          size={isMobile ? "default" : "sm"}
          onClick={() => onModeChange(true)}
          className={isMobile ? "h-11 w-full" : ""}
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
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch();
              }}
              placeholder="Enter IC No., name, or other keywords..."
              className="h-12 pl-10 text-base"
              data-testid="input-search"
            />
          </div>
          <div className={`gap-3 ${isMobile ? "grid grid-cols-1" : "flex flex-wrap"}`}>
            <Button
              onClick={onSearch}
              disabled={loading}
              className={isMobile ? "h-12 w-full" : "h-12 px-6"}
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
              className={isMobile ? "h-11 w-full" : "h-12 px-6"}
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
