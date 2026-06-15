import {
  getCollectionNicknamePerformanceLabel,
  getCollectionNicknamePerformanceLevel,
  type CollectionNicknameSummaryChartDatum,
  type CollectionNicknameSummaryChartSort,
  type CollectionNicknamePerformanceLevel,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionNicknameSummaryMetricsProps = {
  detailed: boolean;
  peak: CollectionNicknameSummaryChartDatum | null;
  totalAmount: number;
  totalRecords: number;
};

type CollectionNicknameSummaryRankingTableProps = {
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
};

const PERFORMANCE_SYMBOL: Record<CollectionNicknamePerformanceLevel, string> = {
  high: "↑",
  medium: "•",
  low: "↓",
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

export function CollectionNicknamePerformanceLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground"
      aria-label="Panduan penanda prestasi"
    >
      <span className="font-medium text-foreground">Prestasi relatif:</span>
      <span className="inline-flex items-center gap-1.5">
        <CollectionNicknamePerformanceBadge level="high" />
        <span>sekurang-kurangnya 67% daripada kutipan tertinggi</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CollectionNicknamePerformanceBadge level="medium" />
        <span>34% hingga 66%</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CollectionNicknamePerformanceBadge level="low" />
        <span>di bawah 34%</span>
      </span>
    </div>
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
  peakAmount,
  rankedData,
  sortBy,
}: CollectionNicknameSummaryRankingTableProps) {
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
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="border-b border-border/70 text-left">
              <th scope="col" className="w-14 px-3 py-2.5 font-medium text-muted-foreground">#</th>
              <th scope="col" className="px-3 py-2.5 font-medium text-muted-foreground">Nickname</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-muted-foreground">Kutipan</th>
              <th scope="col" className="px-3 py-2.5 text-center font-medium text-muted-foreground">Prestasi</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-muted-foreground">Rekod</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-muted-foreground">Purata</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium text-muted-foreground">Bahagian</th>
            </tr>
          </thead>
          <tbody>
            {rankedData.map((row, index) => (
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
                <td className="whitespace-nowrap px-3 py-2.5 text-center">
                  <CollectionNicknamePerformanceBadge
                    level={getCollectionNicknamePerformanceLevel(row, peakAmount)}
                  />
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol
        className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 sm:hidden"
        aria-label="Nickname summary compact ranking"
      >
        {rankedData.map((row, index) => (
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
            <div className="pl-7">
              <CollectionNicknamePerformanceBadge
                level={getCollectionNicknamePerformanceLevel(row, peakAmount)}
              />
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
          </li>
        ))}
      </ol>
    </section>
  );
}
