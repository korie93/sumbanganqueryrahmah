import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@/lib/date-format";
import { statusLabel, statusTextClass } from "@/pages/collection/CollectionDailyShared";
import { buildCollectionDailyReceiptKey } from "@/pages/collection/useCollectionDailyReceiptViewer";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionDailyDayDetailsDialogProps = {
  open: boolean;
  selectedDate: string | null;
  loadingDayDetails: boolean;
  dayDetails: CollectionDailyDayDetailsResponse | null;
  selectedOverviewDay: CollectionDailyOverviewDay | null;
  loadingReceiptKey: string | null;
  onOpenChange: (open: boolean) => void;
  onViewReceipt: (record: CollectionDailyDayDetailsResponse["records"][number], receiptId?: string) => void;
  onChangePage: (page: number) => void;
};

export function CollectionDailyDayDetailsDialog({
  open,
  selectedDate,
  loadingDayDetails,
  dayDetails,
  selectedOverviewDay,
  loadingReceiptKey,
  onOpenChange,
  onViewReceipt,
  onChangePage,
}: CollectionDailyDayDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden"
        data-testid="collection-daily-day-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            Collection Day Details - {selectedDate ? formatDateDDMMYYYY(selectedDate) : "-"}
          </DialogTitle>
          <DialogDescription>
            View collection records, stored receipts, and daily target status for the selected date.
          </DialogDescription>
        </DialogHeader>

        {loadingDayDetails ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading day details...
          </div>
        ) : !dayDetails ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No details available.</div>
        ) : (
          <div className="flex flex-1 flex-col gap-3 overflow-hidden">
            <div className="grid gap-2 rounded-md border border-border/60 bg-background/70 p-3 text-sm md:grid-cols-2 lg:grid-cols-4">
              <div>
                Status:{" "}
                <span className={`font-semibold ${statusTextClass(dayDetails.status)}`}>
                  {statusLabel(dayDetails.status)}
                </span>
              </div>
              <div>
                Daily Target: <span className="font-semibold">{formatAmountRM(dayDetails.dailyTarget)}</span>
              </div>
              <div>
                Collected: <span className="font-semibold">{formatAmountRM(dayDetails.amount)}</span>
              </div>
              <div>
                Balanced:{" "}
                <span className="font-semibold">
                  {formatAmountRM(Math.max(0, dayDetails.dailyTarget - dayDetails.amount))}
                </span>
              </div>
              <div>
                Customers:{" "}
                <span className="font-semibold">
                  {selectedOverviewDay?.customerCount ?? dayDetails.customers.length}
                </span>
              </div>
              {selectedOverviewDay?.isHoliday && selectedOverviewDay.holidayName ? (
                <div>
                  Holiday: <span className="font-semibold">{selectedOverviewDay.holidayName}</span>
                </div>
              ) : null}
              <div className="text-muted-foreground md:col-span-2 lg:col-span-4">{dayDetails.message}</div>
            </div>

            <div className="flex-1 space-y-2 overflow-auto pr-1">
              {dayDetails.records.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  No collection records for this date.
                </div>
              ) : (
                dayDetails.records.map((record) => (
                  <div key={record.id} className="space-y-2 rounded-md border border-border/60 bg-background/70 p-3">
                    <div className="grid gap-1 text-sm md:grid-cols-2 xl:grid-cols-3">
                      <div>
                        Customer: <span className="font-medium">{record.customerName}</span>
                      </div>
                      <div>
                        Account: <span className="font-medium">{record.accountNumber}</span>
                      </div>
                      <div>
                        Amount: <span className="font-medium">{formatAmountRM(record.amount)}</span>
                      </div>
                      <div>
                        User: <span className="font-medium">{record.username}</span>
                      </div>
                      <div>
                        Nickname: <span className="font-medium">{record.collectionStaffNickname}</span>
                      </div>
                      <div>
                        Reference: <span className="font-medium">{record.paymentReference}</span>
                      </div>
                      <div>
                        Batch: <span className="font-medium">{record.batch}</span>
                      </div>
                      <div>
                        Date: <span className="font-medium">{formatDateDDMMYYYY(record.paymentDate)}</span>
                      </div>
                      <div>
                        Created: <span className="font-medium">{formatDateTimeDDMMYYYY(record.createdAt)}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Stored Receipts
                      </div>
                      {record.receipts.length === 0 && !record.receiptFile ? (
                        <div className="text-xs text-muted-foreground">No stored receipt.</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {record.receipts.map((receipt) => {
                            const key = buildCollectionDailyReceiptKey(record.id, receipt.id);
                            return (
                              <Button
                                key={receipt.id}
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={loadingReceiptKey === key}
                                onClick={() => onViewReceipt(record, receipt.id)}
                              >
                                {loadingReceiptKey === key ? (
                                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Eye className="mr-2 h-3.5 w-3.5" />
                                )}
                                {receipt.originalFileName}
                              </Button>
                            );
                          })}
                          {record.receipts.length === 0 && record.receiptFile ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={loadingReceiptKey === buildCollectionDailyReceiptKey(record.id)}
                              onClick={() => onViewReceipt(record)}
                            >
                              {loadingReceiptKey === buildCollectionDailyReceiptKey(record.id) ? (
                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Eye className="mr-2 h-3.5 w-3.5" />
                              )}
                              View Receipt
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm">
              <div className="text-muted-foreground">
                Page {dayDetails.pagination.page} of {dayDetails.pagination.totalPages} | Records{" "}
                {dayDetails.pagination.totalRecords}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!dayDetails.pagination.hasPreviousPage || loadingDayDetails || !selectedDate}
                  onClick={() => onChangePage(dayDetails.pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!dayDetails.pagination.hasNextPage || loadingDayDetails || !selectedDate}
                  onClick={() => onChangePage(dayDetails.pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
