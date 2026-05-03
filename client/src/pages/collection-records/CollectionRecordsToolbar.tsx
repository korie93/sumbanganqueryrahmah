import { Suspense, lazy } from "react";
import { Download, FileText } from "lucide-react";
import {
  OperationalMetric,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
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
  return <div className="h-28 animate-pulse rounded-2xl border border-border/60 bg-muted/20" />;
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
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
        <OperationalSummaryStrip className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <OperationalMetric
            label="Total Records"
            value={summary.totalRecords}
            supporting={summary.totalRecords === 1 ? "1 record matched" : `${summary.totalRecords} records matched`}
          />
          <OperationalMetric
            label="Total Collection Amount"
            value={formatAmountRM(summary.totalAmount)}
            supporting={totalRecords > 0 ? "Across the filtered result set" : "No amount available yet"}
            tone="success"
          />
          <OperationalMetric
            label="Showing Now"
            value={visibleRangeLabel}
            supporting={`Page ${tablePage} of ${totalPages}`}
          />
        </OperationalSummaryStrip>

        <div className="rounded-2xl border border-border/60 bg-background p-3 shadow-sm" data-floating-ai-avoid="true">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Actions
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              className="h-10 w-full rounded-xl sm:w-auto"
              onClick={onOpenViewAll}
              disabled={loadingRecords || viewAllLoading}
            >
              {viewAllLoading ? "Loading..." : "View All"}
            </Button>
            <Button
              type="button"
              className="h-10 w-full rounded-xl sm:w-auto"
              variant="outline"
              onClick={onExportExcel}
              disabled={loadingRecords || exportBusy}
            >
              <Download className="mr-2 h-4 w-4" />
              {exportingExcel ? "Exporting..." : "Export Excel"}
            </Button>
            <Button
              type="button"
              className="h-10 w-full rounded-xl sm:w-auto"
              variant="outline"
              onClick={onExportPdf}
              disabled={loadingRecords || exportBusy}
            >
              <FileText className="mr-2 h-4 w-4" />
              {exportingPdf ? "Exporting..." : "Export PDF"}
            </Button>
          </div>
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
        className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
        data-floating-ai-avoid="true"
        {...paginationBusyProps}
      >
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Pagination
          </p>
          <p className="text-sm text-muted-foreground">
          {paginationControls.paginationBusy
            ? "Updating records..."
            : `Showing ${visibleRangeLabel} of ${totalRecords} records`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <label className="sr-only" htmlFor="collection-records-page-size">
            Records per page
          </label>
          <select
            id="collection-records-page-size"
            name="collectionRecordsPageSize"
            value={String(tablePageSize)}
            onChange={(event) => onTablePageSizeChange(Number(event.target.value))}
            disabled={paginationControls.pageSizeDisabled}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm sm:w-[132px]"
          >
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
            <option value="200">200 / page</option>
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 w-full rounded-xl px-4 sm:w-auto"
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
            className="h-10 w-full rounded-xl px-4 sm:w-auto"
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
