import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { DashboardSummaryCards } from "@/pages/dashboard/DashboardSummaryCards";
import type { SummaryCardItem } from "@/pages/dashboard/types";

type DashboardSnapshotSectionProps = {
  summaryCards: SummaryCardItem[];
  summaryLoading: boolean;
};

export function DashboardSnapshotSection({
  summaryCards,
  summaryLoading,
}: DashboardSnapshotSectionProps) {
  return (
    <OperationalSectionCard
      title="Quick Snapshot"
      description="Core user, session, import, and conflict counts in a shared admin summary strip."
      contentClassName="space-y-0"
    >
      <DashboardSummaryCards items={summaryCards} summaryLoading={summaryLoading} />
    </OperationalSectionCard>
  );
}
