import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationalPageHeader } from "@/components/layout/OperationalPage";
import { buildViewerPageHeaderDescription } from "@/pages/viewer/page-header-utils";
import { ViewerPageHeaderActions } from "@/pages/viewer/ViewerPageHeaderActions";

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
      description={buildViewerPageHeaderDescription(
        rowsCount,
        currentPage,
        totalPages,
        totalRows,
      )}
      actions={
        <ViewerPageHeaderActions
          exportBusy={exportBusy}
          filteredRowsCount={filteredRowsCount}
          filterCount={filterCount}
          hasFilteredSubset={hasFilteredSubset}
          headers={headers}
          isSuperuser={isSuperuser}
          onClearAllData={onClearAllData}
          onDeselectAllColumns={onDeselectAllColumns}
          onExportCsv={onExportCsv}
          onExportExcel={onExportExcel}
          onExportPdf={onExportPdf}
          onSelectAllColumns={onSelectAllColumns}
          onShowColumnSelectorChange={onShowColumnSelectorChange}
          onToggleColumn={onToggleColumn}
          onToggleFilters={onToggleFilters}
          rowsCount={rowsCount}
          selectedColumns={selectedColumns}
          selectedRowCount={selectedRowCount}
          showColumnSelector={showColumnSelector}
          showFilters={showFilters}
          totalRows={totalRows}
        />
      }
    />
  );
}
