import { useMemo } from "react";
import {
  buildCollectionNicknameSummaryChartData,
  getCollectionNicknameSummaryChartPeak,
  hasCollectionNicknameSummaryChartData,
  rankCollectionNicknameSummaryChartData,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import {
  CollectionNicknameSummaryMetrics,
  CollectionNicknameSummaryRankingTable,
} from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartDetails";
import { CollectionNicknameSummaryChartPlot } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartPlot";
import type { NicknameTotalSummary } from "@/pages/collection-nickname-summary/utils";
import { formatAmountRM } from "@/pages/collection/utils";

export type CollectionNicknameSummaryChartContentProps = {
  nicknameTotals: NicknameTotalSummary[];
  totalAmount: number;
  totalRecords: number;
  displayMode?: "compact" | "detail";
};

export function CollectionNicknameSummaryChartContent({
  nicknameTotals,
  totalAmount,
  totalRecords,
  displayMode = "compact",
}: CollectionNicknameSummaryChartContentProps) {
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

      <div className={isDetailed ? "min-w-0 space-y-4" : ""}>
        <section
          className="min-w-0"
          aria-labelledby={isDetailed ? "nickname-summary-detailed-chart-title" : undefined}
        >
          {isDetailed ? (
            <div className="mb-2">
              <h3 id="nickname-summary-detailed-chart-title" className="text-sm font-semibold text-foreground">
                Perbandingan kutipan
              </h3>
              <p className="text-xs leading-5 text-muted-foreground">
                Arahkan tetikus atau fokus pada graf untuk melihat jumlah, rekod dan bahagian setiap nickname.
              </p>
            </div>
          ) : null}
          <CollectionNicknameSummaryChartPlot
            chartData={chartData}
            detailed={isDetailed}
            totalAmount={totalAmount}
            totalRecords={totalRecords}
          />
        </section>

        {isDetailed ? <CollectionNicknameSummaryRankingTable rankedData={rankedData} /> : null}
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
