import {
  OperationalMetric,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import type { AnalysisSnapshotItem } from "@/pages/analysis/analysis-shell-utils";

type AnalysisSummarySectionProps = {
  snapshotItems: AnalysisSnapshotItem[];
};

export function AnalysisSummarySection({ snapshotItems }: AnalysisSummarySectionProps) {
  return (
    <section aria-labelledby="analysis-snapshot-heading" className="space-y-3">
      <h2 id="analysis-snapshot-heading" className="text-lg font-semibold">Quick Snapshot</h2>
      <OperationalSummaryStrip className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
    </section>
  );
}
