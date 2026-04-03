import { ChevronDown, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { BackupActiveFilterChips } from "@/pages/backup-restore/BackupActiveFilterChips";
import { BackupFilterFields } from "@/pages/backup-restore/BackupFilterFields";

interface BackupFiltersPanelProps {
  createdByFilter: string;
  dateFrom: string;
  datePreset: string;
  dateTo: string;
  filtersOpen: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onCreatedByFilterChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDatePresetChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onFiltersOpenChange: (open: boolean) => void;
  onSearchNameChange: (value: string) => void;
  onSortByChange: (value: string) => void;
  searchName: string;
  sortBy: string;
}

export function BackupFiltersPanel({
  createdByFilter,
  dateFrom,
  datePreset,
  dateTo,
  filtersOpen,
  hasActiveFilters,
  onClearFilters,
  onCreatedByFilterChange,
  onDateFromChange,
  onDatePresetChange,
  onDateToChange,
  onFiltersOpenChange,
  onSearchNameChange,
  onSortByChange,
  searchName,
  sortBy,
}: BackupFiltersPanelProps) {
  const isMobile = useIsMobile();

  return (
    <Card data-floating-ai-avoid="true">
      <Collapsible open={filtersOpen} onOpenChange={onFiltersOpenChange}>
        <CardHeader className={isMobile ? "pb-2.5" : "pb-3"}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto w-full justify-between gap-3 rounded-xl px-0 py-0 text-left sm:w-auto sm:justify-start"
                data-testid="button-toggle-backup-filters"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Filter className="h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <CardTitle className={isMobile ? "text-base" : "text-lg"}>Search & Filters</CardTitle>
                    <p className={`mt-1 text-muted-foreground ${isMobile ? "text-xs" : "text-sm"}`}>
                      {isMobile
                        ? "Search by backup name, creator, date, or sort order."
                        : "Search backups by name, creator, time period, or sorting."}
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
                data-testid="button-clear-backup-filters"
              >
                <X className="h-4 w-4 mr-1" />
                Clear All Filters
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <BackupFilterFields
              createdByFilter={createdByFilter}
              dateFrom={dateFrom}
              datePreset={datePreset}
              dateTo={dateTo}
              onCreatedByFilterChange={onCreatedByFilterChange}
              onDateFromChange={onDateFromChange}
              onDatePresetChange={onDatePresetChange}
              onDateToChange={onDateToChange}
              onSearchNameChange={onSearchNameChange}
              onSortByChange={onSortByChange}
              searchName={searchName}
              sortBy={sortBy}
            />

            <BackupActiveFilterChips
              createdByFilter={createdByFilter}
              dateFrom={dateFrom}
              datePreset={datePreset}
              dateTo={dateTo}
              hasActiveFilters={hasActiveFilters}
              onCreatedByFilterChange={onCreatedByFilterChange}
              onDatePresetChange={onDatePresetChange}
              onSearchNameChange={onSearchNameChange}
              onSortByChange={onSortByChange}
              searchName={searchName}
              sortBy={sortBy}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
