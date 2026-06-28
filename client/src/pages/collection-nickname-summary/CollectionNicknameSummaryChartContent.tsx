import { useCallback, useEffect, useMemo, useState } from "react";
import { logClientError } from "@/lib/client-logger";
import { useToast } from "@/hooks/use-toast";
import {
  buildCollectionNicknameSummaryChartData,
  filterCollectionNicknameSummaryChartData,
  getCollectionNicknameBenchmarkGap,
  getCollectionNicknameSummaryChartPeak,
  hasCollectionNicknameSummaryChartData,
  rankCollectionNicknameSummaryChartData,
  type CollectionNicknameSummaryChartDatum,
  type CollectionNicknameSummaryChartLimit,
  type CollectionNicknameSummaryChartMetric,
  type CollectionNicknameSummaryChartSort,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import {
  CollectionNicknameBenchmarkLegend,
  CollectionNicknameSummaryMetrics,
  CollectionNicknamePerformanceLegend,
  CollectionNicknameSummaryRankingTable,
} from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartDetails";
import { CollectionNicknameSummaryChartControls } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartControls";
import { CollectionNicknameSummaryDrilldownDrawer } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryDrilldownDrawer";
import {
  CollectionNicknameSummaryChartExportMenu,
  type CollectionNicknameSummaryExportKind,
} from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartExportMenu";
import { CollectionNicknameSummaryChartPlot } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartPlot";
import {
  buildCollectionNicknameTargetBenchmarksFromRows,
  getCollectionNicknameTargetBenchmark,
  getCollectionNicknameTargetEvaluationAmount,
  isCollectionNicknameTargetBenchmarkComplete,
  useCollectionNicknameTargetBenchmarks,
} from "@/pages/collection-nickname-summary/collection-nickname-target-benchmarks";
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
  const [metric, setMetric] = useState<CollectionNicknameSummaryChartMetric>("amount");
  const [selectedDrilldownRow, setSelectedDrilldownRow] =
    useState<CollectionNicknameSummaryChartDatum | null>(null);
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
  const detailedChartLabelProps = isDetailed
    ? { "aria-labelledby": "nickname-summary-detailed-chart-title" }
    : {};
  const prefetchedTargetBenchmarks = useMemo(
    () => buildCollectionNicknameTargetBenchmarksFromRows(nicknameTotals),
    [nicknameTotals],
  );
  const targetBenchmarks = useCollectionNicknameTargetBenchmarks({
    enabled: isDetailed && chartData.length > 0,
    fromDate,
    prefetchedBenchmarks: prefetchedTargetBenchmarks,
    rows: chartData,
    toDate,
  });
  const displayedData = useMemo(
    () => isDetailed
      ? filterCollectionNicknameSummaryChartData(chartData, {
          getTargetGap: (row) => getCollectionNicknameBenchmarkGap(
            row,
            getCollectionNicknameTargetEvaluationAmount(
              getCollectionNicknameTargetBenchmark(targetBenchmarks.benchmarks, row.nickname),
            ),
          ),
          limit,
          query,
          sortBy,
        })
      : chartData,
    [chartData, isDetailed, limit, query, sortBy, targetBenchmarks.benchmarks],
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
  const displayedTargetSummary = useMemo(
    () => displayedData.reduce((summary, row) => {
      const benchmark = getCollectionNicknameTargetBenchmark(
        targetBenchmarks.benchmarks,
        row.nickname,
      );
      const complete = isCollectionNicknameTargetBenchmarkComplete(benchmark)
        && benchmark.amount > 0;
      return {
        completeCount: summary.completeCount + (complete ? 1 : 0),
        configuredCount: summary.configuredCount + (benchmark.configuredMonths > 0 ? 1 : 0),
        incompleteCount: summary.incompleteCount + (
          benchmark.requestedMonths > 0 && !complete ? 1 : 0
        ),
      };
    }, { completeCount: 0, configuredCount: 0, incompleteCount: 0 }),
    [displayedData, targetBenchmarks.benchmarks],
  );
  const targetModesDisabled = targetBenchmarks.loading || displayedTargetSummary.completeCount === 0;
  useEffect(() => {
    if (!targetBenchmarks.loading && displayedTargetSummary.completeCount === 0) {
      setMetric("amount");
      setSortBy((current) => current === "gap" ? "amount" : current);
    }
  }, [displayedTargetSummary.completeCount, targetBenchmarks.loading]);
  const selectedTargetBenchmark = selectedDrilldownRow
    ? getCollectionNicknameTargetBenchmark(targetBenchmarks.benchmarks, selectedDrilldownRow.nickname)
    : null;
  const resetFilters = useCallback(() => {
    setLimit("10");
    setMetric("amount");
    setQuery("");
    setSortBy("amount");
  }, []);
  const handleSelectNickname = useCallback((row: CollectionNicknameSummaryChartDatum) => {
    setSelectedDrilldownRow(row);
  }, []);
  const handleDrilldownOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedDrilldownRow(null);
    }
  }, []);
  const handleExport = useCallback((kind: CollectionNicknameSummaryExportKind) => {
    if (busyExportKind || displayedRankedData.length === 0) {
      return;
    }

    const exportContext = {
      fromDate,
      metric,
      targetBenchmarks: targetBenchmarks.benchmarks,
      targetStatusNote: targetBenchmarks.errorMessage
        ? `Target Collection Daily tidak dapat dimuat: ${targetBenchmarks.errorMessage}`
        : displayedTargetSummary.configuredCount > 0
          ? `${displayedTargetSummary.configuredCount}/${displayedData.length} nickname mempunyai target Collection Daily. Target menggunakan jumlah bulanan penuh bagi ${targetBenchmarks.requestedMonths} bulan dipilih.${displayedTargetSummary.incompleteCount > 0 ? ` ${displayedTargetSummary.incompleteCount} nickname mempunyai bulan tanpa target dan tidak dinilai sebagai prestasi target.` : ""}`
          : displayedTargetSummary.incompleteCount > 0
            ? `Tiada target lengkap untuk paparan ini. ${displayedTargetSummary.incompleteCount} nickname mempunyai bulan tanpa target dan tidak dinilai sebagai prestasi target.`
            : "Tiada target Collection Daily aktif untuk paparan ini.",
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
    displayedData.length,
    displayedTargetSummary.configuredCount,
    displayedTargetSummary.incompleteCount,
    fromDate,
    metric,
    targetBenchmarks.benchmarks,
    targetBenchmarks.errorMessage,
    targetBenchmarks.requestedMonths,
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
          metric={metric}
          query={query}
          sortBy={sortBy}
          totalCount={chartData.length}
          visibleCount={displayedData.length}
          onLimitChange={setLimit}
          onMetricChange={setMetric}
          onQueryChange={setQuery}
          onReset={resetFilters}
          onSortChange={setSortBy}
          targetModesDisabled={targetModesDisabled}
        />
      ) : null}

      <div className={isDetailed ? "min-w-0 space-y-4" : ""}>
        <section
          className="min-w-0"
          {...detailedChartLabelProps}
        >
          {isDetailed ? (
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 id="nickname-summary-detailed-chart-title" className="text-sm font-semibold text-foreground">
                  {metric === "progress"
                    ? "Progress terhadap target"
                    : metric === "gap"
                      ? "Jurang untuk capai target"
                      : "Perbandingan kutipan"}
                </h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  {metric === "amount"
                    ? "Arahkan tetikus atau fokus pada graf untuk melihat jumlah, rekod, purata, target dan prestasi. Bar berbingkai merah menunjukkan target Collection Daily apabila tersedia."
                    : "Nilai dipaparkan terus pada bar. Target tidak lengkap tidak dimasukkan dalam pengiraan prestasi."}
                </p>
              </div>
              <CollectionNicknameSummaryChartExportMenu
                busyKind={busyExportKind}
                disabled={displayedData.length === 0}
                targetLoading={targetBenchmarks.loading}
                visibleCount={displayedData.length}
                onExport={handleExport}
              />
            </div>
          ) : null}
          {displayedData.length > 0 ? (
            <>
              {isDetailed ? (
                <CollectionNicknamePerformanceLegend targetAware={targetBenchmarks.completeCount > 0} />
              ) : null}
              {isDetailed ? (
                <CollectionNicknameBenchmarkLegend
                  configuredCount={targetBenchmarks.configuredCount}
                  errorMessage={targetBenchmarks.errorMessage}
                  incompleteCount={targetBenchmarks.incompleteCount}
                  loading={targetBenchmarks.loading}
                  requestedMonths={targetBenchmarks.requestedMonths}
                  visibleCount={displayedData.length}
                />
              ) : null}
              <div className={isDetailed ? "mt-3" : undefined}>
                <CollectionNicknameSummaryChartPlot
                  chartData={displayedData}
                  detailed={isDetailed}
                  metric={metric}
                  onSelectNickname={handleSelectNickname}
                  performancePeakAmount={peak?.totalAmount ?? 0}
                  targetBenchmarks={isDetailed ? targetBenchmarks.benchmarks : undefined}
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
            onSelectNickname={handleSelectNickname}
            peakAmount={peak?.totalAmount ?? 0}
            rankedData={displayedRankedData}
            sortBy={sortBy}
            targetBenchmarks={targetBenchmarks.benchmarks}
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
      <CollectionNicknameSummaryDrilldownDrawer
        benchmark={isDetailed ? selectedTargetBenchmark : null}
        fromDate={fromDate}
        open={Boolean(selectedDrilldownRow)}
        row={selectedDrilldownRow}
        toDate={toDate}
        onOpenChange={handleDrilldownOpenChange}
      />
    </div>
  );
}
