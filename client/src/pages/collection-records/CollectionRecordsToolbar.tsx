import { Suspense, lazy } from "react";
import { Download, FileText } from "lucide-react";
import {
  OperationalMetric,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { buildCollectionRecordsPaginationControlsState } from "@/pages/collection-records/collection-records-toolbar-utils";
import { formatAmountRM } from "@/pages/collection/utils";

const CollectionRecordsPurgeSummaryCard = lazy(() =>
  import("@/pages/collection-records/CollectionRecordsPurgeSummaryCard").then((module) => ({
    default: module.CollectionRecordsPurgeSummaryCard,
  })),
);

export interface CollectionRecordsToolbarProps {
  summary: { totalRecords: number; totalAmount: number };
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
    totalAmount: number;
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
  return <div className="h-28 animate-pulse rounded-xl border border-border/60 bg-muted/20" />;
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

  return (
    <>
      <OperationalSummaryStrip className="grid gap-3 md:grid-cols-2">
        <OperationalMetric label="Total Records" value={summary.totalRecords} />
        <OperationalMetric
          label="Total Collection Amount"
          value={formatAmountRM(summary.totalAmount)}
          tone="success"
        />
      </OperationalSummaryStrip>

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

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end" data-floating-ai-avoid="true">
        <Button
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={onOpenViewAll}
          disabled={loadingRecords || viewAllLoading}
        >
          {viewAllLoading ? "Loading..." : "View All"}
        </Button>
        <Button className="w-full sm:w-auto" variant="outline" onClick={onExportExcel} disabled={loadingRecords || exportBusy}>
          <Download className="w-4 h-4 mr-2" />
          {exportingExcel ? "Exporting..." : "Export Excel"}
        </Button>
        <Button className="w-full sm:w-auto" variant="outline" onClick={onExportPdf} disabled={loadingRecords || exportBusy}>
          <FileText className="w-4 h-4 mr-2" />
          {exportingPdf ? "Exporting..." : "Export PDF"}
        </Button>
      </div>

      <div
        className="flex flex-col gap-3 rounded-md border border-border/60 bg-background/50 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
        data-floating-ai-avoid="true"
        aria-busy={paginationControls.paginationBusy}
      >
        <p className="text-xs text-muted-foreground">
          {paginationControls.paginationBusy
            ? "Updating records..."
            : `Showing ${pagedStart}-${pagedEnd} of ${totalRecords} records`}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <label className="sr-only" htmlFor="collection-records-page-size">
            Records per page
          </label>
          <select
            id="collection-records-page-size"
            value={String(tablePageSize)}
            onChange={(event) => onTablePageSizeChange(Number(event.target.value))}
            disabled={paginationControls.pageSizeDisabled}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-[120px]"
          >
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
            <option value="200">200 / page</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={paginationControls.previousDisabled}
            onClick={onPrevPage}
          >
            Prev
          </Button>
          <span className="text-center text-xs text-muted-foreground sm:text-left">
            Page {tablePage} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
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
