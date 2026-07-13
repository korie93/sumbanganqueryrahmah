import { Suspense, lazy } from "react";
import { ChevronDown, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { AuditLogsSavedViewsPanel } from "@/pages/audit-logs/AuditLogsSavedViewsPanel";
import type { AuditLogsFilterFieldsProps } from "@/pages/audit-logs/AuditLogsFilterFields";
import type { AuditLogFilters } from "@/pages/audit-logs/types";

const AuditLogsFilterFields = lazy(() =>
  import("@/pages/audit-logs/AuditLogsFilterFields").then((module) => ({
    default: module.AuditLogsFilterFields,
  })),
);

interface AuditLogsFiltersPanelProps extends AuditLogsFilterFieldsProps {
  actionFilter: string;
  filtersOpen: boolean;
  filters: AuditLogFilters;
  hasActiveFilters: boolean;
  onApplyFilters: (filters: AuditLogFilters) => void;
  onClearFilters: () => void;
  onFiltersOpenChange: (open: boolean) => void;
}

const AUDIT_LOG_FILTER_FALLBACK_KEYS = [
  "action",
  "risk",
  "category",
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
  categoryFilter,
  dateFrom,
  datePreset,
  dateTo,
  filtersOpen,
  filters,
  hasActiveFilters,
  onActionFilterChange,
  onApplyFilters,
  onCategoryFilterChange,
  onClearFilters,
  onDateFromChange,
  onDatePresetChange,
  onDateToChange,
  onFiltersOpenChange,
  onPerformedByFilterChange,
  onRiskFilterChange,
  onSearchTextChange,
  onTargetUserFilterChange,
  performedByFilter,
  riskFilter,
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
              <Button variant="ghost" className="h-auto min-w-0 w-full justify-between gap-3 whitespace-normal rounded-xl px-0 py-0 text-left">
                <div className="flex min-w-0 items-start gap-2">
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
          <AuditLogsSavedViewsPanel
            filters={filters}
            hasActiveFilters={hasActiveFilters}
            onApplyFilters={onApplyFilters}
          />
          <Suspense fallback={<AuditLogsFilterFieldsFallback />}>
            <AuditLogsFilterFields
              actionFilter={actionFilter}
              categoryFilter={categoryFilter}
              dateFrom={dateFrom}
              datePreset={datePreset}
              dateTo={dateTo}
              hasActiveFilters={hasActiveFilters}
              onActionFilterChange={onActionFilterChange}
              onCategoryFilterChange={onCategoryFilterChange}
              onDateFromChange={onDateFromChange}
              onDatePresetChange={onDatePresetChange}
              onDateToChange={onDateToChange}
              onPerformedByFilterChange={onPerformedByFilterChange}
              onRiskFilterChange={onRiskFilterChange}
              onSearchTextChange={onSearchTextChange}
              onTargetUserFilterChange={onTargetUserFilterChange}
              performedByFilter={performedByFilter}
              riskFilter={riskFilter}
              searchText={searchText}
              targetUserFilter={targetUserFilter}
            />
          </Suspense>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
