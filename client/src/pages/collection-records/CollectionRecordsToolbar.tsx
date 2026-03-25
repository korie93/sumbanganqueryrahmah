import { Download, FileText } from "lucide-react";
import {
  OperationalMetric,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAmountRM } from "@/pages/collection/utils";

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
  visibleRecordsLength: number;
  tablePage: number;
  totalPages: number;
  tablePageSize: number;
  onOpenViewAll: () => void;
  onOpenPurgeDialog: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onTablePageSizeChange: (value: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
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
  visibleRecordsLength,
  tablePage,
  totalPages,
  tablePageSize,
  onOpenViewAll,
  onOpenPurgeDialog,
  onExportExcel,
  onExportPdf,
  onTablePageSizeChange,
  onPrevPage,
  onNextPage,
}: CollectionRecordsToolbarProps) {
  const exportBusy = exportingExcel || exportingPdf;

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
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-col gap-3 px-3 py-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Manual Purge Data Lama</p>
              <p className="text-xs text-muted-foreground">
                Rekod collection sebelum {purgeSummary?.cutoffDate || "-"} hanya boleh dipurge oleh superuser.
              </p>
              <p className="text-xs text-muted-foreground">
                Eligible:{" "}
                <span className="font-medium text-foreground">
                  {purgeSummaryLoading ? "Checking..." : purgeSummary?.eligibleRecords ?? 0}
                </span>
                {" | "}
                Total:{" "}
                <span className="font-medium text-foreground">
                  {formatAmountRM(purgeSummary?.totalAmount ?? 0)}
                </span>
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={onOpenPurgeDialog}
              disabled={
                loadingRecords ||
                purgeSummaryLoading ||
                purgingOldRecords ||
                !purgeSummary ||
                purgeSummary.eligibleRecords <= 0
              }
            >
              {purgingOldRecords ? "Purging..." : "Purge > 6 Months"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={onOpenViewAll} disabled={loadingRecords || viewAllLoading}>
          {viewAllLoading ? "Loading..." : "View All"}
        </Button>
        <Button variant="outline" onClick={onExportExcel} disabled={loadingRecords || exportBusy}>
          <Download className="w-4 h-4 mr-2" />
          {exportingExcel ? "Exporting..." : "Export Excel"}
        </Button>
        <Button variant="outline" onClick={onExportPdf} disabled={loadingRecords || exportBusy}>
          <FileText className="w-4 h-4 mr-2" />
          {exportingPdf ? "Exporting..." : "Export PDF"}
        </Button>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-2"
        data-floating-ai-avoid="true"
      >
        <p className="text-xs text-muted-foreground">
          Showing {pagedStart}-{pagedEnd} of {visibleRecordsLength} records
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={String(tablePageSize)}
            onValueChange={(value) => onTablePageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 / page</SelectItem>
              <SelectItem value="100">100 / page</SelectItem>
              <SelectItem value="200">200 / page</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={tablePage <= 1} onClick={onPrevPage}>
            Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {tablePage} / {totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={tablePage >= totalPages} onClick={onNextPage}>
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
