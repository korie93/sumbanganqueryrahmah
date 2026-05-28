import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { DashboardSectionError } from "@/pages/dashboard/DashboardSectionError";
import { DashboardSummaryCards } from "@/pages/dashboard/DashboardSummaryCards";
import type { SummaryCardItem } from "@/pages/dashboard/types";

type DashboardSnapshotSectionProps = {
  summaryCards: SummaryCardItem[];
  summaryErrorMessage: string | null;
  summaryLoading: boolean;
  summaryRetrying: boolean;
  onRetrySummary: () => void;
};

export function DashboardSnapshotSection({
  summaryCards,
  summaryErrorMessage,
  summaryLoading,
  summaryRetrying,
  onRetrySummary,
}: DashboardSnapshotSectionProps) {
  return (
    <OperationalSectionCard
      title="Quick Snapshot"
      description="Core usage, access, import, and conflict signals grouped into one compact dashboard snapshot."
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
        <DashboardSummaryCards items={summaryCards} summaryLoading={summaryLoading} />
      )}
    </OperationalSectionCard>
  );
}
