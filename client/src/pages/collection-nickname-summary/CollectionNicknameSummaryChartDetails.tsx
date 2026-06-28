import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getCollectionNicknameBenchmarkGap,
  getCollectionNicknameBenchmarkProgress,
  getCollectionNicknameBenchmarkStatus,
  getCollectionNicknameBenchmarkStatusLabel,
  getCollectionNicknamePerformanceLabel,
  getCollectionNicknameTargetAwarePerformanceLevel,
  type CollectionNicknameBenchmarkStatus,
  type CollectionNicknameSummaryChartDatum,
  type CollectionNicknameSummaryChartSort,
  type CollectionNicknamePerformanceLevel,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import {
  getCollectionNicknameTargetEvaluationAmount,
  getCollectionNicknameTargetBenchmark,
  isCollectionNicknameTargetBenchmarkComplete,
  type CollectionNicknameTargetBenchmark,
} from "@/pages/collection-nickname-summary/collection-nickname-target-benchmarks";
import { formatAmountRM } from "@/pages/collection/utils";
import type {
  CollectionNicknameTargetOutcomeSummary,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-metrics";

type CollectionNicknameSummaryMetricsProps = {
  detailed: boolean;
  peak: CollectionNicknameSummaryChartDatum | null;
  totalAmount: number;
  totalRecords: number;
};

type CollectionNicknameSummaryRankingTableProps = {
  targetBenchmarks?: ReadonlyMap<string, CollectionNicknameTargetBenchmark>;
  onSelectNickname?: (row: CollectionNicknameSummaryChartDatum) => void;
  peakAmount: number;
  rankedData: CollectionNicknameSummaryChartDatum[];
  sortBy: CollectionNicknameSummaryChartSort;
};

function formatPercentage(value: number): string {
  return `${Math.max(0, value).toFixed(1)}%`;
}

const RANKING_SORT_DESCRIPTION: Record<CollectionNicknameSummaryChartSort, string> = {
  amount: "Disusun daripada jumlah kutipan tertinggi kepada terendah.",
  records: "Disusun daripada jumlah rekod tertinggi kepada terendah.",
  average: "Disusun daripada purata setiap rekod tertinggi kepada terendah.",
  gap: "Disusun daripada jurang target terbesar kepada terkecil.",
};

const PERFORMANCE_SYMBOL: Record<CollectionNicknamePerformanceLevel, string> = {
  high: "↑",
  medium: "•",
  low: "↓",
};

const BENCHMARK_SYMBOL: Record<CollectionNicknameBenchmarkStatus, string> = {
  "not-set": "-",
  achieved: "+",
  near: "~",
  behind: "!",
};

export function CollectionNicknamePerformanceBadge({
  level,
}: {
  level: CollectionNicknamePerformanceLevel;
}) {
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-foreground"
    >
      <span aria-hidden="true">{PERFORMANCE_SYMBOL[level]}&nbsp;</span>
      {getCollectionNicknamePerformanceLabel(level)}
    </span>
  );
}

export function CollectionNicknameBenchmarkBadge({
  status,
}: {
  status: CollectionNicknameBenchmarkStatus;
}) {
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-foreground"
    >
      <span aria-hidden="true">{BENCHMARK_SYMBOL[status]}&nbsp;</span>
      {getCollectionNicknameBenchmarkStatusLabel(status)}
    </span>
  );
}

export function CollectionNicknameBenchmarkLegend({
  configuredCount,
  errorMessage,
  incompleteCount,
  loading,
  requestedMonths,
  visibleCount,
}: {
  configuredCount: number;
  errorMessage: string | null;
  incompleteCount: number;
  loading: boolean;
  requestedMonths: number;
  visibleCount: number;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground"
      aria-label="Panduan target Collection Daily"
    >
      <span className="font-medium text-foreground">Target Collection Daily:</span>
      <span className="font-semibold text-foreground">
        {loading
          ? "Memuat target..."
          : configuredCount > 0
            ? `${configuredCount}/${visibleCount} nickname ada target`
            : "Tiada target aktif"}
      </span>
      <span>
        {requestedMonths > 1
          ? `Jumlah target bulanan penuh bagi ${requestedMonths} bulan dalam julat dipilih.`
          : "Menggunakan target bulanan penuh yang ditetapkan di Collection Daily."}
      </span>
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <span
          className="w-6 border-t-2 border-dashed border-destructive"
          aria-hidden="true"
        />
        Garisan merah menunjukkan target.
      </span>
      {errorMessage ? (
        <span className="font-medium text-destructive">
          Target tidak dapat dimuat: {errorMessage}
        </span>
      ) : null}
      {!loading && !errorMessage && incompleteCount > 0 ? (
        <span className="font-medium text-foreground">
          {incompleteCount} nickname mempunyai bulan tanpa target; prestasi target tidak dinilai sehingga lengkap.
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5">
        <CollectionNicknameBenchmarkBadge status="achieved" />
        <span>100% atau lebih</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CollectionNicknameBenchmarkBadge status="near" />
        <span>80% hingga 99%</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CollectionNicknameBenchmarkBadge status="behind" />
        <span>di bawah 80%</span>
      </span>
    </div>
  );
}

export function CollectionNicknamePerformanceLegend({
  targetAware = false,
}: {
  targetAware?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground"
      aria-label="Panduan penanda prestasi"
    >
      <span className="font-medium text-foreground">
        {targetAware ? "Prestasi target:" : "Prestasi relatif:"}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CollectionNicknamePerformanceBadge level="high" />
        <span>{targetAware ? "capai target" : "sekurang-kurangnya 67% daripada kutipan tertinggi"}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CollectionNicknamePerformanceBadge level="medium" />
        <span>{targetAware ? "80% hingga 99% target" : "34% hingga 66%"}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CollectionNicknamePerformanceBadge level="low" />
        <span>{targetAware ? "belum hampir target" : "di bawah 34%"}</span>
      </span>
    </div>
  );
}

export function CollectionNicknameTargetOutcomeStrip({
  summary,
}: {
  summary: CollectionNicknameTargetOutcomeSummary;
}) {
  const outcomes = [
    { label: "Capai target", value: summary.achievedCount },
    { label: "Hampir capai", value: summary.nearCount },
    { label: "Belum capai", value: summary.behindCount },
    { label: "Tanpa target lengkap", value: summary.notEvaluatedCount },
  ] as const;

  return (
    <dl
      className="mb-3 grid grid-cols-2 gap-px border-y border-border bg-border sm:grid-cols-4"
      aria-label="Ringkasan keputusan target nickname yang dipaparkan"
    >
      {outcomes.map((outcome) => (
        <div key={outcome.label} className="min-w-0 bg-background px-3 py-2.5 text-center">
          <dt className="text-2xs font-medium leading-4 text-muted-foreground">
            {outcome.label}
          </dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
            {outcome.value.toLocaleString()}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CollectionNicknameSummaryMetrics({
  detailed,
  peak,
  totalAmount,
  totalRecords,
}: CollectionNicknameSummaryMetricsProps) {
  const overallAverage = totalRecords > 0 ? totalAmount / totalRecords : 0;

  return (
    <dl
      className={`grid gap-2 border-b border-border/60 pb-3 ${
        detailed ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"
      }`}
    >
      <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
        <dt className="text-xs text-muted-foreground">Jumlah kutipan</dt>
        <dd className="mt-1 text-sm font-semibold text-foreground">
          {formatAmountRM(totalAmount)}
        </dd>
      </div>
      <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
        <dt className="text-xs text-muted-foreground">Jumlah rekod</dt>
        <dd className="mt-1 text-sm font-semibold text-foreground">
          {totalRecords.toLocaleString()}
        </dd>
      </div>
      {detailed ? (
        <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Purata setiap rekod</dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {formatAmountRM(overallAverage)}
          </dd>
        </div>
      ) : null}
      <div className="min-w-0 rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
        <dt className="text-xs text-muted-foreground">Kutipan tertinggi</dt>
        <dd className="mt-1 break-words text-sm font-semibold text-foreground">
          {peak ? `${peak.nickname} (${formatPercentage(peak.percentage)})` : "-"}
        </dd>
      </div>
    </dl>
  );
}

export function CollectionNicknameSummaryRankingTable({
  onSelectNickname,
  peakAmount,
  rankedData,
  sortBy,
  targetBenchmarks,
}: CollectionNicknameSummaryRankingTableProps) {
  const benchmarkActive = rankedData.some((row) =>
    getCollectionNicknameTargetBenchmark(targetBenchmarks, row.nickname).configuredMonths > 0
  );

  return (
    <section className="min-w-0" aria-labelledby="nickname-summary-ranking-title">
      <div className="mb-2">
        <h3 id="nickname-summary-ranking-title" className="text-sm font-semibold text-foreground">
          Ranking terperinci
        </h3>
        <p className="text-xs leading-5 text-muted-foreground">
          {RANKING_SORT_DESCRIPTION[sortBy]}
        </p>
      </div>
      <div
        className="hidden max-h-[clamp(360px,54vh,620px)] overflow-auto rounded-lg border border-border/60 sm:block"
        role="region"
        aria-label="Nickname summary detailed ranking"
        // The wide ranking table remains keyboard-scrollable on compact screens.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
      >
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="border-b border-border/70 text-left">
              <th scope="col" className="w-14 px-3 py-2.5 font-medium text-muted-foreground">#</th>
              <th scope="col" className="px-3 py-2.5 font-medium text-muted-foreground">Nickname</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-muted-foreground">Kutipan</th>
              {benchmarkActive ? (
                <th scope="col" className="px-3 py-2.5 text-center font-medium text-muted-foreground">Target</th>
              ) : null}
              <th scope="col" className="px-3 py-2.5 text-center font-medium text-muted-foreground">Prestasi</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-muted-foreground">Rekod</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-muted-foreground">Purata</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-muted-foreground">Bahagian</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-muted-foreground">Drill-down</th>
            </tr>
          </thead>
          <tbody>
            {rankedData.map((row, index) => {
              const benchmark = getCollectionNicknameTargetBenchmark(targetBenchmarks, row.nickname);
              const benchmarkComplete = isCollectionNicknameTargetBenchmarkComplete(benchmark);
              const benchmarkAmount = getCollectionNicknameTargetEvaluationAmount(benchmark);
              const targetStatus = getCollectionNicknameBenchmarkStatus(row, benchmarkAmount);
              const performanceLevel = getCollectionNicknameTargetAwarePerformanceLevel(
                row,
                peakAmount,
                benchmarkAmount,
              );
              const progress = getCollectionNicknameBenchmarkProgress(row, benchmarkAmount);
              const gap = getCollectionNicknameBenchmarkGap(row, benchmarkAmount);
              return (
                <tr key={row.key} className="border-b border-border/50 last:border-b-0">
                  <td className="px-3 py-2.5 font-medium text-muted-foreground">{index + 1}</td>
                  <th scope="row" className="px-3 py-2.5 text-left font-medium text-foreground">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: row.color }}
                        aria-hidden="true"
                      />
                      <span className="break-words">{row.nickname}</span>
                    </span>
                  </th>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-foreground">
                    {formatAmountRM(row.totalAmount)}
                  </td>
                  {benchmarkActive ? (
                    <td className="whitespace-nowrap px-3 py-2.5 text-center">
                      {!benchmarkComplete ? (
                        <div className="inline-flex flex-col items-center gap-1">
                          <span className="text-xs font-semibold text-foreground">Target tidak lengkap</span>
                          <span className="text-2xs text-muted-foreground">
                            {benchmark.configuredMonths}/{benchmark.requestedMonths} bulan ditetapkan
                          </span>
                        </div>
                      ) : benchmarkAmount > 0 ? (
                        <div className="inline-flex flex-col items-center gap-1">
                          <CollectionNicknameBenchmarkBadge status={targetStatus} />
                          <span className="text-2xs text-muted-foreground">
                            {formatPercentage(Math.min(progress, 999.9))}
                            {gap > 0 ? `, kurang ${formatAmountRM(gap)}` : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Tiada target</span>
                      )}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-3 py-2.5 text-center">
                    <CollectionNicknamePerformanceBadge level={performanceLevel} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-muted-foreground">
                    {row.totalRecords.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-muted-foreground">
                    {formatAmountRM(row.averagePerRecord)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-muted-foreground">
                    {formatPercentage(row.percentage)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {onSelectNickname ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => onSelectNickname(row)}
                      >
                        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                        Lihat rekod
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ol
        className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 sm:hidden"
        aria-label="Nickname summary compact ranking"
      >
        {rankedData.map((row, index) => {
          const benchmark = getCollectionNicknameTargetBenchmark(targetBenchmarks, row.nickname);
          const benchmarkComplete = isCollectionNicknameTargetBenchmarkComplete(benchmark);
          const benchmarkAmount = getCollectionNicknameTargetEvaluationAmount(benchmark);
          const targetStatus = getCollectionNicknameBenchmarkStatus(row, benchmarkAmount);
          const performanceLevel = getCollectionNicknameTargetAwarePerformanceLevel(
            row,
            peakAmount,
            benchmarkAmount,
          );
          const progress = getCollectionNicknameBenchmarkProgress(row, benchmarkAmount);
          return (
            <li key={row.key} className="space-y-2.5 bg-background px-3 py-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-5 shrink-0 text-xs font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: row.color }}
                    aria-hidden="true"
                  />
                  <span className="break-words text-sm font-semibold text-foreground">
                    {row.nickname}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-semibold text-foreground">
                  {formatAmountRM(row.totalAmount)}
                </span>
              </div>
              <div className="space-y-2 pl-7">
                <CollectionNicknamePerformanceBadge level={performanceLevel} />
                {benchmarkActive ? (
                  !benchmarkComplete ? (
                    <span className="text-xs font-medium text-foreground">
                      Target tidak lengkap ({benchmark.configuredMonths}/{benchmark.requestedMonths} bulan)
                    </span>
                  ) : benchmarkAmount > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <CollectionNicknameBenchmarkBadge status={targetStatus} />
                      <span className="text-xs text-muted-foreground">
                        {formatPercentage(Math.min(progress, 999.9))} target
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Tiada target Collection Daily</span>
                  )
                ) : null}
              </div>
              <dl className="grid grid-cols-3 gap-2 pl-7 text-xs">
                <div>
                  <dt className="text-muted-foreground">Rekod</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {row.totalRecords.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Purata</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {formatAmountRM(row.averagePerRecord)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Bahagian</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {formatPercentage(row.percentage)}
                  </dd>
                </div>
              </dl>
              {onSelectNickname ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-7 h-8"
                  onClick={() => onSelectNickname(row)}
                >
                  <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                  Lihat rekod
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
