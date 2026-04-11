import { Archive, Calendar, Search, User } from "lucide-react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { backupDatePresets, backupSortOptions } from "@/pages/backup-restore/utils";

interface BackupFilterFieldsProps {
  createdByFilter: string;
  dateFrom: string;
  datePreset: string;
  dateTo: string;
  onCreatedByFilterChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDatePresetChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onSearchNameChange: (value: string) => void;
  onSortByChange: (value: string) => void;
  searchName: string;
  sortBy: string;
}

export function BackupFilterFields({
  createdByFilter,
  dateFrom,
  datePreset,
  dateTo,
  onCreatedByFilterChange,
  onDateFromChange,
  onDatePresetChange,
  onDateToChange,
  onSearchNameChange,
  onSortByChange,
  searchName,
  sortBy,
}: BackupFilterFieldsProps) {
  const datePresetTriggerId = "backup-date-preset";
  const sortByTriggerId = "backup-sort-by";
  const dateFromButtonId = "backup-date-from";
  const dateToButtonId = "backup-date-to";

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label htmlFor="search-name" className="text-sm font-medium flex items-center gap-1">
            <Search className="h-3.5 w-3.5" />
            Search Name
          </Label>
          <Input
            id="search-name"
            name="backupSearchName"
            type="search"
            placeholder="Search backup name..."
            value={searchName}
            onChange={(event) => onSearchNameChange(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
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
            name="backupCreatedBy"
            type="search"
            placeholder="Username..."
            value={createdByFilter}
            onChange={(event) => onCreatedByFilterChange(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-testid="input-created-by"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={datePresetTriggerId} className="text-sm font-medium flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            Time Period
          </Label>
          <Select value={datePreset} onValueChange={onDatePresetChange}>
            <SelectTrigger id={datePresetTriggerId} data-testid="select-backup-date-preset">
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
          <Label htmlFor={sortByTriggerId} className="text-sm font-medium flex items-center gap-1">
            <Archive className="h-3.5 w-3.5" />
            Sort By
          </Label>
          <Select value={sortBy} onValueChange={onSortByChange}>
            <SelectTrigger id={sortByTriggerId} data-testid="select-backup-sort">
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
            <Label htmlFor={dateFromButtonId} className="text-sm font-medium">
              From Date
            </Label>
            <DatePickerField
              buttonId={dateFromButtonId}
              value={dateFrom}
              onChange={onDateFromChange}
              placeholder="Select start date..."
              buttonTestId="input-backup-date-from"
              ariaLabel="Backup start date"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={dateToButtonId} className="text-sm font-medium">
              To Date
            </Label>
            <DatePickerField
              buttonId={dateToButtonId}
              value={dateTo}
              onChange={onDateToChange}
              placeholder="Select end date..."
              buttonTestId="input-backup-date-to"
              ariaLabel="Backup end date"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
