import { Loader2 } from "lucide-react";
import { mobileFullscreenDialogViewportClassName } from "@/components/ui/dialog-viewport";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { CollectionDailyRecordCard, resolveTargetProgressPercent } from "@/pages/collection/CollectionDailyDayDetailsDialogParts";
import { CollectionDailyDayDetailsFooter } from "@/pages/collection/CollectionDailyDayDetailsFooter";
import { CollectionDailyDayDetailsSummary } from "@/pages/collection/CollectionDailyDayDetailsSummary";
import "./CollectionDailyDayDetailsDialog.css";

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

function buildDailyRecordRangeLabel(dayDetails: CollectionDailyDayDetailsResponse | null): string {
  if (!dayDetails || dayDetails.pagination.totalRecords <= 0) {
    return "No records";
  }

  const firstRecord = Math.min(
    dayDetails.pagination.totalRecords,
    (dayDetails.pagination.page - 1) * dayDetails.pagination.pageSize + 1,
  );
  const lastRecord = Math.min(
    dayDetails.pagination.totalRecords,
    (dayDetails.pagination.page - 1) * dayDetails.pagination.pageSize + dayDetails.records.length,
  );

  return `Showing ${firstRecord}-${lastRecord} of ${dayDetails.pagination.totalRecords} records`;
}

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
  const targetProgressPercent = dayDetails
    ? resolveTargetProgressPercent(dayDetails.amount, dayDetails.dailyTarget)
    : 0;
  const recordRangeLabel = buildDailyRecordRangeLabel(dayDetails);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? `collection-daily-day-details-dialog ${mobileFullscreenDialogViewportClassName} flex w-screen max-w-none flex-col overflow-hidden rounded-none border-0 p-0`
            : "collection-daily-day-details-dialog flex h-[calc(var(--viewport-min-height-value)-2rem)] max-w-5xl flex-col overflow-hidden"
        }
        data-testid="collection-daily-day-dialog"
      >
        <DialogHeader
          className={`collection-daily-day-details-header shrink-0 ${
            isMobile ? "border-b border-border/60 px-4 py-4 pr-12 text-left" : ""
          }`}
        >
          <DialogTitle>
            Collection Day Details - {selectedDate ? formatDateDDMMYYYY(selectedDate) : "-"}
          </DialogTitle>
          <DialogDescription>
            View collection records, stored receipts, and daily target status for the selected date.
          </DialogDescription>
        </DialogHeader>

        {loadingDayDetails ? (
          <div className="collection-daily-day-details-state flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-border/60 bg-background px-4 py-10 text-sm text-muted-foreground shadow-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading day details...
          </div>
        ) : !dayDetails ? (
          <div className="collection-daily-day-details-state flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-border/60 bg-background px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
            No details available.
          </div>
        ) : (
          <div
            className={`collection-daily-day-details-body flex min-h-0 flex-1 flex-col gap-3 overflow-hidden ${
              isMobile ? "px-3 py-3" : ""
            }`}
          >
            <div className="collection-daily-day-details-scroll min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain pr-1">
              <CollectionDailyDayDetailsSummary
                balancedAmount={balancedAmount}
                customerCount={customerCount}
                dayDetails={dayDetails}
                selectedOverviewDay={selectedOverviewDay}
                targetProgressPercent={targetProgressPercent}
              />

              <div className="space-y-2">
                {dayDetails.records.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/60 bg-background px-4 py-6 text-center text-sm text-muted-foreground shadow-sm">
                    No collection records for this date.
                  </div>
                ) : (
                  dayDetails.records.map((record) => (
                    <CollectionDailyRecordCard
                      key={record.id}
                      isMobile={isMobile}
                      loadingReceiptKey={loadingReceiptKey}
                      onViewReceipt={onViewReceipt}
                      record={record}
                    />
                  ))
                )}
              </div>
            </div>

            <CollectionDailyDayDetailsFooter
              dayDetails={dayDetails}
              isMobile={isMobile}
              loadingDayDetails={loadingDayDetails}
              onChangePage={onChangePage}
              recordRangeLabel={recordRangeLabel}
              selectedDate={selectedDate}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
