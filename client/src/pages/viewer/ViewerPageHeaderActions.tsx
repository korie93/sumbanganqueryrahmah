import { Suspense, lazy, memo } from "react";
import { Filter, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableDensityControl } from "@/components/data/TableDensityControl";
import type { TableDensity } from "@/hooks/usePersistentTableDensity";
import { buildViewerFiltersButtonLabel } from "@/pages/viewer/page-header-utils";

const ViewerColumnSelector = lazy(() =>
  import("@/pages/viewer/ViewerColumnSelector").then((module) => ({
    default: module.ViewerColumnSelector,
  })),
);
const ViewerExportMenu = lazy(() =>
  import("@/pages/viewer/ViewerExportMenu").then((module) => ({
    default: module.ViewerExportMenu,
  })),
);

interface ViewerPageHeaderActionsProps {
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
  onToggleFilters: () => void;
  rowsCount: number;
  selectedColumns: Set<string>;
  selectedRowCount: number;
  showColumnSelector: boolean;
  showFilters: boolean;
  totalRows: number;
}

function ViewerHeaderButtonFallback({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-10 w-full items-center rounded-md border border-border/60 bg-muted/20 px-3 text-sm text-muted-foreground sm:w-auto"
    >
      <span className="truncate">{label}</span>
    </div>
  );
}

function ViewerPageHeaderActionsImpl({
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
  onToggleFilters,
  rowsCount,
  selectedColumns,
  selectedRowCount,
  showColumnSelector,
  showFilters,
  totalRows,
}: ViewerPageHeaderActionsProps) {
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
      {rowsCount > 0 ? (
        <>
          <TableDensityControl
            ariaLabel="Viewer row density"
            testIdPrefix="viewer"
            value={densityPreference}
            onChange={onDensityChange}
          />
          <Suspense fallback={<ViewerHeaderButtonFallback label="Columns" />}>
            <ViewerColumnSelector
              open={showColumnSelector}
              headers={headers}
              selectedColumns={selectedColumns}
              onOpenChange={onShowColumnSelectorChange}
              onToggleColumn={onToggleColumn}
              onMoveColumn={onMoveColumn}
              onResetColumns={onResetColumns}
              onSelectAllColumns={onSelectAllColumns}
              onDeselectAllColumns={onDeselectAllColumns}
            />
          </Suspense>

          <Button
            variant={showFilters ? "default" : "outline"}
            onClick={onToggleFilters}
            data-testid="button-toggle-filters"
            className="w-full sm:w-auto"
          >
            <Filter className="mr-2 h-4 w-4" />
            {buildViewerFiltersButtonLabel(filterCount)}
          </Button>

          <Button
            variant="outline"
            onClick={onClearAllData}
            disabled={rowsCount === 0}
            className="w-full text-destructive sm:w-auto"
            data-testid="button-clear-all"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </>
      ) : null}

      {isSuperuser && rowsCount > 0 ? (
        <Suspense fallback={<ViewerHeaderButtonFallback label="Export" />}>
          <ViewerExportMenu
            exportBusy={exportBusy}
            totalRows={totalRows}
            filteredRowsCount={filteredRowsCount}
            selectedRowCount={selectedRowCount}
            selectedColumnsCount={selectedColumns.size}
            headersCount={headers.length}
            hasFilteredSubset={hasFilteredSubset}
            onExportCsv={onExportCsv}
            onExportPdf={onExportPdf}
            onExportExcel={onExportExcel}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export const ViewerPageHeaderActions = memo(ViewerPageHeaderActionsImpl);
