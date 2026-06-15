import { useCallback, useMemo, useState } from "react";
import { logClientError } from "@/lib/client-logger";
import { useToast } from "@/hooks/use-toast";
import {
  buildCollectionNicknameSummaryChartData,
  filterCollectionNicknameSummaryChartData,
  getCollectionNicknameSummaryChartPeak,
  hasCollectionNicknameSummaryChartData,
  rankCollectionNicknameSummaryChartData,
  type CollectionNicknameSummaryChartLimit,
  type CollectionNicknameSummaryChartSort,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import {
  CollectionNicknameSummaryMetrics,
  CollectionNicknamePerformanceLegend,
  CollectionNicknameSummaryRankingTable,
} from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartDetails";
import { CollectionNicknameSummaryChartControls } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartControls";
import {
  CollectionNicknameSummaryChartExportMenu,
  type CollectionNicknameSummaryExportKind,
} from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartExportMenu";
import { CollectionNicknameSummaryChartPlot } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartPlot";
import {
  exportCollectionNicknameSummaryCsv,
  exportCollectionNicknameSummaryPdf,
  exportCollectionNicknameSummaryPng,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-export";
import type { NicknameTotalSummary } from "@/pages/collection-nickname-summary/utils";
import { formatAmountRM } from "@/pages/collection/utils";

export type CollectionNicknameSummaryChartContentProps = {
  fromDate?: string;
  nicknameTotals: NicknameTotalSummary[];
  toDate?: string;
  totalAmount: number;
  totalRecords: number;
  displayMode?: "compact" | "detail";
};

export function CollectionNicknameSummaryChartContent({
  fromDate,
  nicknameTotals,
  toDate,
  totalAmount,
  totalRecords,
  displayMode = "compact",
}: CollectionNicknameSummaryChartContentProps) {
  const { toast } = useToast();
  const [limit, setLimit] = useState<CollectionNicknameSummaryChartLimit>("10");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<CollectionNicknameSummaryChartSort>("amount");
  const [busyExportKind, setBusyExportKind] = useState<CollectionNicknameSummaryExportKind | null>(null);
  const chartData = useMemo(
    () => buildCollectionNicknameSummaryChartData(nicknameTotals, totalAmount),
    [nicknameTotals, totalAmount],
  );
  const rankedData = useMemo(
    () => rankCollectionNicknameSummaryChartData(chartData),
    [chartData],
  );
  const peak = useMemo(
    () => getCollectionNicknameSummaryChartPeak(chartData),
    [chartData],
  );
  const hasData = hasCollectionNicknameSummaryChartData(chartData);
  const isDetailed = displayMode === "detail";
  const displayedData = useMemo(
    () => isDetailed
      ? filterCollectionNicknameSummaryChartData(chartData, { limit, query, sortBy })
      : chartData,
    [chartData, isDetailed, limit, query, sortBy],
  );
  const displayedRankedData = useMemo(
    () => isDetailed ? displayedData : rankedData,
    [displayedData, isDetailed, rankedData],
  );
  const displayedTotalAmount = useMemo(
    () => displayedData.reduce((sum, row) => sum + row.totalAmount, 0),
    [displayedData],
  );
  const displayedTotalRecords = useMemo(
    () => displayedData.reduce((sum, row) => sum + row.totalRecords, 0),
    [displayedData],
  );
  const resetFilters = useCallback(() => {
    setLimit("10");
    setQuery("");
    setSortBy("amount");
  }, []);
  const handleExport = useCallback((kind: CollectionNicknameSummaryExportKind) => {
    if (busyExportKind || displayedRankedData.length === 0) {
      return;
    }

    const exportContext = {
      fromDate,
      toDate,
      totalAmount,
      totalRecords,
    };
    setBusyExportKind(kind);
    const exportPromise = Promise.resolve().then(() => {
      if (kind === "pdf") {
        return exportCollectionNicknameSummaryPdf(displayedRankedData, exportContext);
      }
      if (kind === "png") {
        return exportCollectionNicknameSummaryPng(displayedRankedData, exportContext);
      }
      exportCollectionNicknameSummaryCsv(displayedRankedData, exportContext);
      return undefined;
    });

    void exportPromise
      .then(() => {
        toast({
          title: `Eksport ${kind.toUpperCase()} selesai`,
          description: `${displayedRankedData.length} nickname telah dimuat turun.`,
          dedupeKey: `nickname-summary-export-${kind}-success`,
          historyModule: "collection",
        });
      })
      .catch((error: unknown) => {
        logClientError("Nickname summary export failed", error, { kind });
        toast({
          title: `Eksport ${kind.toUpperCase()} gagal`,
          description: "Fail tidak dapat dijana. Sila cuba semula.",
          variant: "destructive",
          dedupeKey: `nickname-summary-export-${kind}-failure`,
          historyModule: "collection",
        });
      })
      .finally(() => {
        setBusyExportKind(null);
      });
  }, [
    busyExportKind,
    displayedRankedData,
    fromDate,
    toDate,
    toast,
    totalAmount,
    totalRecords,
  ]);

  if (chartData.length === 0) {
    return (
      <div
        className="min-h-[260px] rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm font-semibold text-foreground">No nickname collection data</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          No nickname collection data is available for the selected filter.
        </p>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div
        className="min-h-[260px] rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm font-semibold text-foreground">No collection amount to chart</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The selected nicknames have {totalRecords} record(s), but their total collection amount is zero.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      <CollectionNicknameSummaryMetrics
        detailed={isDetailed}
        peak={peak}
        totalAmount={totalAmount}
        totalRecords={totalRecords}
      />

      {isDetailed ? (
        <CollectionNicknameSummaryChartControls
          limit={limit}
          query={query}
          sortBy={sortBy}
          totalCount={chartData.length}
          visibleCount={displayedData.length}
          onLimitChange={setLimit}
          onQueryChange={setQuery}
          onReset={resetFilters}
          onSortChange={setSortBy}
        />
      ) : null}

      <div className={isDetailed ? "min-w-0 space-y-4" : ""}>
        <section
          className="min-w-0"
          aria-labelledby={isDetailed ? "nickname-summary-detailed-chart-title" : undefined}
        >
          {isDetailed ? (
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 id="nickname-summary-detailed-chart-title" className="text-sm font-semibold text-foreground">
                  Perbandingan kutipan
                </h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Arahkan tetikus atau fokus pada graf untuk melihat jumlah, rekod, purata dan prestasi.
                </p>
              </div>
              <CollectionNicknameSummaryChartExportMenu
                busyKind={busyExportKind}
                disabled={displayedData.length === 0}
                visibleCount={displayedData.length}
                onExport={handleExport}
              />
            </div>
          ) : null}
          {displayedData.length > 0 ? (
            <>
              {isDetailed ? <CollectionNicknamePerformanceLegend /> : null}
              <div className={isDetailed ? "mt-3" : undefined}>
                <CollectionNicknameSummaryChartPlot
                  chartData={displayedData}
                  detailed={isDetailed}
                  performancePeakAmount={peak?.totalAmount ?? 0}
                  totalAmount={isDetailed ? displayedTotalAmount : totalAmount}
                  totalRecords={isDetailed ? displayedTotalRecords : totalRecords}
                />
              </div>
            </>
          ) : (
            <div
              className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center"
              role="status"
              aria-live="polite"
            >
              <p className="text-sm font-semibold text-foreground">Tiada nickname sepadan</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ubah carian atau reset penapis untuk melihat semula data.
              </p>
            </div>
          )}
        </section>

        {isDetailed && displayedRankedData.length > 0 ? (
          <CollectionNicknameSummaryRankingTable
            peakAmount={peak?.totalAmount ?? 0}
            rankedData={displayedRankedData}
            sortBy={sortBy}
          />
        ) : null}
      </div>

      <div className="sr-only">
        <h3>Nickname summary chart data</h3>
        <ul>
          {chartData.map((row) => (
            <li key={row.key}>
              {row.nickname}: {formatAmountRM(row.totalAmount)}, {row.totalRecords} record(s),{" "}
              {Math.max(0, row.percentage).toFixed(1)}% of total
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
