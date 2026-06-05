import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CollectionMonthlySummary } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  buildCollectionSummaryBarChartData,
  getCollectionSummaryBarChartPeakMonth,
  hasCollectionSummaryBarChartData,
  type CollectionSummaryBarChartDatum,
} from "@/pages/collection-summary/collection-summary-bar-chart-utils";

const COLLECTION_SUMMARY_BAR_CHART_MARGIN = { top: 10, right: 10, left: -8, bottom: 0 };
const COLLECTION_SUMMARY_BAR_CHART_TOOLTIP_STYLE = { outline: "none" };

type TooltipEntry = {
  payload?: CollectionSummaryBarChartDatum;
};

export type CollectionSummaryBarChartDialogContentProps = {
  loading: boolean;
  summaryRows: CollectionMonthlySummary[];
  selectedYear: string;
  selectedNicknameLabel: string;
  selectedNicknamesCount: number;
  grandTotal: {
    totalRecords: number;
    totalAmount: number;
  };
};

function CollectionSummaryBarChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean | undefined;
  label?: string | number | undefined;
  payload?: TooltipEntry[] | undefined;
}) {
  if (!active || typeof label !== "string" || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  return (
    <div className="min-w-[210px] rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{label}</p>
      <dl className="mt-2 grid gap-1 text-muted-foreground">
        <div className="flex justify-between gap-3">
          <dt>Total</dt>
          <dd className="font-medium text-foreground">{formatAmountRM(point?.totalAmount || 0)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Records</dt>
          <dd>{Number(point?.totalRecords || 0)} record(s)</dd>
        </div>
      </dl>
    </div>
  );
}

function buildCollectionSummaryChartAccessibleLabel({
  chartData,
  selectedYear,
  selectedNicknameLabel,
  grandTotal,
}: {
  chartData: CollectionSummaryBarChartDatum[];
  selectedYear: string;
  selectedNicknameLabel: string;
  grandTotal: CollectionSummaryBarChartDialogContentProps["grandTotal"];
}) {
  const peakMonth = getCollectionSummaryBarChartPeakMonth(chartData);
  const activeMonths = chartData.filter((row) => row.hasData).length;

  if (!peakMonth) {
    return `Collection summary bar chart for ${selectedYear}, ${selectedNicknameLabel}. No collection data is available.`;
  }

  return `Collection summary bar chart for ${selectedYear}, ${selectedNicknameLabel}. Total ${formatAmountRM(grandTotal.totalAmount)} across ${grandTotal.totalRecords} records. Peak month ${peakMonth.label} with ${formatAmountRM(peakMonth.totalAmount)}. ${activeMonths} active month${activeMonths === 1 ? "" : "s"}.`;
}

export function CollectionSummaryBarChartDialogContent({
  loading,
  summaryRows,
  selectedYear,
  selectedNicknameLabel,
  selectedNicknamesCount,
  grandTotal,
}: CollectionSummaryBarChartDialogContentProps) {
  const chartData = useMemo(
    () => buildCollectionSummaryBarChartData(summaryRows),
    [summaryRows],
  );
  const hasData = hasCollectionSummaryBarChartData(chartData);
  const peakMonth = useMemo(
    () => getCollectionSummaryBarChartPeakMonth(chartData),
    [chartData],
  );
  const activeMonthCount = chartData.filter((row) => row.hasData).length;
  const chartLabel = buildCollectionSummaryChartAccessibleLabel({
    chartData,
    selectedYear,
    selectedNicknameLabel,
    grandTotal,
  });
  const nicknameScope =
    selectedNicknamesCount > 0
      ? `${selectedNicknamesCount} selected nickname${selectedNicknamesCount === 1 ? "" : "s"}`
      : "All staff nicknames";

  if (loading) {
    return (
      <div
        className="rounded-xl border border-border/60 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        Loading collection summary chart...
      </div>
    );
  }

  if (!hasData) {
    return (
      <div
        className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm font-semibold text-foreground">No collection data to chart</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The selected {selectedYear} summary currently has no collection amount or records for {selectedNicknameLabel}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2">
          <p className="text-2xs font-medium uppercase tracking-normal text-muted-foreground">
            Year scope
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{selectedYear}</p>
          <p className="text-2xs text-muted-foreground">{nicknameScope}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2">
          <p className="text-2xs font-medium uppercase tracking-normal text-muted-foreground">
            Chart total
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatAmountRM(grandTotal.totalAmount)}
          </p>
          <p className="text-2xs text-muted-foreground">{grandTotal.totalRecords} record(s)</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2">
          <p className="text-2xs font-medium uppercase tracking-normal text-muted-foreground">
            Peak month
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {peakMonth ? peakMonth.label : "No data"}
          </p>
          <p className="text-2xs text-muted-foreground">
            {peakMonth ? formatAmountRM(peakMonth.totalAmount) : `${activeMonthCount} active month(s)`}
          </p>
        </div>
      </div>

      <div
        className="h-[min(58vh,430px)] min-h-[280px] min-w-0 rounded-xl border border-border/60 bg-background p-3"
        role="img"
        aria-label={chartLabel}
      >
        <ResponsiveContainer width="100%" height="100%" debounce={80}>
          <BarChart data={chartData} margin={COLLECTION_SUMMARY_BAR_CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
            <XAxis
              dataKey="shortLabel"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              className="text-2xs text-muted-foreground"
              minTickGap={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tickFormatter={(value) => formatAmountRM(Number(value || 0)).replace("MYR", "RM")}
              className="text-2xs text-muted-foreground"
              width={72}
            />
            <Tooltip
              content={(props) => <CollectionSummaryBarChartTooltip {...props} />}
              wrapperStyle={COLLECTION_SUMMARY_BAR_CHART_TOOLTIP_STYLE}
            />
            <Bar
              dataKey="totalAmount"
              name="Monthly collection"
              radius={[8, 8, 0, 0]}
              maxBarSize={44}
              isAnimationActive={false}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.month}
                  fill={entry.hasData ? "hsl(var(--primary))" : "hsl(var(--muted))"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="sr-only">
        <h3>Collection summary chart data</h3>
        <ul>
          {chartData.map((row) => (
            <li key={row.month}>
              {row.label}: {formatAmountRM(row.totalAmount)}, {row.totalRecords} record(s)
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
