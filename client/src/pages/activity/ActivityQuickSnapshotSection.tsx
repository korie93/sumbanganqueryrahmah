import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { ActivitySummaryCards } from "@/pages/activity/ActivitySummaryCards";
import type { ActivitySummaryCounts } from "@/pages/activity/activity-page-content-shared";

type ActivityQuickSnapshotSectionProps = {
  bannedCount: number;
  summaryCounts: ActivitySummaryCounts;
};

export function ActivityQuickSnapshotSection({
  bannedCount,
  summaryCounts,
}: ActivityQuickSnapshotSectionProps) {
  return (
    <OperationalSectionCard
      title="Quick Snapshot"
      description="Live user presence, idle sessions, forced exits, and banned accounts in one shared admin summary strip."
      contentClassName="space-y-0"
    >
      <ActivitySummaryCards
        bannedCount={bannedCount}
        className="mb-0"
        idleCount={summaryCounts.idleCount}
        kickedCount={summaryCounts.kickedCount}
        logoutCount={summaryCounts.logoutCount}
        onlineCount={summaryCounts.onlineCount}
      />
    </OperationalSectionCard>
  );
}
