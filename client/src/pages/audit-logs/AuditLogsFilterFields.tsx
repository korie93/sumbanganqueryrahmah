import { Calendar, Info, Search, User, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIsoDateRangeDDMMYYYY } from "@/lib/date-format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { auditActionOptions, auditDatePresets } from "@/pages/audit-logs/utils";

export interface AuditLogsFilterFieldsProps {
  actionFilter: string;
  dateFrom: string;
  datePreset: string;
  dateTo: string;
  hasActiveFilters: boolean;
  onActionFilterChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDatePresetChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onPerformedByFilterChange: (value: string) => void;
  onSearchTextChange: (value: string) => void;
  onTargetUserFilterChange: (value: string) => void;
  performedByFilter: string;
  searchText: string;
  targetUserFilter: string;
}

export function AuditLogsFilterFields({
  actionFilter,
  dateFrom,
  datePreset,
  dateTo,
  hasActiveFilters,
  onActionFilterChange,
  onDateFromChange,
  onDatePresetChange,
  onDateToChange,
  onPerformedByFilterChange,
  onSearchTextChange,
  onTargetUserFilterChange,
  performedByFilter,
  searchText,
  targetUserFilter,
}: AuditLogsFilterFieldsProps) {
  const actionTypeTriggerId = "audit-logs-action-type";
  const datePresetTriggerId = "audit-logs-date-preset";
  const dateFromButtonId = "audit-logs-date-from";
  const dateToButtonId = "audit-logs-date-to";

  return (
    <CardContent className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="search-text" className="text-sm font-medium flex items-center gap-1">
            <Search className="h-3.5 w-3.5" />
            Search Text
          </Label>
          <Input
            id="search-text"
            name="auditLogsSearchText"
            type="search"
            placeholder="Search in details, resources..."
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            enterKeyHint="search"
            autoComplete="off"
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
            name="auditLogsPerformedBy"
            placeholder="Username..."
            value={performedByFilter}
            onChange={(event) => onPerformedByFilterChange(event.target.value)}
            autoComplete="off"
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
            name="auditLogsTargetUser"
            placeholder="Target username..."
            value={targetUserFilter}
            onChange={(event) => onTargetUserFilterChange(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            data-testid="input-target-user"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={actionTypeTriggerId} className="text-sm font-medium flex items-center gap-1">
            <Info className="h-3.5 w-3.5" />
            Action Type
          </Label>
          <Select value={actionFilter} onValueChange={onActionFilterChange}>
            <SelectTrigger id={actionTypeTriggerId} data-testid="select-action-type">
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
          <Label htmlFor={datePresetTriggerId} className="text-sm font-medium flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            Time Period
          </Label>
          <Select value={datePreset} onValueChange={onDatePresetChange}>
            <SelectTrigger id={datePresetTriggerId} data-testid="select-date-preset">
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
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={dateFromButtonId} className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  From Date
                </Label>
                <DatePickerField
                  buttonId={dateFromButtonId}
                  value={dateFrom}
                  onChange={onDateFromChange}
                  placeholder="Select start date..."
                  buttonTestId="input-date-from"
                  ariaLabel="Audit logs start date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={dateToButtonId} className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  To Date
                </Label>
                <DatePickerField
                  buttonId={dateToButtonId}
                  value={dateTo}
                  onChange={onDateToChange}
                  placeholder="Select end date..."
                  buttonTestId="input-date-to"
                  ariaLabel="Audit logs end date"
                />
              </div>
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
                  aria-label="Clear action filter"
                  title="Clear action filter"
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
                  aria-label="Clear performed by filter"
                  title="Clear performed by filter"
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
                  aria-label="Clear target user filter"
                  title="Clear target user filter"
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
                  aria-label="Clear search text filter"
                  title="Clear search text filter"
                  data-testid="button-clear-search-filter"
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ) : null}
            {datePreset !== "all" ? (
              <Badge variant="secondary" className="max-w-full gap-1 whitespace-normal break-words py-1.5 pr-1">
                Time: {datePreset === "custom"
                  ? formatIsoDateRangeDDMMYYYY(dateFrom, dateTo)
                  : auditDatePresets.find((preset) => preset.value === datePreset)?.label}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 ml-1"
                  onClick={() => onDatePresetChange("all")}
                  aria-label="Clear date filter"
                  title="Clear date filter"
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
  );
}
