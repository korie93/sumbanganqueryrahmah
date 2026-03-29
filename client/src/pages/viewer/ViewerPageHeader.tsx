import { ArrowLeft, Filter, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationalPageHeader } from "@/components/layout/OperationalPage";
import { ViewerColumnSelector } from "@/pages/viewer/ViewerColumnSelector";
import { ViewerExportMenu } from "@/pages/viewer/ViewerExportMenu";

interface ViewerPageHeaderProps {
  importName: string;
  rowsCount: number;
  totalRows: number;
  currentPage: number;
  totalPages: number;
  headers: string[];
  selectedColumns: Set<string>;
  showColumnSelector: boolean;
  showFilters: boolean;
  filterCount: number;
  isSuperuser: boolean;
  exportBusy: boolean;
  filteredRowsCount: number;
  selectedRowCount: number;
  hasFilteredSubset: boolean;
  onBack: () => void;
  onShowColumnSelectorChange: (open: boolean) => void;
  onToggleColumn: (column: string) => void;
  onSelectAllColumns: () => void;
  onDeselectAllColumns: () => void;
  onToggleFilters: () => void;
  onClearAllData: () => void;
  onExportCsv: (exportFiltered?: boolean, exportSelected?: boolean) => void;
  onExportPdf: (exportFiltered?: boolean, exportSelected?: boolean) => void;
  onExportExcel: (exportFiltered?: boolean, exportSelected?: boolean) => void;
}

export function ViewerPageHeader({
  importName,
  rowsCount,
  totalRows,
  currentPage,
  totalPages,
  headers,
  selectedColumns,
  showColumnSelector,
  showFilters,
  filterCount,
  isSuperuser,
  exportBusy,
  filteredRowsCount,
  selectedRowCount,
  hasFilteredSubset,
  onBack,
  onShowColumnSelectorChange,
  onToggleColumn,
  onSelectAllColumns,
  onDeselectAllColumns,
  onToggleFilters,
  onClearAllData,
  onExportCsv,
  onExportPdf,
  onExportExcel,
}: ViewerPageHeaderProps) {
  return (
    <OperationalPageHeader
      eyebrow="Data Viewer"
      title={
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            data-testid="button-back"
            className="mt-0.5 shrink-0 sm:mt-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="truncate">{importName}</span>
        </div>
      }
      description={`${rowsCount} row${rowsCount === 1 ? "" : "s"} on page ${currentPage} of ${totalPages} (${totalRows} total) ready for inspection, filtering, and export.`}
      actions={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
          {rowsCount > 0 ? (
            <>
              <ViewerColumnSelector
                open={showColumnSelector}
                headers={headers}
                selectedColumns={selectedColumns}
                onOpenChange={onShowColumnSelectorChange}
                onToggleColumn={onToggleColumn}
                onSelectAllColumns={onSelectAllColumns}
                onDeselectAllColumns={onDeselectAllColumns}
              />

              <Button
                variant={showFilters ? "default" : "outline"}
                onClick={onToggleFilters}
                data-testid="button-toggle-filters"
                className="w-full sm:w-auto"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters {filterCount > 0 ? `(${filterCount})` : ""}
              </Button>

              <Button
                variant="outline"
                onClick={onClearAllData}
                disabled={rowsCount === 0}
                className="w-full text-destructive sm:w-auto"
                data-testid="button-clear-all"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </>
          ) : null}

          {isSuperuser && rowsCount > 0 ? (
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
          ) : null}
        </div>
      }
    />
  );
}
