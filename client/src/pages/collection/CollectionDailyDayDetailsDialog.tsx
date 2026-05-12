import { Loader2, Target, TrendingUp, Users } from "lucide-react";
import { CollectionReportFreshnessBadge } from "@/components/collection-report/CollectionReportFreshnessBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { statusLabel, statusTextClass } from "@/pages/collection/CollectionDailyShared";
import {
  CollectionDailyRecordCard,
  CollectionDayMetric,
  getProgressBarClass,
  getStatusPillClass,
  resolveTargetProgressPercent,
} from "@/pages/collection/CollectionDailyDayDetailsDialogParts";
import { formatAmountRM } from "@/pages/collection/utils";
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
  const recordRangeLabel = dayDetails && dayDetails.pagination.totalRecords > 0
    ? `Showing ${Math.min(
      dayDetails.pagination.totalRecords,
      (dayDetails.pagination.page - 1) * dayDetails.pagination.pageSize + 1,
    )}-${Math.min(
      dayDetails.pagination.totalRecords,
      (dayDetails.pagination.page - 1) * dayDetails.pagination.pageSize + dayDetails.records.length,
    )} of ${dayDetails.pagination.totalRecords} records`
    : "No records";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? `${mobileFullscreenDialogViewportClassName} flex w-screen max-w-none flex-col overflow-hidden rounded-none border-0 p-0`
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
          <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-background px-4 py-10 text-sm text-muted-foreground shadow-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading day details...
          </div>
        ) : !dayDetails ? (
          <div className="rounded-2xl border border-border/60 bg-background px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
            No details available.
          </div>
        ) : (
          <div className={`flex flex-1 flex-col gap-3 overflow-hidden ${isMobile ? "px-3 py-3" : ""}`}>
            <section className="space-y-4 rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", getStatusPillClass(dayDetails.status))}
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
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {dayDetails.freshness?.message || "Day details are using the latest available rollups."}
                  </p>
                </div>
                <CollectionReportFreshnessBadge freshness={dayDetails.freshness} />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-muted-foreground">Daily target progress</span>
                  <span className={cn("font-semibold", statusTextClass(dayDetails.status))}>
                    {targetProgressPercent}% of target
                  </span>
                </div>
                <progress
                  className={cn("collection-day-target-progress", getProgressBarClass(dayDetails.status))}
                  aria-label="Daily target progress"
                  value={targetProgressPercent}
                  max={100}
                >
                  {targetProgressPercent}% of target
                </progress>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
                <CollectionDayMetric
                  icon={Target}
                  label="Daily Target"
                  value={formatAmountRM(dayDetails.dailyTarget)}
                />
                <CollectionDayMetric
                  icon={TrendingUp}
                  label="Collected"
                  tone={dayDetails.status === "green" ? "success" : "default"}
                  value={formatAmountRM(dayDetails.amount)}
                />
                <CollectionDayMetric
                  icon={Target}
                  label="Balanced"
                  tone={balancedAmount > 0 ? "warning" : "success"}
                  value={formatAmountRM(balancedAmount)}
                />
                <CollectionDayMetric
                  icon={Users}
                  label="Records"
                  value={dayDetails.pagination.totalRecords}
                />
              </div>

              <p className="rounded-xl border border-border/50 bg-muted/10 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                {dayDetails.message}
              </p>
            </section>

            <div className="flex-1 space-y-2 overflow-auto pr-1">
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

            <div
              className={`sticky bottom-0 z-[var(--z-sticky-content)] flex flex-col gap-3 border-t border-border/60 bg-background/95 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 text-sm shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 ${
                isMobile ? "-mx-3 px-3" : "-mx-4 px-4 sm:-mx-6 sm:px-6"
              } sm:flex-row sm:items-center sm:justify-between`}
              data-floating-ai-avoid="true"
            >
              <div className={`text-muted-foreground ${isMobile ? "text-xs" : ""}`}>
                {recordRangeLabel} · Page {dayDetails.pagination.page} of {dayDetails.pagination.totalPages}
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
