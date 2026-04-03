import { Eye, Loader2 } from "lucide-react";
import { CollectionReportFreshnessBadge } from "@/components/collection-report/CollectionReportFreshnessBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
  const balancedAmount = dayDetails ? Math.max(0, dayDetails.dailyTarget - dayDetails.amount) : 0;
  const customerCount = selectedOverviewDay?.customerCount ?? dayDetails?.customers.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? "flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col overflow-hidden rounded-none border-0 p-0"
            : "flex max-h-[92vh] max-w-5xl flex-col overflow-hidden"
        }
        data-testid="collection-daily-day-dialog"
      >
        <DialogHeader className={isMobile ? "border-b border-border/60 px-4 py-4 pr-12 text-left" : ""}>
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
          <div className={`flex flex-1 flex-col gap-3 overflow-hidden ${isMobile ? "px-3 py-3" : ""}`}>
            {isMobile ? (
              <div className="space-y-3 rounded-2xl border border-border/60 bg-background/80 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`rounded-full px-3 py-1 text-[11px] ${statusTextClass(dayDetails.status)}`}
                  >
                    {statusLabel(dayDetails.status)}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                    {customerCount} customers
                  </Badge>
                  {selectedOverviewDay?.isHoliday && selectedOverviewDay.holidayName ? (
                    <Badge variant="outline" className="max-w-full rounded-full px-3 py-1 text-[11px]">
                      <span className="truncate">Holiday: {selectedOverviewDay.holidayName}</span>
                    </Badge>
                  ) : null}
                  <CollectionReportFreshnessBadge freshness={dayDetails.freshness} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Daily Target
                    </p>
                    <p className="mt-1 text-sm font-semibold">{formatAmountRM(dayDetails.dailyTarget)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Collected
                    </p>
                    <p className="mt-1 text-sm font-semibold">{formatAmountRM(dayDetails.amount)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Balanced
                    </p>
                    <p className="mt-1 text-sm font-semibold">{formatAmountRM(balancedAmount)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Records
                    </p>
                    <p className="mt-1 text-sm font-semibold">{dayDetails.pagination.totalRecords}</p>
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {dayDetails.freshness?.message || "Day details are using the latest available rollups."}
                </p>
                <div className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  {dayDetails.message}
                </div>
              </div>
            ) : (
              <div className="grid gap-2 rounded-md border border-border/60 bg-background/70 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-2 md:col-span-2 md:flex-row md:flex-wrap md:items-center md:justify-between lg:col-span-4">
                  <div className="text-muted-foreground">
                    {dayDetails.freshness?.message || "Day details are using the latest available rollups."}
                  </div>
                  <CollectionReportFreshnessBadge freshness={dayDetails.freshness} />
                </div>
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
                  Balanced: <span className="font-semibold">{formatAmountRM(balancedAmount)}</span>
                </div>
                <div>
                  Customers: <span className="font-semibold">{customerCount}</span>
                </div>
                {selectedOverviewDay?.isHoliday && selectedOverviewDay.holidayName ? (
                  <div className="break-words">
                    Holiday: <span className="font-semibold">{selectedOverviewDay.holidayName}</span>
                  </div>
                ) : null}
                <div className="text-muted-foreground md:col-span-2 lg:col-span-4">{dayDetails.message}</div>
              </div>
            )}

            <div className="flex-1 space-y-2 overflow-auto pr-1">
              {dayDetails.records.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  No collection records for this date.
                </div>
              ) : (
                dayDetails.records.map((record) => (
                  <div
                    key={record.id}
                    className={`space-y-3 border border-border/60 bg-background/70 ${
                      isMobile ? "rounded-2xl p-3.5" : "rounded-xl p-3"
                    }`}
                  >
                    {isMobile ? (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="break-words font-semibold">{record.customerName}</p>
                            <p className="break-words text-xs text-muted-foreground">{record.accountNumber}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-border/50 bg-background/80 px-2.5 py-1 text-xs font-semibold">
                            {formatAmountRM(record.amount)}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border/50 bg-muted/15 px-2.5 py-1">
                            User {record.username}
                          </span>
                          <span className="rounded-full border border-border/50 bg-muted/15 px-2.5 py-1">
                            Nickname {record.collectionStaffNickname}
                          </span>
                          <span className="rounded-full border border-border/50 bg-muted/15 px-2.5 py-1">
                            Batch {record.batch}
                          </span>
                        </div>

                        <dl className="grid gap-2 rounded-xl border border-border/50 bg-muted/15 p-3 text-sm">
                          <div className="space-y-1">
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Reference
                            </dt>
                            <dd className="break-words">{record.paymentReference}</dd>
                          </div>
                          <div className="space-y-1">
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Payment Date
                            </dt>
                            <dd>{formatDateDDMMYYYY(record.paymentDate)}</dd>
                          </div>
                          <div className="space-y-1">
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Created
                            </dt>
                            <dd>{formatDateTimeDDMMYYYY(record.createdAt)}</dd>
                          </div>
                        </dl>
                      </>
                    ) : (
                      <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
                        <div className="break-words rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
                          Customer: <span className="font-medium">{record.customerName}</span>
                        </div>
                        <div className="break-words rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
                          Account: <span className="font-medium">{record.accountNumber}</span>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
                          Amount: <span className="font-medium">{formatAmountRM(record.amount)}</span>
                        </div>
                        <div className="break-words rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
                          User: <span className="font-medium">{record.username}</span>
                        </div>
                        <div className="break-words rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
                          Nickname: <span className="font-medium">{record.collectionStaffNickname}</span>
                        </div>
                        <div className="break-words rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
                          Reference: <span className="font-medium">{record.paymentReference}</span>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
                          Batch: <span className="font-medium">{record.batch}</span>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
                          Date: <span className="font-medium">{formatDateDDMMYYYY(record.paymentDate)}</span>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
                          Created: <span className="font-medium">{formatDateTimeDDMMYYYY(record.createdAt)}</span>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Stored Receipts
                      </div>
                      {record.receipts.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No stored receipt.</div>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-floating-ai-avoid="true">
                          {record.receipts.map((receipt) => {
                            const key = buildCollectionDailyReceiptKey(record.id, receipt.id);
                            return (
                              <Button
                                key={receipt.id}
                                type="button"
                                size="sm"
                                variant="outline"
                                className="w-full justify-start break-all sm:w-auto"
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
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div
              className={`sticky bottom-0 z-10 flex flex-col gap-3 border-t border-border/60 bg-background/95 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 text-sm shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 ${
                isMobile ? "-mx-3 px-3" : "-mx-4 px-4 sm:-mx-6 sm:px-6"
              } sm:flex-row sm:items-center sm:justify-between`}
              data-floating-ai-avoid="true"
            >
              <div className={`text-muted-foreground ${isMobile ? "text-xs" : ""}`}>
                Page {dayDetails.pagination.page} of {dayDetails.pagination.totalPages} | Records{" "}
                {dayDetails.pagination.totalRecords}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={!dayDetails.pagination.hasPreviousPage || loadingDayDetails || !selectedDate}
                  onClick={() => onChangePage(dayDetails.pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
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
