import { AlertTriangle, History } from "lucide-react";
import {
  formatCollectionNicknameTargetMonth,
  formatCollectionNicknameTargetUpdatedAt,
} from "@/pages/collection-nickname-summary/collection-nickname-target-audit";
import {
  isCollectionNicknameTargetBenchmarkComplete,
  type CollectionNicknameTargetBenchmark,
} from "@/pages/collection-nickname-summary/collection-nickname-target-benchmarks";
import { formatAmountRM } from "@/pages/collection/utils";

export function CollectionNicknameTargetAuditPanel({
  benchmark,
}: {
  benchmark: CollectionNicknameTargetBenchmark;
}) {
  const complete = isCollectionNicknameTargetBenchmarkComplete(benchmark);
  const missingMonthCount = Math.max(
    benchmark.missingMonths,
    benchmark.requestedMonths - benchmark.configuredMonths,
  );

  return (
    <section
      className="rounded-lg border border-border/60 bg-background p-3"
      aria-labelledby="nickname-target-audit-title"
    >
      <div className="flex items-start gap-2">
        <History className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id="nickname-target-audit-title" className="text-sm font-semibold text-foreground">
            Audit target
          </h3>
          <p className="text-xs leading-5 text-muted-foreground">
            {benchmark.latestUpdatedBy
              ? `Terakhir dikemas kini oleh ${benchmark.latestUpdatedBy} pada ${formatCollectionNicknameTargetUpdatedAt(benchmark.latestUpdatedAt)}.`
              : "Maklumat pengemaskinian terakhir tidak direkodkan."}
          </p>
        </div>
      </div>

      {!complete ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
          <span>
            Target tidak lengkap: {missingMonthCount} daripada {benchmark.requestedMonths} bulan belum ditetapkan.
            Prestasi target tidak dinilai sehingga semua bulan lengkap.
          </span>
        </div>
      ) : null}

      {benchmark.months.length > 0 ? (
        <ul className="mt-3 divide-y divide-border/60 rounded-md border border-border/60">
          {benchmark.months.map((month) => (
            <li key={month.month} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-xs">
              <div>
                <p className="font-medium text-foreground">
                  {formatCollectionNicknameTargetMonth(month.month)}
                </p>
                <p className="text-muted-foreground">
                  {month.configured
                    ? `${month.updatedBy || "Pengguna tidak direkodkan"} - ${formatCollectionNicknameTargetUpdatedAt(month.updatedAt)}`
                    : "Belum ditetapkan"}
                </p>
              </div>
              <span className="font-semibold text-foreground">
                {month.configured ? formatAmountRM(month.amount) : "Tiada target"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
