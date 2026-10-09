import { Suspense, lazy, useEffect, useRef } from "react";
import { ChevronDown, Download, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { buildCollectionRecordsPaginationControlsState } from "@/pages/collection-records/collection-records-toolbar-utils";
import { formatAmountRM } from "@/pages/collection/utils";
import type { CollectionAmountMyrNumber } from "@shared/collection-amount-types";

const CollectionRecordsPurgeSummaryCard = lazy(() =>
  import("@/pages/collection-records/CollectionRecordsPurgeSummaryCard").then((module) => ({
    default: module.CollectionRecordsPurgeSummaryCard,
  })),
);

export interface CollectionRecordsToolbarProps {
  summary: { totalRecords: number; totalAmount: CollectionAmountMyrNumber };
  loadingRecords: boolean;
  viewAllLoading: boolean;
  exportingExcel: boolean;
  exportingPdf: boolean;
  canPurgeOldRecords: boolean;
  purgeSummaryLoading: boolean;
  purgingOldRecords: boolean;
  purgeSummary: {
    cutoffDate: string;
    eligibleRecords: number;
    totalAmount: CollectionAmountMyrNumber;
  } | null;
  pagedStart: number;
  pagedEnd: number;
  totalRecords: number;
  tablePage: number;
  totalPages: number;
  tablePageSize: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onOpenViewAll: () => void;
  onOpenPurgeDialog: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onTablePageSizeChange: (value: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

function CollectionRecordsPurgeSummaryCardFallback() {
  return <div className="h-11 animate-pulse rounded-md border border-border bg-muted/20" />;
}

export function CollectionRecordsToolbar({
  summary,
  loadingRecords,
  viewAllLoading,
  exportingExcel,
  exportingPdf,
  canPurgeOldRecords,
  purgeSummaryLoading,
  purgingOldRecords,
  purgeSummary,
  pagedStart,
  pagedEnd,
  totalRecords,
  tablePage,
  totalPages,
  tablePageSize,
  hasNextPage,
  hasPreviousPage,
  onOpenViewAll,
  onOpenPurgeDialog,
  onExportExcel,
  onExportPdf,
  onTablePageSizeChange,
  onPrevPage,
  onNextPage,
}: CollectionRecordsToolbarProps) {
  const exportBusy = exportingExcel || exportingPdf;
  const exportDisabledReason = exportBusy
    ? "Your export is being prepared. Please wait before starting another."
    : loadingRecords
      ? "Wait for records to finish loading before exporting."
      : null;
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreExportFocus = useRef(false);
  useEffect(() => {
    if (loadingRecords || exportBusy || !restoreExportFocus.current) return;
    restoreExportFocus.current = false;
    const trigger = exportTriggerRef.current;
    // A download may disable its launcher before Radix closes the menu. Restore
    // it once ready, but never steal focus from another control the user chose.
    if (trigger?.isConnected && (document.activeElement === document.body || document.activeElement === trigger)) {
      trigger.focus({ preventScroll: true });
    }
  }, [exportBusy, loadingRecords]);
  const paginationControls = buildCollectionRecordsPaginationControlsState({
    hasNextPage,
    hasPreviousPage,
    loadingRecords,
  });
  const visibleRangeLabel =
    totalRecords > 0 && pagedEnd >= pagedStart ? `${pagedStart}-${pagedEnd}` : "0";
  const paginationBusyProps = paginationControls.paginationBusy
    ? { "aria-busy": "true" as const }
    : {};

  return (
    <>
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-4 border-y border-border py-3 sm:max-w-xl">
          <div>
            <dt className="text-xs text-muted-foreground">Total Records</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{summary.totalRecords}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total Collection Amount</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-success">{formatAmountRM(summary.totalAmount)}</dd>
          </div>
        </dl>

        <div role="group" aria-label="Record Actions" data-floating-ai-avoid="true">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="rounded-md"
              onClick={onOpenViewAll}
              disabled={loadingRecords || viewAllLoading}
            >
              {viewAllLoading ? "Loading..." : "View All"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={exportTriggerRef}
                  type="button"
                  variant="outline"
                  disabled={loadingRecords || exportBusy}
                  aria-describedby={`collection-records-export-scope${exportDisabledReason ? " collection-records-export-disabled-reason" : ""}`}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  {exportBusy ? "Exporting..." : "Export"}
                  <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                onCloseAutoFocus={(event) => {
                  if (exportTriggerRef.current?.disabled) {
                    event.preventDefault();
                    restoreExportFocus.current = true;
                  }
                }}
              >
                <DropdownMenuItem className="min-h-11 sm:min-h-9" disabled={loadingRecords || exportBusy} onSelect={onExportExcel}>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />Export Excel
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11 sm:min-h-9" disabled={loadingRecords || exportBusy} onSelect={onExportPdf}>
                  <FileText className="mr-2 h-4 w-4" aria-hidden="true" />Export PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p
            id="collection-records-export-scope"
            data-testid="collection-records-export-scope"
            className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground"
          >
            Excel and PDF include records across all pages using the filters last applied to the table.
          </p>
          {exportDisabledReason ? (
            <p
              id="collection-records-export-disabled-reason"
              data-testid="collection-records-export-disabled-reason"
              role="status"
              className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground"
            >
              {exportDisabledReason}
            </p>
          ) : null}
        </div>
      </div>

      {canPurgeOldRecords ? (
        <Suspense fallback={<CollectionRecordsPurgeSummaryCardFallback />}>
          <CollectionRecordsPurgeSummaryCard
            loadingRecords={loadingRecords}
            purgeSummaryLoading={purgeSummaryLoading}
            purgingOldRecords={purgingOldRecords}
            purgeSummary={purgeSummary}
            onOpenPurgeDialog={onOpenPurgeDialog}
          />
        </Suspense>
      ) : null}

      <div
        className="flex flex-col gap-3 border-t border-border py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
        data-floating-ai-avoid="true"
        {...paginationBusyProps}
      >
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {paginationControls.paginationBusy
              ? "Updating records..."
              : `Showing ${visibleRangeLabel} of ${totalRecords} records`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <label className="sr-only" htmlFor="collection-records-page-size">
            Records per page
          </label>
          <select
            id="collection-records-page-size"
            name="collectionRecordsPageSize"
            value={String(tablePageSize)}
            onChange={(event) => onTablePageSizeChange(Number(event.target.value))}
            disabled={paginationControls.pageSizeDisabled}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm sm:h-9 sm:w-[132px]"
          >
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
            <option value="200">200 / page</option>
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1 rounded-md px-4 sm:flex-none"
            disabled={paginationControls.previousDisabled}
            onClick={onPrevPage}
          >
            Prev
          </Button>
          <span className="text-center text-xs font-medium text-muted-foreground sm:text-left">
            Page {tablePage} / {totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1 rounded-md px-4 sm:flex-none"
            disabled={paginationControls.nextDisabled}
            onClick={onNextPage}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
