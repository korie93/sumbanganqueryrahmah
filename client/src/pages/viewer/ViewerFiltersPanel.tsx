import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildViewerFiltersEmptyMessage } from "@/pages/viewer/filter-utils";
import { ViewerFilterRow } from "@/pages/viewer/ViewerFilterRow";
import type { ColumnFilter } from "@/pages/viewer/types";

interface ViewerFiltersPanelProps {
  headers: string[];
  columnFilters: ColumnFilter[];
  onAddFilter: () => void;
  onClearAllFilters: () => void;
  onUpdateFilter: (index: number, field: keyof ColumnFilter, value: string) => void;
  onRemoveFilter: (index: number) => void;
}

export function ViewerFiltersPanel({
  headers,
  columnFilters,
  onAddFilter,
  onClearAllFilters,
  onUpdateFilter,
  onRemoveFilter,
}: ViewerFiltersPanelProps) {
  return (
    <div className="ops-toolbar mb-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-medium text-foreground">Column Filters</h3>
          <p className="text-xs text-muted-foreground">
            Narrow matching rows across the dataset without leaving the viewer.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {columnFilters.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAllFilters}
              data-testid="button-clear-filters"
              className="w-full sm:w-auto"
            >
              <X className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onAddFilter} data-testid="button-add-filter" className="w-full sm:w-auto">
            Add Filter
          </Button>
        </div>
      </div>

      {columnFilters.length === 0 ? (
        <p className="text-sm text-muted-foreground">{buildViewerFiltersEmptyMessage()}</p>
      ) : (
        <div className="space-y-3">
          {columnFilters.map((filter, index) => (
            <ViewerFilterRow
              key={index}
              filter={filter}
              headers={headers}
              index={index}
              onRemoveFilter={onRemoveFilter}
              onUpdateFilter={onUpdateFilter}
            />
          ))}
        </div>
      )}
    </div>
  );
}
