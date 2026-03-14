import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAmountRM } from "@/pages/collection/utils";

interface CollectionRecordsToolbarProps {
  summary: { totalRecords: number; totalAmount: number };
  loadingRecords: boolean;
  viewAllLoading: boolean;
  exportingExcel: boolean;
  exportingPdf: boolean;
  pagedStart: number;
  pagedEnd: number;
  visibleRecordsLength: number;
  tablePage: number;
  totalPages: number;
  tablePageSize: number;
  onOpenViewAll: () => void;
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
  pagedStart,
  pagedEnd,
  visibleRecordsLength,
  tablePage,
  totalPages,
  tablePageSize,
  onOpenViewAll,
  onExportExcel,
  onExportPdf,
  onTablePageSizeChange,
  onPrevPage,
  onNextPage,
}: CollectionRecordsToolbarProps) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="border-border/60 bg-background/60">
          <CardContent className="px-3 py-2">
            <p className="text-xs text-muted-foreground">Total Records</p>
            <p className="text-lg font-semibold leading-tight">{summary.totalRecords}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-background/60">
          <CardContent className="px-3 py-2">
            <p className="text-xs text-muted-foreground">Total Collection Amount</p>
            <p className="text-lg font-semibold leading-tight">{formatAmountRM(summary.totalAmount)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={onOpenViewAll} disabled={loadingRecords || viewAllLoading}>
          {viewAllLoading ? "Loading..." : "View All"}
        </Button>
        <Button variant="outline" onClick={onExportExcel} disabled={loadingRecords || exportingExcel}>
          <Download className="w-4 h-4 mr-2" />
          {exportingExcel ? "Exporting..." : "Export Excel"}
        </Button>
        <Button variant="outline" onClick={onExportPdf} disabled={loadingRecords || exportingPdf}>
          <FileText className="w-4 h-4 mr-2" />
          {exportingPdf ? "Exporting..." : "Export PDF"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-2">
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
