import { ShieldCheck } from "lucide-react";
import { MonthlyComparisonHint } from "./MonthlyComparisonHint";
import type { CollectionMonthlyComparisonDataQualitySummary } from "./collection-monthly-comparison-utils";

type CollectionMonthlyComparisonDataQualityCardProps = {
  dataQualitySummary: CollectionMonthlyComparisonDataQualitySummary | null;
};

export function CollectionMonthlyComparisonDataQualityCard({
  dataQualitySummary,
}: CollectionMonthlyComparisonDataQualityCardProps) {
  if (!dataQualitySummary) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm sm:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
              Data quality
            </p>
            <MonthlyComparisonHint
              label="Data quality explanation"
              text="Checks target availability, anomaly months, empty months, unusually low record volume, and current-month projection risk."
            />
          </div>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {dataQualitySummary.statusLabel}
          </p>
        </div>
        <span
          className={
            dataQualitySummary.statusTone === "success"
              ? "shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
              : dataQualitySummary.statusTone === "danger"
                ? "shrink-0 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
                : "shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
          }
        >
          {dataQualitySummary.warningCount} review
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {dataQualitySummary.signals.slice(0, 4).map((signal) => (
          <div
            key={signal.id}
            className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2"
          >
            <p className="text-xs font-medium text-foreground">{signal.label}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{signal.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
