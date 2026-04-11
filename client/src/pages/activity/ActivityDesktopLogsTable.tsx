import { useMemo } from "react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { ActivityDesktopLogsHeader } from "@/pages/activity/ActivityDesktopLogsHeader";
import { ActivityDesktopLogRow } from "@/pages/activity/ActivityDesktopLogRow";
import {
  getActivityDesktopGridClassName,
} from "@/pages/activity/activity-virtualization";
import type { ActivityDesktopLogsTableProps } from "@/pages/activity/activity-desktop-logs-shared";

export function ActivityDesktopLogsTable({
  actionLoading,
  activities,
  allVisibleSelected,
  canModerateActivity,
  onBanClick,
  onDeleteClick,
  onKickClick,
  onToggleSelected,
  onToggleSelectAllVisible,
  partiallySelected,
  selectedActivityIds,
}: ActivityDesktopLogsTableProps) {
  const gridClassName = useMemo(
    () => getActivityDesktopGridClassName(canModerateActivity),
    [canModerateActivity],
  );

  return (
    <HorizontalScrollHint hint="Scroll table">
      <div className="min-w-[58rem] overflow-hidden rounded-lg border border-border bg-card/60 text-sm">
        <ActivityDesktopLogsHeader
          allVisibleSelected={allVisibleSelected}
          canModerateActivity={canModerateActivity}
          gridClassName={gridClassName}
          onToggleSelectAllVisible={onToggleSelectAllVisible}
          partiallySelected={partiallySelected}
        />
        <div className="max-h-[360px] overflow-y-auto">
          {activities.map((activity) => (
            <ActivityDesktopLogRow
              key={activity.id}
              actionLoading={actionLoading}
              activity={activity}
              canModerateActivity={canModerateActivity}
              gridClassName={gridClassName}
              isSelected={selectedActivityIds.has(activity.id)}
              onBanClick={onBanClick}
              onDeleteClick={onDeleteClick}
              onKickClick={onKickClick}
              onToggleSelected={onToggleSelected}
            />
          ))}
        </div>
      </div>
    </HorizontalScrollHint>
  );
}
