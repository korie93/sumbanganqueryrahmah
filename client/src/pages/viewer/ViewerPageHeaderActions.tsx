import { Suspense, lazy, memo, type RefObject } from "react";
import { Filter, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  onToggleFilters,
  rowsCount,
  selectedColumns,
  selectedRowCount,
  showColumnSelector,
  showFilters,
  totalRows,
}: ViewerPageHeaderActionsProps) {
  return (
    <div className="viewer-action-toolbar" role="group" aria-label="Dataset controls">
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
            ref={filterTriggerRef}
            variant={showFilters ? "default" : "outline"}
            onClick={onToggleFilters}
            data-testid="button-toggle-filters"
            className="w-full sm:w-auto"
            {...getAriaExpandedProps(showFilters)}
          >
            <Filter className="mr-2 h-4 w-4" />
            {buildViewerFiltersButtonLabel(filterCount)}
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
      {rowsCount > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              data-testid="button-viewer-more-actions"
              aria-label="More dataset actions"
            >
              <MoreHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
              More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={onClearAllData}
              data-testid="button-clear-all"
              className="min-h-11 text-destructive focus:text-destructive sm:min-h-8"
            >
              <Trash2 aria-hidden="true" />
              Clear viewer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export const ViewerPageHeaderActions = memo(ViewerPageHeaderActionsImpl);
