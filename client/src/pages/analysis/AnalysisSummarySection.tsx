import {
  OperationalMetric,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import type { AnalysisSnapshotItem } from "@/pages/analysis/analysis-shell-utils";

type AnalysisSummarySectionProps = {
  snapshotItems: AnalysisSnapshotItem[];
};

export function AnalysisSummarySection({ snapshotItems }: AnalysisSummarySectionProps) {
  return (
    <OperationalSectionCard
      title="Quick Snapshot"
      description="Scope, row volume, duplicate pressure, and special ID totals in the shared admin summary pattern."
      contentClassName="space-y-0"
    >
      <OperationalSummaryStrip className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {snapshotItems.map((item) => (
          <OperationalMetric
            key={item.label}
            label={item.label}
            value={item.value}
            supporting={item.supporting}
            tone={item.tone}
          />
        ))}
      </OperationalSummaryStrip>
    </OperationalSectionCard>
  );
}
