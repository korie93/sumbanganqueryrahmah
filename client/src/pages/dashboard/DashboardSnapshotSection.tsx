import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { DashboardSectionError } from "@/pages/dashboard/DashboardSectionError";
import { DashboardSummaryCards } from "@/pages/dashboard/DashboardSummaryCards";
import type { DashboardAccessSignal, SummaryCardItem, SummaryData } from "@/pages/dashboard/types";
import { buildDashboardAccessSignals } from "@/pages/dashboard/utils";

type DashboardSnapshotSectionProps = {
  summary: SummaryData | undefined;
  summaryCards: SummaryCardItem[];
  summaryErrorMessage: string | null;
  summaryLoading: boolean;
  summaryRetrying: boolean;
  onRetrySummary: () => void;
};

function DashboardAccessWatchlist({ signals }: { signals: readonly DashboardAccessSignal[] }) {
  return (
    <section
      aria-label="Login access watchlist"
      className="dashboard-access-details"
      data-testid="dashboard-access-watchlist"
    >
      <h3 className="text-sm font-medium">Access watchlist</h3>
      <p className="sr-only">Login readiness at a glance</p>

      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {signals.map((signal) => (
          <div
            key={signal.title}
            className="min-w-0 text-xs"
          >
            <dt className="font-medium text-foreground">{signal.title}: {signal.value}</dt>
            <dd className="mt-1 leading-5 text-muted-foreground">{signal.description}</dd>
          </div>
        ))}
      </dl>
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
      description="Core access metrics and operational context."
      contentClassName="space-y-4"
      className="dashboard-snapshot"
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
          <DashboardSummaryCards items={summaryCards} summaryLoading={summaryLoading} />
          <DashboardAccessWatchlist signals={accessSignals} />
        </>
      )}
    </OperationalSectionCard>
  );
}
