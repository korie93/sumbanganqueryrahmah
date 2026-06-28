import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getCollectionNicknameBenchmarkGap,
  getCollectionNicknameBenchmarkProgress,
  getCollectionNicknameBenchmarkStatus,
  getCollectionNicknameBenchmarkStatusLabel,
  getCollectionNicknamePerformanceLabel,
  getCollectionNicknameSummaryChartPeak,
  getCollectionNicknameTargetAwarePerformanceLevel,
  type CollectionNicknameSummaryChartDatum,
  type CollectionNicknameSummaryChartMetric,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import {
  getCollectionNicknameTargetEvaluationAmount,
  getCollectionNicknameTargetBenchmark,
  isCollectionNicknameTargetBenchmarkComplete,
  type CollectionNicknameTargetBenchmark,
} from "@/pages/collection-nickname-summary/collection-nickname-target-benchmarks";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  buildCollectionNicknameSummaryMetricData,
  formatCollectionNicknameChartMetricAxis,
  getCollectionNicknameChartMetricName,
  type CollectionNicknameSummaryMetricDatum,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-metrics";

const CHART_MIN_WIDTH = 260;
const CHART_MAX_WIDTH = 6_000;
const CHART_SLOT_WIDTH = 120;
const DETAILED_CHART_SLOT_WIDTH = 150;
const CHART_MARGIN = { top: 12, right: 18, left: 2, bottom: 8 };
type TooltipEntry = {
  payload?: CollectionNicknameSummaryMetricDatum;
};

type CollectionNicknameSummaryChartPlotProps = {
  chartData: CollectionNicknameSummaryChartDatum[];
  detailed: boolean;
  metric: CollectionNicknameSummaryChartMetric;
  onSelectNickname?: (row: CollectionNicknameSummaryChartDatum) => void;
  performancePeakAmount?: number;
  targetBenchmarks?: ReadonlyMap<string, CollectionNicknameTargetBenchmark> | undefined;
  totalAmount: number;
  totalRecords: number;
};

function formatPercentage(value: number): string {
  return `${Math.max(0, value).toFixed(1)}%`;
}

function CollectionNicknameSummaryChartTooltip({
  active,
  peakAmount,
  payload,
  targetBenchmarks,
}: {
  active?: boolean | undefined;
  peakAmount: number;
  payload?: TooltipEntry[] | undefined;
  targetBenchmarks?: ReadonlyMap<string, CollectionNicknameTargetBenchmark> | undefined;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }
  const benchmark = getCollectionNicknameTargetBenchmark(targetBenchmarks, point.nickname);
  const benchmarkComplete = isCollectionNicknameTargetBenchmarkComplete(benchmark);
  const benchmarkAmount = getCollectionNicknameTargetEvaluationAmount(benchmark);
  const benchmarkActive = benchmarkAmount > 0;
  const performanceLevel = getCollectionNicknameTargetAwarePerformanceLevel(
    point,
    peakAmount,
    benchmarkAmount,
  );
  const benchmarkStatus = getCollectionNicknameBenchmarkStatus(point, benchmarkAmount);
  const benchmarkProgress = getCollectionNicknameBenchmarkProgress(point, benchmarkAmount);
  const benchmarkGap = getCollectionNicknameBenchmarkGap(point, benchmarkAmount);

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
          <dt>{benchmarkActive ? "Prestasi target" : "Prestasi relatif"}</dt>
          <dd className="font-medium text-foreground">
            {getCollectionNicknamePerformanceLabel(performanceLevel)}
          </dd>
        </div>
        {benchmarkActive ? (
          <>
            <div className="flex justify-between gap-4">
              <dt>Target</dt>
              <dd>{formatAmountRM(benchmarkAmount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Status target</dt>
              <dd className="font-medium text-foreground">
                {getCollectionNicknameBenchmarkStatusLabel(benchmarkStatus)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Progress</dt>
              <dd>
                {formatPercentage(Math.min(benchmarkProgress, 999.9))}
                {benchmarkGap > 0 ? `, kurang ${formatAmountRM(benchmarkGap)}` : ""}
              </dd>
            </div>
          </>
        ) : null}
        {!benchmarkComplete && benchmark.requestedMonths > 0 ? (
          <>
            <div className="flex justify-between gap-4">
              <dt>Status target</dt>
              <dd className="font-medium text-foreground">Tidak lengkap</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Bulan ditetapkan</dt>
              <dd>{benchmark.configuredMonths}/{benchmark.requestedMonths}</dd>
            </div>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function buildAccessibleChartLabel({
  chartData,
  configuredTargetCount,
  maxTargetAmount,
  metric,
  totalAmount,
  totalRecords,
}: {
  chartData: CollectionNicknameSummaryChartDatum[];
  configuredTargetCount: number;
  maxTargetAmount: number;
  metric: CollectionNicknameSummaryChartMetric;
  totalAmount: number;
  totalRecords: number;
}): string {
  const peak = getCollectionNicknameSummaryChartPeak(chartData);
  if (!peak) {
    return "Nickname summary bar chart. No collection amount is available for the selected filters.";
  }

  const benchmarkText = configuredTargetCount > 0
    ? ` ${configuredTargetCount} nickname${configuredTargetCount === 1 ? " has" : "s have"} Collection Daily targets, with the highest target at ${formatAmountRM(maxTargetAmount)}. Target-aware performance is used when a target is configured.`
    : "";

  return `Nickname summary bar chart for ${chartData.length} nickname${chartData.length === 1 ? "" : "s"}. Displaying ${getCollectionNicknameChartMetricName(metric).toLowerCase()}. Total ${formatAmountRM(totalAmount)} across ${totalRecords} records. Highest collection is ${peak.nickname} with ${formatAmountRM(peak.totalAmount)}.${benchmarkText}`;
}

export function CollectionNicknameSummaryChartPlot({
  chartData,
  detailed,
  metric,
  onSelectNickname,
  performancePeakAmount,
  targetBenchmarks,
  totalAmount,
  totalRecords,
}: CollectionNicknameSummaryChartPlotProps) {
  const chartRows = buildCollectionNicknameSummaryMetricData(
    chartData,
    targetBenchmarks,
    metric,
  );
  const configuredTargetAmounts = chartRows
    .map((row) => row.targetAmount ?? 0)
    .filter((amount) => amount > 0);
  const configuredTargetCount = configuredTargetAmounts.length;
  const maxTargetAmount = configuredTargetAmounts.reduce((peak, amount) => Math.max(peak, amount), 0);
  const uniqueTargetAmounts = Array.from(new Set(configuredTargetAmounts.map((amount) => amount.toFixed(2))));
  const singleReferenceTargetAmount = uniqueTargetAmounts.length === 1
    ? Number(uniqueTargetAmounts[0])
    : 0;
  const chartWidth = Math.min(
    CHART_MAX_WIDTH,
    Math.max(
      CHART_MIN_WIDTH,
      chartData.length * (detailed ? DETAILED_CHART_SLOT_WIDTH : CHART_SLOT_WIDTH),
    ),
  );
  const chartLabel = buildAccessibleChartLabel({
    chartData,
    configuredTargetCount,
    maxTargetAmount,
    metric,
    totalAmount,
    totalRecords,
  });
  const peakAmount = performancePeakAmount
    ?? getCollectionNicknameSummaryChartPeak(chartData)?.totalAmount
    ?? 0;
  const targetReferenceValue = metric === "progress"
    ? configuredTargetCount > 0 ? 100 : 0
    : metric === "amount"
      ? singleReferenceTargetAmount
      : 0;
  const primaryDataKey = metric === "amount" ? "totalAmount" : "chartValue";
  const chartMargin = detailed ? { ...CHART_MARGIN, top: 32 } : CHART_MARGIN;

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
            ? "h-[clamp(420px,58vh,720px)] w-full min-w-full p-3"
            : "h-[320px] w-full min-w-full p-3 sm:h-[360px]"
        }
        style={{ minWidth: `${chartWidth}px` }}
        role="img"
        aria-label={chartLabel}
      >
        <ResponsiveContainer width="100%" height="100%" debounce={80}>
          <BarChart data={chartRows} margin={chartMargin} accessibilityLayer barGap={6}>
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
              tickFormatter={(value) => formatCollectionNicknameChartMetricAxis(
                Number(value || 0),
                metric,
              )}
              width={68}
              className="text-2xs text-muted-foreground"
            />
            <Tooltip
              content={(props) => (
                <CollectionNicknameSummaryChartTooltip
                  {...props}
                  peakAmount={peakAmount}
                  targetBenchmarks={targetBenchmarks}
                />
              )}
              cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
              wrapperStyle={{ outline: "none" }}
            />
            {targetReferenceValue > 0 ? (
              <ReferenceLine
                y={targetReferenceValue}
                stroke="hsl(var(--destructive))"
                strokeDasharray="6 4"
                strokeOpacity={0.9}
                strokeWidth={2}
                label={{
                  value: metric === "progress" ? "Target 100%" : "Target",
                  position: "insideTopRight",
                  fill: "hsl(var(--destructive))",
                  fontSize: 11,
                }}
              />
            ) : null}
            {metric === "amount" && configuredTargetCount > 0 ? (
              <Bar
                dataKey="targetAmount"
                name="Target Collection Daily"
                fill="transparent"
                stroke="hsl(var(--destructive))"
                strokeDasharray="4 3"
                strokeOpacity={0.9}
                strokeWidth={2}
                radius={[6, 6, 0, 0]}
                maxBarSize={detailed ? 44 : 34}
                isAnimationActive={false}
              />
            ) : null}
            <Bar
              dataKey={primaryDataKey}
              name={getCollectionNicknameChartMetricName(metric)}
              radius={[6, 6, 0, 0]}
              maxBarSize={detailed ? 58 : 46}
              isAnimationActive={false}
            >
              {chartRows.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={entry.color}
                  cursor={onSelectNickname ? "pointer" : "default"}
                  onClick={() => onSelectNickname?.(entry)}
                />
              ))}
              {detailed ? (
                <LabelList
                  dataKey="chartLabel"
                  position="top"
                  fill="hsl(var(--foreground))"
                  fontSize={11}
                />
              ) : null}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
