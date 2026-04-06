import { ActivityDesktopLogsHeader } from "@/pages/activity/ActivityDesktopLogsHeader";
import { ActivityDesktopLogRow } from "@/pages/activity/ActivityDesktopLogRow";
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
  return (
    <div className="max-h-[400px] overflow-y-auto">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <ActivityDesktopLogsHeader
            allVisibleSelected={allVisibleSelected}
            canModerateActivity={canModerateActivity}
            onToggleSelectAllVisible={onToggleSelectAllVisible}
            partiallySelected={partiallySelected}
          />
          <tbody>
            {activities.map((activity) => (
              <ActivityDesktopLogRow
                key={activity.id}
                actionLoading={actionLoading}
                activity={activity}
                canModerateActivity={canModerateActivity}
                isSelected={selectedActivityIds.has(activity.id)}
                onBanClick={onBanClick}
                onDeleteClick={onDeleteClick}
                onKickClick={onKickClick}
                onToggleSelected={onToggleSelected}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
