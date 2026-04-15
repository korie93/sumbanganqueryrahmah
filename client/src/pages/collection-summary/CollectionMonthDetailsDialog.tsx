import { Suspense } from "react";
import { STANDARD_PAGE_SIZE_OPTIONS } from "@/components/data/AppPaginationBar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { CollectionPaginationBar } from "@/pages/collection-report/CollectionPaginationBar";
import type { CollectionMonthlySummary, CollectionRecord } from "@/lib/api";
import { buildCollectionMonthDetailsRowAriaLabel } from "@/pages/collection-summary/collection-summary-row-aria";
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
const CollectionMonthDetailsDesktopTable = lazyWithPreload(() =>
  import("@/pages/collection-summary/CollectionMonthDetailsDesktopTable").then((module) => ({
    default: module.CollectionMonthDetailsDesktopTable,
  })),
);

function CollectionMonthDetailsDesktopTableFallback() {
  return (
    <div className="rounded-md border border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
      Loading monthly records table...
    </div>
  );
}

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
            isMobile ? (
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                  {selectedMonthSummary.totalRecords} records
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                  {formatAmountRM(selectedMonthSummary.totalAmount)}
                </Badge>
                {selectedMonthRange?.label ? (
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                    {selectedMonthRange.label}
                  </Badge>
                ) : null}
              </div>
            ) : (
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
            )
          ) : null}
        </DialogHeader>

        <div
          className={
            isMobile
              ? "border-b border-border/60 bg-background/95 px-3 py-2.5 shadow-sm"
              : ""
          }
          data-floating-ai-avoid="true"
        >
          <CollectionPaginationBar
            disabled={loading}
            loading={loading}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            pageSizeOptions={MONTH_PAGE_SIZE_OPTIONS}
            totalItems={totalRecords}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </div>

        <div
          className={`min-h-0 flex-1 overflow-auto ${
            isMobile ? "bg-muted/10" : "rounded-md border border-border/60"
          }`}
        >
          {isMobile ? (
            <div className="space-y-2.5 p-3">
              {loading ? (
                <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                  Loading monthly records...
                </div>
              ) : records.length === 0 ? (
                <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                  Tiada rekod kutipan untuk bulan yang dipilih.
                </div>
              ) : (
                records.map((row, index) => {
                  const recordIndex = (page - 1) * pageSize + index + 1;
                  const formattedPaymentDate = toDisplayDate(row.paymentDate);
                  const formattedAmount = formatAmountRM(row.amount);

                  return (
                    <article
                      key={row.id}
                      role="group"
                      aria-label={buildCollectionMonthDetailsRowAriaLabel({
                        formattedAmount,
                        formattedPaymentDate,
                        index: recordIndex,
                        record: row,
                      })}
                      className="space-y-3 rounded-2xl border border-border/70 bg-background/80 p-3.5 shadow-sm"
                    >
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Record {recordIndex}
                        </p>
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 break-words font-semibold">{row.customerName}</p>
                          <span className="shrink-0 rounded-full border border-border/50 bg-muted/15 px-2.5 py-1 text-xs font-semibold">
                            {formattedAmount}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{formattedPaymentDate}</p>
                      </div>
                      <dl className="grid gap-2 rounded-xl border border-border/60 bg-muted/15 p-3 text-sm sm:grid-cols-2">
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
                        <div className="space-y-1">
                          <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Customer Phone</dt>
                          <dd className="break-words">{row.customerPhone}</dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">IC Number</dt>
                          <dd className="break-words">{row.icNumber}</dd>
                        </div>
                      </dl>
                    </article>
                  );
                })
              )}
            </div>
          ) : (
            <Suspense fallback={<CollectionMonthDetailsDesktopTableFallback />}>
              <CollectionMonthDetailsDesktopTable
                loading={loading}
                records={records}
                page={page}
                pageSize={pageSize}
                toDisplayDate={toDisplayDate}
              />
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
