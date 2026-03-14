import { ArrowLeft, Filter, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerColumnSelector } from "@/pages/viewer/ViewerColumnSelector";
import { ViewerExportMenu } from "@/pages/viewer/ViewerExportMenu";

interface ViewerPageHeaderProps {
  importName: string;
  rowsCount: number;
  headers: string[];
  selectedColumns: Set<string>;
  showColumnSelector: boolean;
  showFilters: boolean;
  filterCount: number;
  isSuperuser: boolean;
  exportingPdf: boolean;
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
  headers,
  selectedColumns,
  showColumnSelector,
  showFilters,
  filterCount,
  isSuperuser,
  exportingPdf,
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
    <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{importName}</h1>
          <p className="text-sm text-muted-foreground">{rowsCount} data rows</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
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
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters {filterCount > 0 ? `(${filterCount})` : ""}
            </Button>

            <Button
              variant="outline"
              onClick={onClearAllData}
              disabled={rowsCount === 0}
              className="text-destructive"
              data-testid="button-clear-all"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </>
        ) : null}

        {isSuperuser && rowsCount > 0 ? (
          <ViewerExportMenu
            exportingPdf={exportingPdf}
            rowsCount={rowsCount}
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
    </div>
  );
}
