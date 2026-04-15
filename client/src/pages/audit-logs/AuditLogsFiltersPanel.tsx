import { Suspense } from "react";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { ChevronDown, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AuditLogsFilterFieldsProps } from "@/pages/audit-logs/AuditLogsFilterFields";

const AuditLogsFilterFields = lazyWithPreload(() =>
  import("@/pages/audit-logs/AuditLogsFilterFields").then((module) => ({
    default: module.AuditLogsFilterFields,
  })),
);

interface AuditLogsFiltersPanelProps extends AuditLogsFilterFieldsProps {
  actionFilter: string;
  filtersOpen: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onFiltersOpenChange: (open: boolean) => void;
}

const AUDIT_LOG_FILTER_FALLBACK_KEYS = [
  "action",
  "performed-by",
  "target-user",
  "search",
  "date-range",
] as const;

function AuditLogsFilterFieldsFallback() {
  return (
    <div className="space-y-4 px-6 pb-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {AUDIT_LOG_FILTER_FALLBACK_KEYS.map((key) => (
          <div
            key={`audit-log-filter-fallback-${key}`}
            className="h-16 animate-pulse rounded-xl border border-border/60 bg-muted/20"
          />
        ))}
      </div>
      <div className="h-10 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
    </div>
  );
}

export function AuditLogsFiltersPanel({
  actionFilter,
  dateFrom,
  datePreset,
  dateTo,
  filtersOpen,
  hasActiveFilters,
  onActionFilterChange,
  onClearFilters,
  onDateFromChange,
  onDatePresetChange,
  onDateToChange,
  onFiltersOpenChange,
  onPerformedByFilterChange,
  onSearchTextChange,
  onTargetUserFilterChange,
  performedByFilter,
  searchText,
  targetUserFilter,
}: AuditLogsFiltersPanelProps) {
  const isMobile = useIsMobile();

  return (
    <Card data-floating-ai-avoid="true">
      <Collapsible open={filtersOpen} onOpenChange={onFiltersOpenChange}>
        <CardHeader className={isMobile ? "pb-2.5" : "pb-3"}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="h-auto w-full justify-between gap-3 rounded-xl px-0 py-0 text-left sm:w-auto sm:justify-start">
                <div className="flex min-w-0 items-center gap-2">
                  <Filter className="h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <CardTitle className={isMobile ? "text-base" : "text-lg"}>Search & Filters</CardTitle>
                    <p className={`mt-1 text-muted-foreground ${isMobile ? "text-xs" : "text-sm"}`}>
                      {isMobile
                        ? "Search by user, action, date, or free text."
                        : "Narrow the log list by user, action, time period, or free text."}
                    </p>
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            {hasActiveFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="w-full justify-center text-muted-foreground sm:w-auto sm:justify-start"
                data-testid="button-clear-filters"
              >
                <X className="h-4 w-4 mr-1" />
                Clear All Filters
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CollapsibleContent>
          <Suspense fallback={<AuditLogsFilterFieldsFallback />}>
            <AuditLogsFilterFields
              actionFilter={actionFilter}
              dateFrom={dateFrom}
              datePreset={datePreset}
              dateTo={dateTo}
              hasActiveFilters={hasActiveFilters}
              onActionFilterChange={onActionFilterChange}
              onDateFromChange={onDateFromChange}
              onDatePresetChange={onDatePresetChange}
              onDateToChange={onDateToChange}
              onPerformedByFilterChange={onPerformedByFilterChange}
              onSearchTextChange={onSearchTextChange}
              onTargetUserFilterChange={onTargetUserFilterChange}
              performedByFilter={performedByFilter}
              searchText={searchText}
              targetUserFilter={targetUserFilter}
            />
          </Suspense>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
