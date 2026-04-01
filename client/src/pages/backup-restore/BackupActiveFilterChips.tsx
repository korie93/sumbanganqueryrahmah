import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { backupDatePresets, backupSortOptions } from "@/pages/backup-restore/utils";

interface BackupActiveFilterChipsProps {
  createdByFilter: string;
  dateFrom: string;
  datePreset: string;
  dateTo: string;
  hasActiveFilters: boolean;
  onCreatedByFilterChange: (value: string) => void;
  onDatePresetChange: (value: string) => void;
  onSearchNameChange: (value: string) => void;
  onSortByChange: (value: string) => void;
  searchName: string;
  sortBy: string;
}

export function BackupActiveFilterChips({
  createdByFilter,
  dateFrom,
  datePreset,
  dateTo,
  hasActiveFilters,
  onCreatedByFilterChange,
  onDatePresetChange,
  onSearchNameChange,
  onSortByChange,
  searchName,
  sortBy,
}: BackupActiveFilterChipsProps) {
  if (!hasActiveFilters) {
    return null;
  }

  return (
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
  );
}
