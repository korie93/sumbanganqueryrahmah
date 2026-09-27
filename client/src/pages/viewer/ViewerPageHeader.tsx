import { Suspense, lazy, memo, type RefObject } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationalPageHeader } from "@/components/layout/OperationalPage";
import { buildViewerPageHeaderDescription } from "@/pages/viewer/page-header-utils";
import type { TableDensity } from "@/hooks/usePersistentTableDensity";

const ViewerPageHeaderActions = lazy(() =>
  import("@/pages/viewer/ViewerPageHeaderActions").then((module) => ({
    default: module.ViewerPageHeaderActions,
  })),
);

const VIEWER_HEADER_ACTION_FALLBACK_KEYS = [
  "primary-action",
  "secondary-action",
  "tertiary-action",
] as const;

interface ViewerPageHeaderProps {
  filterTriggerRef: RefObject<HTMLButtonElement>;
  importName: string;
  rowsCount: number;
  totalRows: number;
  currentPage: number;
  totalPages: number;
  headers: string[];
  densityPreference: TableDensity;
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
  onMoveColumn: (column: string, direction: -1 | 1) => void;
  onResetColumns: () => void;
  onSelectAllColumns: () => void;
  onDeselectAllColumns: () => void;
  onDensityChange: (density: TableDensity) => void;
  onToggleFilters: () => void;
  onClearAllData: () => void;
  onExportCsv: (exportFiltered?: boolean, exportSelected?: boolean) => void;
  onExportPdf: (exportFiltered?: boolean, exportSelected?: boolean) => void;
  onExportExcel: (exportFiltered?: boolean, exportSelected?: boolean) => void;
}

function ViewerPageHeaderActionsFallback() {
  return (
    <div className="viewer-action-toolbar">
      {VIEWER_HEADER_ACTION_FALLBACK_KEYS.map((fallbackKey) => (
        <div
          key={fallbackKey}
          className="h-11 w-full animate-pulse rounded-lg border border-border bg-muted sm:h-9 sm:w-28"
        />
      ))}
    </div>
  );
}

function ViewerPageHeaderImpl({
  filterTriggerRef,
  importName,
  rowsCount,
  totalRows,
  currentPage,
  totalPages,
  headers,
  densityPreference,
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
  onMoveColumn,
  onResetColumns,
  onSelectAllColumns,
  onDeselectAllColumns,
  onDensityChange,
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
        <span className="flex min-w-0 items-start gap-2 sm:items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            data-testid="button-back"
            className="mt-0.5 shrink-0 sm:mt-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="min-w-0 break-words [overflow-wrap:anywhere]" title={importName}>{importName}</span>
        </span>
      }
      description={buildViewerPageHeaderDescription(
        rowsCount,
        currentPage,
        totalPages,
        totalRows,
      )}
      actions={
        <Suspense fallback={<ViewerPageHeaderActionsFallback />}>
          <ViewerPageHeaderActions
            filterTriggerRef={filterTriggerRef}
            exportBusy={exportBusy}
            filteredRowsCount={filteredRowsCount}
            filterCount={filterCount}
            hasFilteredSubset={hasFilteredSubset}
            headers={headers}
            densityPreference={densityPreference}
            isSuperuser={isSuperuser}
            onClearAllData={onClearAllData}
            onDeselectAllColumns={onDeselectAllColumns}
            onDensityChange={onDensityChange}
            onExportCsv={onExportCsv}
            onExportExcel={onExportExcel}
            onExportPdf={onExportPdf}
            onSelectAllColumns={onSelectAllColumns}
            onShowColumnSelectorChange={onShowColumnSelectorChange}
            onToggleColumn={onToggleColumn}
            onMoveColumn={onMoveColumn}
            onResetColumns={onResetColumns}
            onToggleFilters={onToggleFilters}
            rowsCount={rowsCount}
            selectedColumns={selectedColumns}
            selectedRowCount={selectedRowCount}
            showColumnSelector={showColumnSelector}
            showFilters={showFilters}
            totalRows={totalRows}
          />
        </Suspense>
      }
    />
  );
}

export const ViewerPageHeader = memo(ViewerPageHeaderImpl);
