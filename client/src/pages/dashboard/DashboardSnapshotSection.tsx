import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
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
      description="Core usage, access, import, and conflict signals grouped into one compact dashboard snapshot."
      badge={
        <Badge variant="outline" className="rounded-full px-3 py-1.5">
          {summaryCards.length} metrics
        </Badge>
      }
      contentClassName="space-y-0"
    >
      <DashboardSummaryCards items={summaryCards} summaryLoading={summaryLoading} />
    </OperationalSectionCard>
  );
}
