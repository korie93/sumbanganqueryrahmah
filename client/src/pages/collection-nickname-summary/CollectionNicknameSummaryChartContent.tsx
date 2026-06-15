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
import {
  buildCollectionNicknameSummaryChartData,
  getCollectionNicknameSummaryChartPeak,
  hasCollectionNicknameSummaryChartData,
  type CollectionNicknameSummaryChartDatum,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import type { NicknameTotalSummary } from "@/pages/collection-nickname-summary/utils";
import { formatAmountRM } from "@/pages/collection/utils";

const CHART_MIN_WIDTH = 260;
const CHART_MAX_WIDTH = 6_000;
const CHART_SLOT_WIDTH = 120;
const CHART_MARGIN = { top: 12, right: 18, left: 2, bottom: 8 };
const COMPACT_AMOUNT_FORMATTER = new Intl.NumberFormat("en-MY", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type TooltipEntry = {
  payload?: CollectionNicknameSummaryChartDatum;
};

export type CollectionNicknameSummaryChartContentProps = {
  nicknameTotals: NicknameTotalSummary[];
  totalAmount: number;
  totalRecords: number;
};

function formatCompactAmount(value: number): string {
  return `RM ${COMPACT_AMOUNT_FORMATTER.format(Math.max(0, value))}`;
}

function formatPercentage(value: number): string {
  return `${Math.max(0, value).toFixed(1)}%`;
}

function CollectionNicknameSummaryChartTooltip({
  active,
  payload,
}: {
  active?: boolean | undefined;
  payload?: TooltipEntry[] | undefined;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }

  return (
    <div className="min-w-[220px] rounded-lg border border-border/70 bg-background px-3 py-2 text-xs shadow-lg">
      <p className="max-w-[280px] break-words font-semibold text-foreground">{point.nickname}</p>
      <dl className="mt-2 grid gap-1.5 text-muted-foreground">
        <div className="flex justify-between gap-4">
          <dt>Total collection</dt>
          <dd className="font-medium text-foreground">{formatAmountRM(point.totalAmount)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Total records</dt>
          <dd>{point.totalRecords}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Share</dt>
          <dd>{formatPercentage(point.percentage)}</dd>
        </div>
      </dl>
    </div>
  );
}

function buildAccessibleChartLabel({
  chartData,
  totalAmount,
  totalRecords,
}: {
  chartData: CollectionNicknameSummaryChartDatum[];
  totalAmount: number;
  totalRecords: number;
}): string {
  const peak = getCollectionNicknameSummaryChartPeak(chartData);
  if (!peak) {
    return "Nickname summary bar chart. No collection amount is available for the selected filters.";
  }

  return `Nickname summary bar chart for ${chartData.length} nickname${chartData.length === 1 ? "" : "s"}. Total ${formatAmountRM(totalAmount)} across ${totalRecords} records. Highest collection is ${peak.nickname} with ${formatAmountRM(peak.totalAmount)}.`;
}

export function CollectionNicknameSummaryChartContent({
  nicknameTotals,
  totalAmount,
  totalRecords,
}: CollectionNicknameSummaryChartContentProps) {
  const chartData = useMemo(
    () => buildCollectionNicknameSummaryChartData(nicknameTotals, totalAmount),
    [nicknameTotals, totalAmount],
  );
  const peak = useMemo(
    () => getCollectionNicknameSummaryChartPeak(chartData),
    [chartData],
  );
  const hasData = hasCollectionNicknameSummaryChartData(chartData);
  const chartWidth = Math.min(
    CHART_MAX_WIDTH,
    Math.max(CHART_MIN_WIDTH, chartData.length * CHART_SLOT_WIDTH),
  );
  const chartLabel = buildAccessibleChartLabel({
    chartData,
    totalAmount,
    totalRecords,
  });

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
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/60 pb-3 text-sm">
        <div>
          <span className="text-muted-foreground">Chart total </span>
          <strong className="text-foreground">{formatAmountRM(totalAmount)}</strong>
        </div>
        <div>
          <span className="text-muted-foreground">Records </span>
          <strong className="text-foreground">{totalRecords}</strong>
        </div>
        <div className="min-w-0">
          <span className="text-muted-foreground">Highest </span>
          <strong className="break-words text-foreground">{peak?.nickname || "-"}</strong>
        </div>
      </div>

      <div
        className="max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-border/60 bg-background [scrollbar-width:thin]"
        role="region"
        aria-label="Nickname summary chart plot"
        // The horizontal chart viewport must be reachable without a pointer.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        data-floating-ai-avoid="true"
      >
        <div
          className="h-[320px] w-full min-w-full p-3 sm:h-[360px]"
          style={{ minWidth: `${chartWidth}px` }}
          role="img"
          aria-label={chartLabel}
        >
          <ResponsiveContainer width="100%" height="100%" debounce={80}>
            <BarChart data={chartData} margin={CHART_MARGIN} accessibilityLayer>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
              <XAxis
                dataKey="axisLabel"
                axisLine={false}
                tickLine={false}
                tickMargin={10}
                interval={0}
                minTickGap={8}
                className="text-2xs text-muted-foreground"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                tickFormatter={(value) => formatCompactAmount(Number(value || 0))}
                width={68}
                className="text-2xs text-muted-foreground"
              />
              <Tooltip
                content={(props) => <CollectionNicknameSummaryChartTooltip {...props} />}
                cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
                wrapperStyle={{ outline: "none" }}
              />
              <Bar
                dataKey="totalAmount"
                name="Total collection"
                radius={[6, 6, 0, 0]}
                maxBarSize={46}
                isAnimationActive={false}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="sr-only">
        <h3>Nickname summary chart data</h3>
        <ul>
          {chartData.map((row) => (
            <li key={row.key}>
              {row.nickname}: {formatAmountRM(row.totalAmount)}, {row.totalRecords} record(s),{" "}
              {formatPercentage(row.percentage)} of total
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
