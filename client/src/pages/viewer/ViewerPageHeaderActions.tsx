import { Suspense, lazy, memo, type RefObject } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { ViewerMoreActions } from "@/pages/viewer/ViewerMoreActions";
import { TableDensityControl } from "@/components/data/TableDensityControl";
import type { TableDensity } from "@/hooks/usePersistentTableDensity";
import { buildViewerFiltersButtonLabel } from "@/pages/viewer/page-header-utils";

const ViewerColumnSelector = lazy(() =>
  import("@/pages/viewer/ViewerColumnSelector").then((module) => ({
    default: module.ViewerColumnSelector,
  })),
);

interface ViewerPageHeaderActionsProps {
  filterTriggerRef: RefObject<HTMLButtonElement>;
  exportBusy: boolean;
  filteredRowsCount: number;
  filterCount: number;
  hasFilteredSubset: boolean;
  headers: string[];
  densityPreference: TableDensity;
  isSuperuser: boolean;
  onClearAllData: () => void;
  onDeselectAllColumns: () => void;
  onDensityChange: (density: TableDensity) => void;
  onExportCsv: (exportFiltered?: boolean, exportSelected?: boolean) => void;
  onExportExcel: (exportFiltered?: boolean, exportSelected?: boolean) => void;
  onExportPdf: (exportFiltered?: boolean, exportSelected?: boolean) => void;
  onSelectAllColumns: () => void;
  onShowColumnSelectorChange: (open: boolean) => void;
  onToggleColumn: (column: string) => void;
  onMoveColumn: (column: string, direction: -1 | 1) => void;
  onResetColumns: () => void;
  canUndoColumnReset?: boolean | undefined;
  onUndoColumnReset?: (() => void) | undefined;
  onToggleFilters: () => void;
  rowsCount: number;
  selectedColumns: Set<string>;
  pinnedColumn?: string | null | undefined;
  onPinColumn?: ((column: string) => void) | undefined;
  selectedRowCount: number;
  showColumnSelector: boolean;
  showFilters: boolean;
  totalRows: number;
}

function ViewerHeaderButtonFallback({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-11 w-full items-center justify-center rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground sm:h-9 sm:w-auto"
    >
      <span className="truncate">{label}</span>
    </div>
  );
}

function ViewerPageHeaderActionsImpl({
  filterTriggerRef,
  exportBusy,
  filteredRowsCount,
  filterCount,
  hasFilteredSubset,
  headers,
  densityPreference,
  isSuperuser,
  onClearAllData,
  onDeselectAllColumns,
  onDensityChange,
  onExportCsv,
  onExportExcel,
  onExportPdf,
  onSelectAllColumns,
  onShowColumnSelectorChange,
  onToggleColumn,
  onMoveColumn,
  onResetColumns,
  canUndoColumnReset,
  onUndoColumnReset,
  onToggleFilters,
  rowsCount,
  selectedColumns,
  pinnedColumn,
  onPinColumn,
  selectedRowCount,
  showColumnSelector,
  showFilters,
  totalRows,
}: ViewerPageHeaderActionsProps) {
  return (
    <div className="viewer-action-toolbar" role="group" aria-label="Dataset controls">
      {headers.length > 0 ? (
        <>
          <Button
            ref={filterTriggerRef}
            variant={showFilters ? "default" : "outline"}
            onClick={onToggleFilters}
            data-testid="button-toggle-filters"
            {...getAriaExpandedProps(showFilters)}
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            {buildViewerFiltersButtonLabel(filterCount)}
          </Button>
          <Suspense fallback={<ViewerHeaderButtonFallback label="Columns" />}>
            <ViewerColumnSelector
              open={showColumnSelector}
              headers={headers}
              selectedColumns={selectedColumns}
              pinnedColumn={pinnedColumn}
              onPinColumn={onPinColumn}
              onOpenChange={onShowColumnSelectorChange}
              onToggleColumn={onToggleColumn}
              onMoveColumn={onMoveColumn}
              onResetColumns={onResetColumns}
              canUndoColumnReset={canUndoColumnReset}
              onUndoColumnReset={onUndoColumnReset}
              onSelectAllColumns={onSelectAllColumns}
              onDeselectAllColumns={onDeselectAllColumns}
            />
          </Suspense>

          <TableDensityControl
            ariaLabel="Viewer row density"
            testIdPrefix="viewer"
            value={densityPreference}
            onChange={onDensityChange}
          />
        </>
      ) : null}

      {headers.length > 0 ? (
          <ViewerMoreActions
            isSuperuser={isSuperuser}
            rowsCount={rowsCount}
            exportBusy={exportBusy}
            totalRows={totalRows}
            filteredRowsCount={filteredRowsCount}
            selectedRowCount={selectedRowCount}
            hasFilteredSubset={hasFilteredSubset}
            onExportCsv={onExportCsv}
            onExportPdf={onExportPdf}
            onExportExcel={onExportExcel}
            onClearAllData={onClearAllData}
          />
      ) : null}
    </div>
  );
}

export const ViewerPageHeaderActions = memo(ViewerPageHeaderActionsImpl);
