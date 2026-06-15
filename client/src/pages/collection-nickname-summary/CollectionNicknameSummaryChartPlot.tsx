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
  getCollectionNicknamePerformanceLabel,
  getCollectionNicknamePerformanceLevel,
  getCollectionNicknameSummaryChartPeak,
  type CollectionNicknameSummaryChartDatum,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import { formatAmountRM } from "@/pages/collection/utils";

const CHART_MIN_WIDTH = 260;
const CHART_MAX_WIDTH = 6_000;
const CHART_SLOT_WIDTH = 120;
const DETAILED_CHART_SLOT_WIDTH = 150;
const CHART_MARGIN = { top: 12, right: 18, left: 2, bottom: 8 };
const COMPACT_AMOUNT_FORMATTER = new Intl.NumberFormat("en-MY", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type TooltipEntry = {
  payload?: CollectionNicknameSummaryChartDatum;
};

type CollectionNicknameSummaryChartPlotProps = {
  chartData: CollectionNicknameSummaryChartDatum[];
  detailed: boolean;
  performancePeakAmount?: number;
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
  peakAmount,
  payload,
}: {
  active?: boolean | undefined;
  peakAmount: number;
  payload?: TooltipEntry[] | undefined;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }
  const performanceLevel = getCollectionNicknamePerformanceLevel(point, peakAmount);

  return (
    <div className="min-w-[220px] rounded-lg border border-border/70 bg-background px-3 py-2 text-xs shadow-lg">
      <p className="max-w-[280px] break-words font-semibold text-foreground">{point.nickname}</p>
      <dl className="mt-2 grid gap-1.5 text-muted-foreground">
        <div className="flex justify-between gap-4">
          <dt>Jumlah kutipan</dt>
          <dd className="font-medium text-foreground">{formatAmountRM(point.totalAmount)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Jumlah rekod</dt>
          <dd>{point.totalRecords.toLocaleString()}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Purata setiap rekod</dt>
          <dd>{formatAmountRM(point.averagePerRecord)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Bahagian</dt>
          <dd>{formatPercentage(point.percentage)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Prestasi</dt>
          <dd className="font-medium text-foreground">
            {getCollectionNicknamePerformanceLabel(performanceLevel)}
          </dd>
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

export function CollectionNicknameSummaryChartPlot({
  chartData,
  detailed,
  performancePeakAmount,
  totalAmount,
  totalRecords,
}: CollectionNicknameSummaryChartPlotProps) {
  const chartWidth = Math.min(
    CHART_MAX_WIDTH,
    Math.max(
      CHART_MIN_WIDTH,
      chartData.length * (detailed ? DETAILED_CHART_SLOT_WIDTH : CHART_SLOT_WIDTH),
    ),
  );
  const chartLabel = buildAccessibleChartLabel({
    chartData,
    totalAmount,
    totalRecords,
  });
  const peakAmount = performancePeakAmount
    ?? getCollectionNicknameSummaryChartPeak(chartData)?.totalAmount
    ?? 0;

  return (
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
        className={
          detailed
            ? "h-[clamp(300px,42vh,500px)] w-full min-w-full p-3"
            : "h-[320px] w-full min-w-full p-3 sm:h-[360px]"
        }
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
              content={(props) => (
                <CollectionNicknameSummaryChartTooltip {...props} peakAmount={peakAmount} />
              )}
              cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
              wrapperStyle={{ outline: "none" }}
            />
            <Bar
              dataKey="totalAmount"
              name="Jumlah kutipan"
              radius={[6, 6, 0, 0]}
              maxBarSize={detailed ? 58 : 46}
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
  );
}
