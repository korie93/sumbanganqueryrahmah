import { Calendar, ChevronDown, Filter, Info, Search, User, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { auditActionOptions, auditDatePresets } from "@/pages/audit-logs/utils";

interface AuditLogsFiltersPanelProps {
  actionFilter: string;
  dateFrom: string;
  datePreset: string;
  dateTo: string;
  filtersOpen: boolean;
  hasActiveFilters: boolean;
  onActionFilterChange: (value: string) => void;
  onClearFilters: () => void;
  onDateFromChange: (value: string) => void;
  onDatePresetChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onFiltersOpenChange: (open: boolean) => void;
  onPerformedByFilterChange: (value: string) => void;
  onSearchTextChange: (value: string) => void;
  onTargetUserFilterChange: (value: string) => void;
  performedByFilter: string;
  searchText: string;
  targetUserFilter: string;
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
  return (
    <Card data-floating-ai-avoid="true">
      <Collapsible open={filtersOpen} onOpenChange={onFiltersOpenChange}>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="h-auto w-full justify-between gap-3 rounded-xl px-0 py-0 text-left sm:w-auto sm:justify-start">
                <div className="flex min-w-0 items-center gap-2">
                  <Filter className="h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <CardTitle className="text-lg">Search & Filters</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Narrow the log list by user, action, time period, or free text.
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
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="search-text" className="text-sm font-medium flex items-center gap-1">
                  <Search className="h-3.5 w-3.5" />
                  Search Text
                </Label>
                <Input
                  id="search-text"
                  placeholder="Search in details, resources..."
                  value={searchText}
                  onChange={(event) => onSearchTextChange(event.target.value)}
                  enterKeyHint="search"
                  autoCapitalize="none"
                  data-testid="input-search-text"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="performed-by" className="text-sm font-medium flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  Performed By
                </Label>
                <Input
                  id="performed-by"
                  placeholder="Username..."
                  value={performedByFilter}
                  onChange={(event) => onPerformedByFilterChange(event.target.value)}
                  autoCapitalize="none"
                  data-testid="input-performed-by"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-user" className="text-sm font-medium flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  Target User
                </Label>
                <Input
                  id="target-user"
                  placeholder="Target username..."
                  value={targetUserFilter}
                  onChange={(event) => onTargetUserFilterChange(event.target.value)}
                  autoCapitalize="none"
                  data-testid="input-target-user"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Info className="h-3.5 w-3.5" />
                  Action Type
                </Label>
                <Select value={actionFilter} onValueChange={onActionFilterChange}>
                  <SelectTrigger data-testid="select-action-type">
                    <SelectValue placeholder="Select action type" />
                  </SelectTrigger>
                  <SelectContent>
                    {auditActionOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Time Period
                </Label>
                <Select value={datePreset} onValueChange={onDatePresetChange}>
                  <SelectTrigger data-testid="select-date-preset">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    {auditDatePresets.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {datePreset === "custom" ? (
                <div className="space-y-2 lg:col-span-1">
                  <Label className="text-sm font-medium">Custom Date Range</Label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(event) => onDateFromChange(event.target.value)}
                      className="flex-1"
                      data-testid="input-date-from"
                    />
                    <span className="hidden text-muted-foreground text-sm sm:inline">-</span>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(event) => onDateToChange(event.target.value)}
                      className="flex-1"
                      data-testid="input-date-to"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {hasActiveFilters ? (
              <div className="space-y-3 border-t pt-3" data-floating-ai-avoid="true">
                <span className="text-sm font-medium text-muted-foreground">Active filters</span>
                <div className="flex flex-wrap gap-2">
                {actionFilter !== "all" ? (
                  <Badge variant="secondary" className="max-w-full gap-1 whitespace-normal break-words py-1.5 pr-1">
                    Action: {auditActionOptions.find((option) => option.value === actionFilter)?.label}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1"
                      onClick={() => onActionFilterChange("all")}
                      data-testid="button-clear-action-filter"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ) : null}
                {performedByFilter ? (
                  <Badge variant="secondary" className="max-w-full gap-1 whitespace-normal break-words py-1.5 pr-1">
                    By: {performedByFilter}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1"
                      onClick={() => onPerformedByFilterChange("")}
                      data-testid="button-clear-performed-by-filter"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ) : null}
                {targetUserFilter ? (
                  <Badge variant="secondary" className="max-w-full gap-1 whitespace-normal break-words py-1.5 pr-1">
                    Target: {targetUserFilter}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1"
                      onClick={() => onTargetUserFilterChange("")}
                      data-testid="button-clear-target-user-filter"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ) : null}
                {searchText ? (
                  <Badge variant="secondary" className="max-w-full gap-1 whitespace-normal break-words py-1.5 pr-1">
                    Text: {searchText}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1"
                      onClick={() => onSearchTextChange("")}
                      data-testid="button-clear-search-filter"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ) : null}
                {datePreset !== "all" ? (
                  <Badge variant="secondary" className="max-w-full gap-1 whitespace-normal break-words py-1.5 pr-1">
                    Time: {datePreset === "custom"
                      ? `${dateFrom || "?"} - ${dateTo || "?"}`
                      : auditDatePresets.find((preset) => preset.value === datePreset)?.label}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1"
                      onClick={() => onDatePresetChange("all")}
                      data-testid="button-clear-date-filter"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
