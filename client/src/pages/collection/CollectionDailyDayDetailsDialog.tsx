import { Eye, FileText, Loader2, Target, TrendingUp, Users, type LucideIcon } from "lucide-react";
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
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { statusLabel, statusTextClass } from "@/pages/collection/CollectionDailyShared";
import { buildCollectionDailyReceiptKey } from "@/pages/collection/useCollectionDailyReceiptViewer";
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

type CollectionDayStatus = CollectionDailyDayDetailsResponse["status"];
type CollectionDayMetricTone = "default" | "success" | "warning" | "danger";

function resolveTargetProgressPercent(amount: number, target: number) {
  if (target <= 0) {
    return amount > 0 ? 100 : 0;
  }

  return Math.max(0, Math.min(100, Math.round((amount / target) * 100)));
}

function getStatusPillClass(status: CollectionDayStatus) {
  if (status === "green") {
    return "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  if (status === "yellow") {
    return "border-amber-500/35 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300";
  }
  if (status === "red") {
    return "border-rose-500/35 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-300";
  }
  return "border-slate-400/40 bg-slate-100 text-slate-700 dark:border-slate-500/40 dark:bg-slate-800/60 dark:text-slate-300";
}

function getProgressBarClass(status: CollectionDayStatus) {
  if (status === "green") return "collection-day-target-progress--success";
  if (status === "yellow") return "collection-day-target-progress--warning";
  if (status === "red") return "collection-day-target-progress--danger";
  return "collection-day-target-progress--neutral";
}

function getMetricToneClass(tone: CollectionDayMetricTone) {
  if (tone === "success") return "border-emerald-500/25 bg-emerald-50/80 dark:bg-emerald-500/10";
  if (tone === "warning") return "border-amber-500/25 bg-amber-50/80 dark:bg-amber-500/10";
  if (tone === "danger") return "border-rose-500/25 bg-rose-50/80 dark:bg-rose-500/10";
  return "border-border/60 bg-muted/10";
}

function CollectionDayMetric({
  icon: Icon,
  label,
  tone = "default",
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone?: CollectionDayMetricTone;
  value: string | number;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border px-3 py-2.5", getMetricToneClass(tone))}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function CollectionRecordDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <dl className="min-w-0 rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium text-foreground">{value}</dd>
    </dl>
  );
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
                  <div
                    key={record.id}
                    className={`space-y-3 border border-border/60 bg-background shadow-sm ${
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

                        <div className="grid gap-2 text-sm">
                          <CollectionRecordDetail label="Reference" value={record.paymentReference} />
                          <CollectionRecordDetail label="Payment Date" value={formatDateDDMMYYYY(record.paymentDate)} />
                          <CollectionRecordDetail label="Created" value={formatDateTimeDDMMYYYY(record.createdAt)} />
                        </div>
                      </>
                    ) : (
                      <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
                        <CollectionRecordDetail label="Customer" value={record.customerName} />
                        <CollectionRecordDetail label="Account" value={record.accountNumber} />
                        <CollectionRecordDetail label="Amount" value={formatAmountRM(record.amount)} />
                        <CollectionRecordDetail label="User" value={record.username} />
                        <CollectionRecordDetail label="Nickname" value={record.collectionStaffNickname} />
                        <CollectionRecordDetail label="Reference" value={record.paymentReference} />
                        <CollectionRecordDetail label="Batch" value={record.batch} />
                        <CollectionRecordDetail label="Date" value={formatDateDDMMYYYY(record.paymentDate)} />
                        <CollectionRecordDetail label="Created" value={formatDateTimeDDMMYYYY(record.createdAt)} />
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Stored Receipts</span>
                        </div>
                        {record.receipts.length > 0 ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {record.receipts.length}
                          </span>
                        ) : null}
                      </div>
                      {record.receipts.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                          No stored receipt.
                        </div>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-floating-ai-avoid="true">
                          {record.receipts.map((receipt) => {
                            const key = buildCollectionDailyReceiptKey(record.id, receipt.id);
                            return (
                              <Button
                                key={receipt.id}
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-auto min-h-11 w-full justify-start rounded-xl px-3 py-2 text-left"
                                disabled={loadingReceiptKey === key}
                                onClick={() => onViewReceipt(record, receipt.id)}
                              >
                                {loadingReceiptKey === key ? (
                                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <span className="min-w-0">
                                  <span className="block truncate">{receipt.originalFileName}</span>
                                  <span className="block text-[11px] font-normal text-muted-foreground">
                                    View stored receipt
                                  </span>
                                </span>
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
              className={`sticky bottom-0 z-[var(--z-sticky-content)] flex flex-col gap-3 border-t border-border/60 bg-background/95 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 text-sm shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 ${
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
