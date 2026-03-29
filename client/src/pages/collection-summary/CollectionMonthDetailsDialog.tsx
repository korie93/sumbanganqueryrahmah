import { STANDARD_PAGE_SIZE_OPTIONS } from "@/components/data/AppPaginationBar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
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

const MONTH_PAGE_SIZE_OPTIONS = [...STANDARD_PAGE_SIZE_OPTIONS];

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
  const isMobile = useIsMobile();
  const title = selectedMonthSummary
    ? `${selectedMonthSummary.monthName} ${selectedYear}`
    : "Monthly Collection";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? "flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col overflow-hidden rounded-none border-0 p-0"
            : "flex h-[88vh] w-[96vw] max-w-6xl flex-col overflow-hidden"
        }
      >
        <DialogHeader className={isMobile ? "border-b border-border/60 px-4 py-4 pr-12 text-left" : "border-b border-border/60 pb-3"}>
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

        <div
          className={isMobile ? "border-b border-border/60 bg-background/95 px-4 py-3 shadow-sm" : ""}
          style={isMobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.25rem)" } : undefined}
          data-floating-ai-avoid="true"
        >
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
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/60">
          {isMobile ? (
            <div className="space-y-3 p-3">
              {loading ? (
                <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                  Loading monthly records...
                </div>
              ) : records.length === 0 ? (
                <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                  Tiada rekod kutipan untuk bulan yang dipilih.
                </div>
              ) : (
                records.map((row, index) => (
                  <article
                    key={row.id}
                    className="space-y-3 rounded-xl border border-border/70 bg-background/75 p-4 shadow-sm"
                  >
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Record {(page - 1) * pageSize + index + 1}
                      </p>
                      <p className="break-words font-medium">{row.customerName}</p>
                    </div>
                    <dl className="grid gap-2 rounded-lg border border-border/60 bg-muted/15 p-3 text-sm">
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Date</dt>
                        <dd>{toDisplayDate(row.paymentDate)}</dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Amount</dt>
                        <dd>{formatAmountRM(row.amount)}</dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">IC Number</dt>
                        <dd className="break-words">{row.icNumber}</dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Customer Phone</dt>
                        <dd className="break-words">{row.customerPhone}</dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Account Number</dt>
                        <dd className="break-words">{row.accountNumber}</dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Batch</dt>
                        <dd>{row.batch}</dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Staff Nickname</dt>
                        <dd className="break-words">{row.collectionStaffNickname}</dd>
                      </div>
                    </dl>
                  </article>
                ))
              )}
            </div>
          ) : (
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
