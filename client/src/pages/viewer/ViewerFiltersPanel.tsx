import { memo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildViewerFiltersEmptyMessage } from "@/pages/viewer/filter-utils";
import { ViewerFilterRow } from "@/pages/viewer/ViewerFilterRow";
import { ViewerNumericSortControl } from "@/pages/viewer/ViewerNumericSortControl";
import { ViewerFilterPresetControl } from "@/pages/viewer/ViewerFilterPresetControl";
import type { ColumnFilter, ViewerFilterMutableField } from "@/pages/viewer/types";
import type { ImportDataNumericSort } from "@shared/common/import-data-sort";
import type { ViewerFilterPreset } from "@shared/common/viewer-filter-presets";
import type { ViewerFilterPresetState } from "@/pages/viewer/useViewerFilterPresets";

interface ViewerFiltersPanelProps {
  showHeading?: boolean;
  headers: string[];
  columnFilters: ColumnFilter[];
  numericSort?: ImportDataNumericSort | null | undefined;
  onNumericSortChange?: ((sort: ImportDataNumericSort | null) => void) | undefined;
  presetState?: ViewerFilterPresetState | undefined;
  onApplyPreset?: ((preset: ViewerFilterPreset) => boolean) | undefined;
  onAddFilter: () => void;
  onClearAllFilters: () => void;
  onUpdateFilter: (index: number, field: ViewerFilterMutableField, value: string) => void;
  onRemoveFilter: (index: number) => void;
}

function ViewerFiltersPanelImpl({
  showHeading = true,
  headers,
  columnFilters,
  numericSort,
  onNumericSortChange,
  presetState,
  onApplyPreset,
  onAddFilter,
  onClearAllFilters,
  onUpdateFilter,
  onRemoveFilter,
}: ViewerFiltersPanelProps) {
  return (
    <div className={showHeading ? "rounded-xl border border-border bg-card p-4" : "space-y-4"}>
      {presetState && onApplyPreset ? <ViewerFilterPresetControl key={presetState.scope} headers={headers} columnFilters={columnFilters} numericSort={numericSort ?? null} state={presetState} onApply={onApplyPreset} /> : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {showHeading ? (
          <div>
            <h3 className="font-medium text-foreground">Column Filters</h3>
            <p className="text-xs text-muted-foreground">
              Narrow matching rows across the dataset without leaving the viewer.
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {columnFilters.length > 0 || numericSort ? (
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

      <ViewerNumericSortControl headers={headers} numericSort={numericSort} onNumericSortChange={onNumericSortChange} />

      {columnFilters.length === 0 ? (
        <p className="text-sm text-muted-foreground">{buildViewerFiltersEmptyMessage()}</p>
      ) : (
        <div className="space-y-3">
          {columnFilters.map((filter, index) => (
            <ViewerFilterRow
              key={filter.id ?? `${filter.column}:${filter.operator}:${filter.value}`}
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

export const ViewerFiltersPanel = memo(ViewerFiltersPanelImpl);
