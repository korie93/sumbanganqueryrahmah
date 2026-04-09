import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STANDARD_PAGE_SIZE_OPTIONS } from "@/components/data/AppPaginationBar";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionRecord } from "@/lib/api";
import { CollectionPaginationBar } from "@/pages/collection-report/CollectionPaginationBar";
import { formatAmountRM } from "@/pages/collection/utils";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import type { CollectionAmountMyrNumber } from "@shared/collection-amount-types";

const VIEW_ALL_PAGE_SIZE_OPTIONS = [...STANDARD_PAGE_SIZE_OPTIONS];
const ViewAllRecordsDesktopTable = lazy(() =>
  import("@/pages/collection-records/ViewAllRecordsDesktopTable").then((module) => ({
    default: module.ViewAllRecordsDesktopTable,
  })),
);

export interface ViewAllRecordsDialogProps {
  open: boolean;
  loading: boolean;
  fromDate: string;
  toDate: string;
  viewAllRecords: CollectionRecord[];
  viewAllSummary: { totalRecords: number; totalAmount: CollectionAmountMyrNumber };
  page: number;
  pageSize: number;
  totalPages: number;
  onOpenChange: (open: boolean) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onViewReceipt: (record: CollectionRecord) => void;
  toDisplayDate: (value: string) => string;
}

function ViewAllRecordsDesktopTableFallback() {
  return (
    <div className="rounded-md border border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
      Loading full records table...
    </div>
  );
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
  const [expandedRecordIds, setExpandedRecordIds] = useState<string[]>([]);

  useEffect(() => {
    setExpandedRecordIds([]);
  }, [open, page, pageSize, viewAllRecords]);

  const toggleRecordExpanded = useCallback((recordId: string) => {
    setExpandedRecordIds((previous) =>
      previous.includes(recordId)
        ? previous.filter((value) => value !== recordId)
        : [...previous, recordId],
    );
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? "flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0"
            : "flex h-[90vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0"
        }
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Senarai Penuh Rekod Collection</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            className={
              isMobile
                ? "shrink-0 border-b bg-background/95 px-4 py-4 pr-12"
                : "shrink-0 border-b bg-background/95 px-6 py-4"
            }
          >
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

          <div
            className={`flex min-h-0 flex-1 flex-col overflow-hidden ${isMobile ? "px-3 pb-3 pt-3" : "gap-3 p-4"}`}
          >
            <div
              className={
                isMobile
                  ? "shrink-0 border-b border-border/60 bg-background/95 pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] shadow-sm"
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
                pageSizeOptions={VIEW_ALL_PAGE_SIZE_OPTIONS}
                totalItems={viewAllSummary.totalRecords}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </div>

            <div
              className={
                isMobile
                  ? "min-h-0 flex-1 overflow-hidden pt-3"
                  : "min-h-0 flex-1 overflow-auto rounded-md border border-border/60"
              }
            >
              {isMobile ? (
                <div className="min-h-0 h-full overflow-y-auto overscroll-y-contain rounded-md border border-border/60 bg-background/60 p-3 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
                  {loading ? (
                    <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                      Loading full records...
                    </div>
                  ) : viewAllRecords.length === 0 ? (
                    <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                      Tiada rekod dalam julat tarikh yang dipilih.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {viewAllRecords.map((record, index) => {
                        const isExpanded = expandedRecordIds.includes(record.id);
                        return (
                          <article
                            key={`view-all-${record.id}`}
                            className="space-y-3 rounded-xl border border-border/70 bg-background/75 p-4 shadow-sm"
                          >
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Record {(page - 1) * pageSize + index + 1}
                              </p>
                              <div className="space-y-1">
                                <p className="break-words text-base font-semibold">{record.customerName}</p>
                                <p className="text-base font-semibold text-primary">{formatAmountRM(record.amount)}</p>
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={() => toggleRecordExpanded(record.id)}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? (
                                <ChevronUp className="mr-2 h-4 w-4" />
                              ) : (
                                <ChevronDown className="mr-2 h-4 w-4" />
                              )}
                              {isExpanded ? "Show less" : "Show more"}
                            </Button>

                            {isExpanded ? (
                              <>
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
                              </>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <Suspense fallback={<ViewAllRecordsDesktopTableFallback />}>
                  <ViewAllRecordsDesktopTable
                    loading={loading}
                    viewAllRecords={viewAllRecords}
                    page={page}
                    pageSize={pageSize}
                    onViewReceipt={onViewReceipt}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
