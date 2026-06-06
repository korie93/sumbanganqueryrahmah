import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { DashboardSectionError } from "@/pages/dashboard/DashboardSectionError";
import { DashboardSummaryCards } from "@/pages/dashboard/DashboardSummaryCards";
import type { DashboardAccessSignal, DashboardAccessSignalTone, SummaryCardItem, SummaryData } from "@/pages/dashboard/types";
import { buildDashboardAccessSignals } from "@/pages/dashboard/utils";

type DashboardSnapshotSectionProps = {
  summary: SummaryData | undefined;
  summaryCards: SummaryCardItem[];
  summaryErrorMessage: string | null;
  summaryLoading: boolean;
  summaryRetrying: boolean;
  onRetrySummary: () => void;
};

function getAccessSignalToneClassName(tone: DashboardAccessSignalTone) {
  if (tone === "danger") {
    return "border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-200";
  }

  if (tone === "warning") {
    return "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-200";
  }

  if (tone === "success") {
    return "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
  }

  return "border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-200";
}

function DashboardAccessWatchlist({ signals }: { signals: readonly DashboardAccessSignal[] }) {
  return (
    <section
      aria-label="Login access watchlist"
      className="rounded-2xl border border-border/60 bg-muted/20 p-4"
      data-testid="dashboard-access-watchlist"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-label-md text-muted-foreground">
            Access watchlist
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">Login readiness at a glance</h3>
        </div>
        <p className="text-xs leading-5 text-muted-foreground sm:max-w-md sm:text-right">
          Ringkasan cepat untuk sesi aktif, login berjaya, cubaan gagal, dan akaun yang disekat.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {signals.map((signal) => (
          <article
            key={signal.title}
            className={`rounded-xl border p-3 ${getAccessSignalToneClassName(signal.tone)}`}
          >
            <p className="text-xs font-semibold uppercase tracking-label-md opacity-80">{signal.title}</p>
            <p className="mt-2 text-2xl font-bold leading-none">{signal.value}</p>
            <p className="mt-2 text-xs leading-5 opacity-85">{signal.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DashboardSnapshotSection({
  summary,
  summaryCards,
  summaryErrorMessage,
  summaryLoading,
  summaryRetrying,
  onRetrySummary,
}: DashboardSnapshotSectionProps) {
  const accessSignals = buildDashboardAccessSignals(summary);

  return (
    <OperationalSectionCard
      title="Login Snapshot"
      description="Access, session, account risk, import, and conflict signals grouped for fast operator review."
      badge={
        <Badge variant="outline" className="rounded-full px-3 py-1.5">
          {summaryCards.length} metrics
        </Badge>
      }
      contentClassName="space-y-0"
    >
      {summaryErrorMessage ? (
        <DashboardSectionError
          title="Ringkasan dashboard gagal dimuat"
          description={summaryErrorMessage}
          onRetry={onRetrySummary}
          retrying={summaryRetrying}
          minHeightClassName="min-h-[220px]"
        />
      ) : (
        <>
          <DashboardAccessWatchlist signals={accessSignals} />
          <DashboardSummaryCards items={summaryCards} summaryLoading={summaryLoading} />
        </>
      )}
    </OperationalSectionCard>
  );
}
