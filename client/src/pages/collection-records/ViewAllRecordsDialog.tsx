import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STANDARD_PAGE_SIZE_OPTIONS } from "@/components/data/AppPaginationBar";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionRecord } from "@/lib/api";
import { CollectionPaginationBar } from "@/pages/collection-report/CollectionPaginationBar";
import { formatAmountRM } from "@/pages/collection/utils";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";

const VIEW_ALL_PAGE_SIZE_OPTIONS = [...STANDARD_PAGE_SIZE_OPTIONS];

export interface ViewAllRecordsDialogProps {
  open: boolean;
  loading: boolean;
  fromDate: string;
  toDate: string;
  viewAllRecords: CollectionRecord[];
  viewAllSummary: { totalRecords: number; totalAmount: number };
  page: number;
  pageSize: number;
  totalPages: number;
  onOpenChange: (open: boolean) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onViewReceipt: (record: CollectionRecord) => void;
  toDisplayDate: (value: string) => string;
}

export function ViewAllRecordsDialog({
  open,
  loading,
  fromDate,
  toDate,
  viewAllRecords,
  viewAllSummary,
  page,
  pageSize,
  totalPages,
  onOpenChange,
  onPageChange,
  onPageSizeChange,
  onViewReceipt,
  toDisplayDate,
}: ViewAllRecordsDialogProps) {
  const isMobile = useIsMobile();
  const dialogDescription = `Dari ${toDisplayDate(fromDate)} hingga ${toDisplayDate(toDate)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? "h-[100dvh] max-h-[100dvh] w-screen max-w-none gap-0 overflow-hidden rounded-none border-0 p-0"
            : "h-[90vh] w-[96vw] max-w-[96vw] gap-0 overflow-hidden p-0"
        }
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Senarai Penuh Rekod Collection</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="flex h-full flex-col">
          <div className={isMobile ? "border-b bg-background/95 px-4 py-4 pr-12" : "border-b bg-background/95 px-6 py-4"}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">Senarai Penuh Rekod Collection</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dialogDescription}
                </p>
                <div className="mt-2 text-sm text-muted-foreground">
                  Total Records:{" "}
                  <span className="font-medium text-foreground">
                    {viewAllSummary.totalRecords}
                  </span>
                  {" | "}
                  Total Collection:{" "}
                  <span className="font-medium text-foreground">
                    {formatAmountRM(viewAllSummary.totalAmount)}
                  </span>
                </div>
              </div>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>

          <div className={`flex min-h-0 flex-1 flex-col gap-3 ${isMobile ? "p-3" : "p-4"}`}>
            <div
              className={isMobile ? "border-b border-border/60 bg-background/95 pb-3 shadow-sm" : ""}
              style={isMobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.25rem)" } : undefined}
              data-floating-ai-avoid="true"
            >
              <CollectionPaginationBar
                disabled={loading}
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                pageSizeOptions={VIEW_ALL_PAGE_SIZE_OPTIONS}
                totalItems={viewAllSummary.totalRecords}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/60">
              {isMobile ? (
                <div className="space-y-3 p-3">
                  {loading ? (
                    <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                      Loading full records...
                    </div>
                  ) : viewAllRecords.length === 0 ? (
                    <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                      Tiada rekod dalam julat tarikh yang dipilih.
                    </div>
                  ) : (
                    viewAllRecords.map((record, index) => (
                      <article
                        key={`view-all-${record.id}`}
                        className="space-y-3 rounded-xl border border-border/70 bg-background/75 p-4 shadow-sm"
                      >
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Record {(page - 1) * pageSize + index + 1}
                          </p>
                          <p className="break-words font-medium">{record.customerName}</p>
                        </div>
                        <dl className="grid gap-2 rounded-lg border border-border/60 bg-muted/15 p-3 text-sm">
                          <div className="space-y-1">
                            <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">IC Number</dt>
                            <dd className="break-words">{record.icNumber}</dd>
                          </div>
                          <div className="space-y-1">
                            <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Account Number</dt>
                            <dd className="break-words">{record.accountNumber}</dd>
                          </div>
                          <div className="space-y-1">
                            <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Customer Phone</dt>
                            <dd className="break-words">{record.customerPhone}</dd>
                          </div>
                          <div className="space-y-1">
                            <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Batch</dt>
                            <dd>{record.batch}</dd>
                          </div>
                          <div className="space-y-1">
                            <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Amount</dt>
                            <dd>{formatAmountRM(record.amount)}</dd>
                          </div>
                          <div className="space-y-1">
                            <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Payment Date</dt>
                            <dd>{formatIsoDateToDDMMYYYY(record.paymentDate)}</dd>
                          </div>
                          <div className="space-y-1">
                            <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Staff Nickname</dt>
                            <dd className="break-words">{record.collectionStaffNickname}</dd>
                          </div>
                        </dl>

                        {(record.receipts?.length || 0) > 0 ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => onViewReceipt(record)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            {(record.receipts?.length || 0) > 1
                              ? `View Receipt (${record.receipts.length})`
                              : "View Receipt"}
                          </Button>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              ) : (
                <Table className="min-w-[1100px] text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky top-0 z-10 bg-background">
                        No.
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">
                        Customer Name
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">
                        IC Number
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">
                        Account Number
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">
                        Customer Phone Number
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">
                        Batch
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">
                        Amount
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">
                        Payment Date
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">
                        Receipt
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">
                        Staff Nickname
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell
                          colSpan={10}
                          className="py-6 text-center text-muted-foreground"
                        >
                          Loading full records...
                        </TableCell>
                      </TableRow>
                    ) : viewAllRecords.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={10}
                          className="py-6 text-center text-muted-foreground"
                        >
                          Tiada rekod dalam julat tarikh yang dipilih.
                        </TableCell>
                      </TableRow>
                    ) : (
                      viewAllRecords.map((record, index) => (
                        <TableRow key={`view-all-${record.id}`}>
                          <TableCell className="py-2 text-muted-foreground">
                            {(page - 1) * pageSize + index + 1}
                          </TableCell>
                          <TableCell className="py-2">{record.customerName}</TableCell>
                          <TableCell className="py-2">{record.icNumber}</TableCell>
                          <TableCell className="py-2">{record.accountNumber}</TableCell>
                          <TableCell className="py-2">{record.customerPhone}</TableCell>
                          <TableCell className="py-2">{record.batch}</TableCell>
                          <TableCell className="py-2">
                            {formatAmountRM(record.amount)}
                          </TableCell>
                          <TableCell className="py-2">{formatIsoDateToDDMMYYYY(record.paymentDate)}</TableCell>
                          <TableCell className="py-2">
                            {(record.receipts?.length || 0) > 0 ? (
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto px-0 text-primary"
                                onClick={() => onViewReceipt(record)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                {(record.receipts?.length || 0) > 1
                                  ? `View (${record.receipts.length})`
                                  : "View"}
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            {record.collectionStaffNickname}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
