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
    <section aria-label="Live activity snapshot" className="space-y-3 border-y border-border py-3">
      <h2 className="text-base font-semibold">Live status</h2>
      <ActivitySummaryCards
        bannedCount={bannedCount}
        className="mb-0"
        idleCount={summaryCounts.idleCount}
        kickedCount={summaryCounts.kickedCount}
        logoutCount={summaryCounts.logoutCount}
        onlineCount={summaryCounts.onlineCount}
      />
    </section>
  );
}
