import { AlertCircle, Loader2, Target, TrendingUp } from "lucide-react";
import { useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
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
import { CollectionDayMetric, CollectionDailyRecordCard, resolveTargetProgressPercent } from "@/pages/collection/CollectionDailyDayDetailsDialogParts";
import { CollectionDailyDayDetailsEmptyState } from "@/pages/collection/CollectionDailyDayDetailsEmptyState";
import { CollectionDailyDayDetailsFooter } from "@/pages/collection/CollectionDailyDayDetailsFooter";
import { CollectionDailyDayDetailsStickySummary } from "@/pages/collection/CollectionDailyDayDetailsStickySummary";
import { CollectionDailyDayDetailsSummary } from "@/pages/collection/CollectionDailyDayDetailsSummary";
import { CollectionDailyDayStatusNotice } from "@/pages/collection/CollectionDailyDayStatusNotice";
import "./CollectionDailyDayDetailsDialog.css";

type CollectionDailyDayDetailsDialogProps = {
  open: boolean;
  selectedDate: string | null;
  loadingDayDetails: boolean;
  dayDetails: CollectionDailyDayDetailsResponse | null;
  selectedOverviewDay: CollectionDailyOverviewDay | null;
  loadingReceiptKey: string | null;
  onOpenChange: (open: boolean) => void;
  onViewReceipt: (record: CollectionDailyDayDetailsResponse["records"][number], receiptId?: string, trigger?: HTMLElement) => void;
  onChangePage: (page: number) => void;
  onCloseAutoFocus?: ComponentPropsWithoutRef<typeof DialogContent>["onCloseAutoFocus"];
  dayDetailsError?: string | null;
  onRetry?: () => void;
  dateNavigation?: ReactNode;
};

export function CollectionDailyDayDetailsPendingSummary() {
  return (
    <section className="collection-day-financial-summary collection-day-financial-summary--pending" aria-label="Ringkasan harian belum dimuatkan">
      <div className="collection-day-context"><span>Ringkasan harian belum dimuatkan.</span></div>
      <div className="collection-day-financial-grid">
        <CollectionDayMetric icon={Target} label="Target" value="—" />
        <CollectionDayMetric icon={TrendingUp} label="Kutipan" value="—" className="collection-day-metric--collected" />
        <CollectionDayMetric icon={Target} label="Baki" value="—" />
      </div>
      <p className="collection-day-no-target">Nilai akan dipaparkan selepas maklumat diterima.</p>
    </section>
  );
}

export function CollectionDailyDayDetailsRecordState({ loading, hasError, onRetry }: {
  loading: boolean;
  hasError: boolean;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div className="collection-day-record-state" role="status" aria-live="polite" aria-atomic="true">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : hasError ? <AlertCircle className="h-4 w-4" aria-hidden="true" /> : null}
      <p>{loading ? "Memuatkan maklumat harian..." : hasError ? "Rekod kutipan tidak dapat dimuatkan. Cuba lagi untuk tarikh ini." : "Maklumat harian belum tersedia."}</p>
      {!loading && hasError && onRetry ? <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onRetry}>Cuba lagi</Button> : null}
    </div>
  );
}

function buildDailyRecordRangeLabel(dayDetails: CollectionDailyDayDetailsResponse | null): string {
  if (!dayDetails || dayDetails.pagination.totalRecords <= 0) {
    return "Tiada rekod";
  }

  const firstRecord = Math.min(
    dayDetails.pagination.totalRecords,
    (dayDetails.pagination.page - 1) * dayDetails.pagination.pageSize + 1,
  );
  const lastRecord = Math.min(
    dayDetails.pagination.totalRecords,
    (dayDetails.pagination.page - 1) * dayDetails.pagination.pageSize + dayDetails.records.length,
  );

  return `Paparan ${firstRecord}-${lastRecord} daripada ${dayDetails.pagination.totalRecords} rekod`;
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
  onCloseAutoFocus,
  dayDetailsError = null,
  onRetry,
  dateNavigation,
}: CollectionDailyDayDetailsDialogProps) {
  const isMobile = useIsMobile();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const restoreRetryFocus = useRef(false);
  const handleRetry = () => {
    restoreRetryFocus.current = true;
    onRetry?.();
  };
  useEffect(() => {
    if (!restoreRetryFocus.current || loadingDayDetails) return;
    restoreRetryFocus.current = false;
    const region = scrollAreaRef.current;
    // A successful retry removes its button. Keep keyboard focus in this modal,
    // but never take focus from another control or a newly opened nested modal.
    if (region && region.ownerDocument.activeElement === region.ownerDocument.body) {
      region.focus({ preventScroll: true });
    }
  }, [loadingDayDetails, dayDetailsError, selectedDate]);
  const visibleDetails = dayDetails?.date === selectedDate ? dayDetails : null;
  const overviewDay = selectedOverviewDay?.date === selectedDate ? selectedOverviewDay : null;
  const balancedAmount = visibleDetails ? Math.max(0, visibleDetails.dailyTarget - visibleDetails.amount) : 0;
  const customerCount = overviewDay?.customerCount ?? visibleDetails?.customers.length ?? 0;
  const targetProgressPercent = visibleDetails
    ? resolveTargetProgressPercent(visibleDetails.amount, visibleDetails.dailyTarget)
    : 0;
  const recordRangeLabel = buildDailyRecordRangeLabel(visibleDetails);
  useEffect(() => {
    // A date/page change is a new reading context, not a continuation halfway
    // through the previous date's records. Keep the modal and launcher intact.
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
  }, [selectedDate, visibleDetails?.pagination.page]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? `collection-daily-day-details-dialog ${mobileFullscreenDialogViewportClassName} flex w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none sm:p-0`
            : "collection-daily-day-details-dialog flex max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:p-0"
        }
        data-testid="collection-daily-day-dialog"
        data-mobile={isMobile}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader
          className="collection-daily-day-details-header shrink-0 text-left"
        >
          <DialogTitle aria-live="polite" aria-atomic="true">
            Kutipan Harian · {selectedDate ? formatDateDDMMYYYY(selectedDate) : "-"}
          </DialogTitle>
          <DialogDescription>
            Rekod kutipan dan resit untuk tarikh dipilih.
          </DialogDescription>
          {dateNavigation ? <div className="collection-day-date-navigation-slot">{dateNavigation}</div> : null}
        </DialogHeader>

        <div className="collection-daily-day-details-body flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={scrollAreaRef}
            aria-label="Collection day details scroll area"
            className="collection-daily-day-details-scroll min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain"
            role="region"
            tabIndex={0}
          >
            {visibleDetails ? (
              <>
                <CollectionDailyDayDetailsStickySummary
                  customerCount={customerCount}
                  dayDetails={visibleDetails}
                  selectedOverviewDay={overviewDay}
                />
                <CollectionDailyDayDetailsSummary
                  balancedAmount={balancedAmount}
                  dayDetails={visibleDetails}
                  targetProgressPercent={targetProgressPercent}
                />
                <CollectionDailyDayStatusNotice day={overviewDay} dayDetails={visibleDetails} />
              </>
            ) : <CollectionDailyDayDetailsPendingSummary />}
            <section
              className="collection-day-record-list space-y-2"
              aria-label="Rekod kutipan untuk tarikh dipilih"
              data-testid="collection-day-records"
              {...{ "aria-busy": loadingDayDetails ? "true" as const : "false" as const }}
            >
              {loadingDayDetails || dayDetailsError || !visibleDetails ? (
                <CollectionDailyDayDetailsRecordState loading={loadingDayDetails} hasError={Boolean(dayDetailsError)} onRetry={onRetry ? handleRetry : undefined} />
              ) : visibleDetails.records.length === 0 ? (
                <CollectionDailyDayDetailsEmptyState
                  dayDetails={visibleDetails}
                  selectedOverviewDay={overviewDay}
                />
              ) : (
                visibleDetails.records.map((record) => (
                  <CollectionDailyRecordCard
                    key={record.id}
                    isMobile={isMobile}
                    loadingReceiptKey={loadingReceiptKey}
                    onViewReceipt={onViewReceipt}
                    record={record}
                  />
                ))
              )}
            </section>
          </div>
          <CollectionDailyDayDetailsFooter
            dayDetails={visibleDetails}
            isMobile={isMobile}
            loadingDayDetails={loadingDayDetails}
            hasError={Boolean(dayDetailsError)}
            onChangePage={onChangePage}
            recordRangeLabel={recordRangeLabel}
            selectedDate={selectedDate}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
