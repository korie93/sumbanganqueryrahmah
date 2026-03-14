import { Archive, Calendar, ChevronDown, Filter, Search, User, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { backupDatePresets, backupSortOptions } from "@/pages/backup-restore/utils";

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search-name" className="text-sm font-medium flex items-center gap-1">
                  <Search className="h-3.5 w-3.5" />
                  Search Name
                </Label>
                <Input
                  id="search-name"
                  placeholder="Search backup name..."
                  value={searchName}
                  onChange={(event) => onSearchNameChange(event.target.value)}
                  data-testid="input-search-backup-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="created-by" className="text-sm font-medium flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  Created By
                </Label>
                <Input
                  id="created-by"
                  placeholder="Username..."
                  value={createdByFilter}
                  onChange={(event) => onCreatedByFilterChange(event.target.value)}
                  data-testid="input-created-by"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Time Period
                </Label>
                <Select value={datePreset} onValueChange={onDatePresetChange}>
                  <SelectTrigger data-testid="select-backup-date-preset">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    {backupDatePresets.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Archive className="h-3.5 w-3.5" />
                  Sort By
                </Label>
                <Select value={sortBy} onValueChange={onSortByChange}>
                  <SelectTrigger data-testid="select-backup-sort">
                    <SelectValue placeholder="Select sort order" />
                  </SelectTrigger>
                  <SelectContent>
                    {backupSortOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {datePreset === "custom" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">From Date</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => onDateFromChange(event.target.value)}
                    data-testid="input-backup-date-from"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">To Date</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(event) => onDateToChange(event.target.value)}
                    data-testid="input-backup-date-to"
                  />
                </div>
              </div>
            ) : null}

            {hasActiveFilters ? (
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
                <span className="text-sm text-muted-foreground">Active filters:</span>
                {searchName ? (
                  <Badge variant="secondary" className="gap-1">
                    Name: {searchName}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1"
                      onClick={() => onSearchNameChange("")}
                      data-testid="button-clear-name-filter"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ) : null}
                {createdByFilter ? (
                  <Badge variant="secondary" className="gap-1">
                    By: {createdByFilter}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1"
                      onClick={() => onCreatedByFilterChange("")}
                      data-testid="button-clear-created-by-filter"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ) : null}
                {datePreset !== "all" ? (
                  <Badge variant="secondary" className="gap-1">
                    Time: {datePreset === "custom"
                      ? `${dateFrom || "?"} - ${dateTo || "?"}`
                      : backupDatePresets.find((preset) => preset.value === datePreset)?.label}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1"
                      onClick={() => onDatePresetChange("all")}
                      data-testid="button-clear-backup-date-filter"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ) : null}
                {sortBy !== "newest" ? (
                  <Badge variant="secondary" className="gap-1">
                    Sort: {backupSortOptions.find((option) => option.value === sortBy)?.label}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1"
                      onClick={() => onSortByChange("newest")}
                      data-testid="button-clear-sort-filter"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
