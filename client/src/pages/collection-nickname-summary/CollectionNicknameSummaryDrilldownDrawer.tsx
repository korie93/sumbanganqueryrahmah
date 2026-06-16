import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getCollectionRecords,
  type CollectionRecord,
} from "@/lib/api";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import {
  CollectionNicknameBenchmarkBadge,
} from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartDetails";
import {
  getCollectionNicknameBenchmarkGap,
  getCollectionNicknameBenchmarkProgress,
  getCollectionNicknameBenchmarkStatus,
  type CollectionNicknameSummaryChartDatum,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import {
  formatAmountRM,
  parseApiError,
} from "@/pages/collection/utils";

const DRILLDOWN_PAGE_SIZE = 12;

type DrilldownPagination = {
  total: number;
  totalPages: number;
};

type CollectionNicknameSummaryDrilldownDrawerProps = {
  benchmarkAmount: number;
  fromDate?: string | undefined;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  row: CollectionNicknameSummaryChartDatum | null;
  toDate?: string | undefined;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function formatDateRange(fromDate?: string, toDate?: string): string {
  if (fromDate && toDate) {
    return `${formatIsoDateToDDMMYYYY(fromDate)} - ${formatIsoDateToDDMMYYYY(toDate)}`;
  }
  return "Julat tarikh dipilih";
}

function maskAccountNumber(value: string): string {
  const normalized = String(value || "").replace(/\s+/g, "").trim();
  if (!normalized) {
    return "-";
  }
  if (normalized.length <= 4) {
    return normalized;
  }
  return `...${normalized.slice(-4)}`;
}

function formatRecordPaymentDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? formatIsoDateToDDMMYYYY(value)
    : String(value || "-");
}

export function CollectionNicknameSummaryDrilldownDrawer({
  benchmarkAmount,
  fromDate,
  onOpenChange,
  open,
  row,
  toDate,
}: CollectionNicknameSummaryDrilldownDrawerProps) {
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [pagination, setPagination] = useState<DrilldownPagination>({
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const selectedKey = row?.key || "";

  useEffect(() => {
    setPage(1);
  }, [fromDate, selectedKey, toDate]);

  useEffect(() => {
    if (!open || !row) {
      setRecords([]);
      setPagination({ total: 0, totalPages: 1 });
      setErrorMessage(null);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setErrorMessage(null);

    void getCollectionRecords({
      from: fromDate || undefined,
      to: toDate || undefined,
      nickname: row.nickname,
      page,
      pageSize: DRILLDOWN_PAGE_SIZE,
    }, {
      signal: controller.signal,
    }).then((response) => {
      if (!active) {
        return;
      }
      const total = Number(response?.pagination?.total ?? response?.total ?? 0);
      const totalPages = Number(response?.pagination?.totalPages ?? Math.ceil(total / DRILLDOWN_PAGE_SIZE));
      setRecords(Array.isArray(response?.records) ? response.records : []);
      setPagination({
        total: Number.isFinite(total) && total > 0 ? total : 0,
        totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
      });
    }).catch((error: unknown) => {
      if (!active || controller.signal.aborted || isAbortError(error)) {
        return;
      }
      setRecords([]);
      setPagination({ total: 0, totalPages: 1 });
      setErrorMessage(parseApiError(error));
    }).finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [fromDate, open, page, row, toDate]);

  const targetStatus = useMemo(
    () => row ? getCollectionNicknameBenchmarkStatus(row, benchmarkAmount) : "not-set",
    [benchmarkAmount, row],
  );
  const targetProgress = useMemo(
    () => row ? getCollectionNicknameBenchmarkProgress(row, benchmarkAmount) : 0,
    [benchmarkAmount, row],
  );
  const targetGap = useMemo(
    () => row ? getCollectionNicknameBenchmarkGap(row, benchmarkAmount) : 0,
    [benchmarkAmount, row],
  );
  const pageLabel = `Page ${page} of ${pagination.totalPages}`;
  const canGoPrevious = page > 1 && !loading;
  const canGoNext = page < pagination.totalPages && !loading;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full flex-col gap-0 overflow-hidden p-0"
        data-floating-ai-avoid="true"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-4 pr-12 text-left sm:px-5">
          <SheetTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />
            Rekod untuk {row?.nickname || "nickname"}
          </SheetTitle>
          <SheetDescription>
            Drill-down rekod yang membentuk jumlah carta bagi {formatDateRange(fromDate, toDate)}.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {row ? (
            <div className="space-y-4">
              <dl className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
                  <dt className="text-xs text-muted-foreground">Jumlah kutipan</dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    {formatAmountRM(row.totalAmount)}
                  </dd>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
                  <dt className="text-xs text-muted-foreground">Jumlah rekod</dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    {row.totalRecords.toLocaleString()}
                  </dd>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
                  <dt className="text-xs text-muted-foreground">Purata</dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    {formatAmountRM(row.averagePerRecord)}
                  </dd>
                </div>
              </dl>

              {benchmarkAmount > 0 ? (
                <section
                  className="rounded-lg border border-border/60 bg-background p-3"
                  aria-label="Target progress"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Target {formatAmountRM(benchmarkAmount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {targetGap > 0
                          ? `Kurang ${formatAmountRM(targetGap)} untuk capai target.`
                          : "Target telah dicapai atau melebihi sasaran."}
                      </p>
                    </div>
                    <CollectionNicknameBenchmarkBadge status={targetStatus} />
                  </div>
                  <Progress
                    className="mt-3 h-2"
                    value={Math.min(targetProgress, 100)}
                    aria-label={`Progress target ${Math.min(targetProgress, 999.9).toFixed(1)}%`}
                  />
                </section>
              ) : null}

              <section aria-labelledby="nickname-drilldown-records-title">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 id="nickname-drilldown-records-title" className="text-sm font-semibold text-foreground">
                      Rekod terlibat
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {pagination.total.toLocaleString()} rekod dijumpai, dipaparkan secara berpaginasi.
                    </p>
                  </div>
                  <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-foreground">
                    {pageLabel}
                  </span>
                </div>

                {errorMessage ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                    {errorMessage}
                  </div>
                ) : loading ? (
                  <div
                    className="flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-8 text-sm text-muted-foreground"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading records...
                  </div>
                ) : records.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
                    Tiada rekod untuk nickname dan julat tarikh ini.
                  </div>
                ) : (
                  <div
                    className="max-h-96 overflow-auto rounded-lg border border-border/60"
                    role="region"
                    aria-label="Nickname drill-down records"
                    // The drill-down table can overflow horizontally and vertically.
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                    tabIndex={0}
                  >
                    <table className="w-full min-w-[620px] border-collapse text-sm">
                      <thead className="sticky top-0 z-10 bg-muted">
                        <tr className="border-b border-border/70 text-left">
                          <th scope="col" className="px-3 py-2.5 font-medium text-muted-foreground">Tarikh</th>
                          <th scope="col" className="px-3 py-2.5 font-medium text-muted-foreground">Customer</th>
                          <th scope="col" className="px-3 py-2.5 font-medium text-muted-foreground">Batch</th>
                          <th scope="col" className="px-3 py-2.5 font-medium text-muted-foreground">Akaun</th>
                          <th scope="col" className="px-3 py-2.5 text-right font-medium text-muted-foreground">Jumlah</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record) => (
                          <tr key={record.id} className="border-b border-border/50 last:border-b-0">
                            <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                              {formatRecordPaymentDate(record.paymentDate)}
                            </td>
                            <th scope="row" className="px-3 py-2.5 text-left font-medium text-foreground">
                              <span className="break-words">{record.customerName || "-"}</span>
                            </th>
                            <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                              {record.batch}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                              {maskAccountNumber(record.accountNumber)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-foreground">
                              {formatAmountRM(record.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canGoPrevious}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Prev
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {pageLabel}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canGoNext}
            onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
