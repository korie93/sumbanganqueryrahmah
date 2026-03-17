import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CollectionPaginationBar } from "@/pages/collection-report/CollectionPaginationBar";
import type { CollectionMonthlySummary, CollectionRecord } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

export type CollectionMonthDetailsDialogProps = {
  open: boolean;
  loading: boolean;
  selectedYear: string;
  selectedMonthSummary: CollectionMonthlySummary | null;
  selectedMonthRange: { from: string; to: string; label: string } | null;
  records: CollectionRecord[];
  totalRecords: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onOpenChange: (open: boolean) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  toDisplayDate: (value: string) => string;
};

const MONTH_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100];

export function CollectionMonthDetailsDialog({
  open,
  loading,
  selectedYear,
  selectedMonthSummary,
  selectedMonthRange,
  records,
  totalRecords,
  page,
  pageSize,
  totalPages,
  onOpenChange,
  onPageChange,
  onPageSizeChange,
  toDisplayDate,
}: CollectionMonthDetailsDialogProps) {
  const title = selectedMonthSummary
    ? `${selectedMonthSummary.monthName} ${selectedYear}`
    : "Monthly Collection";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[96vw] max-w-6xl flex-col overflow-hidden">
        <DialogHeader className="border-b border-border/60 pb-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {selectedMonthRange?.label || "Butiran collection untuk bulan yang dipilih."}
          </DialogDescription>
          {selectedMonthSummary ? (
            <div className="grid gap-3 pt-2 md:grid-cols-2">
              <div className="rounded-md border border-border/60 bg-background/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">Total Records</p>
                <p className="text-lg font-semibold">{selectedMonthSummary.totalRecords}</p>
              </div>
              <div className="rounded-md border border-border/60 bg-background/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">Total Amount</p>
                <p className="text-lg font-semibold">
                  {formatAmountRM(selectedMonthSummary.totalAmount)}
                </p>
              </div>
            </div>
          ) : null}
        </DialogHeader>

        <CollectionPaginationBar
          disabled={loading}
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          pageSizeOptions={MONTH_PAGE_SIZE_OPTIONS}
          totalItems={totalRecords}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/60">
          <Table className="min-w-[980px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 z-10 bg-background">No.</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background">Date</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background">Customer Name</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background">IC Number</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background">Customer Phone</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background">Account Number</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background">Batch</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background">Amount</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background">Staff Nickname</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    Loading monthly records...
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    Tiada rekod kutipan untuk bulan yang dipilih.
                  </TableCell>
                </TableRow>
              ) : (
                records.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell>{(page - 1) * pageSize + index + 1}</TableCell>
                    <TableCell>{toDisplayDate(row.paymentDate)}</TableCell>
                    <TableCell className="font-medium">{row.customerName}</TableCell>
                    <TableCell>{row.icNumber}</TableCell>
                    <TableCell>{row.customerPhone}</TableCell>
                    <TableCell>{row.accountNumber}</TableCell>
                    <TableCell>{row.batch}</TableCell>
                    <TableCell>{formatAmountRM(row.amount)}</TableCell>
                    <TableCell>{row.collectionStaffNickname}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
