import { ChevronDown, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  return (
    <Card>
      <Collapsible open={filtersOpen} onOpenChange={onFiltersOpenChange}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="p-0 h-auto gap-2">
                <Filter className="h-5 w-5" />
                <CardTitle className="text-lg">Search & Filters</CardTitle>
                <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            {hasActiveFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="text-muted-foreground"
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
