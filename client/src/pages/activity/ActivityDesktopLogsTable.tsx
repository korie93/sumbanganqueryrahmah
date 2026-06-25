import { useMemo } from "react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { ActivityDesktopLogsHeader } from "@/pages/activity/ActivityDesktopLogsHeader";
import { ActivityDesktopLogRow } from "@/pages/activity/ActivityDesktopLogRow";
import {
  getActivityDesktopGridClassName,
  getActivityDesktopTableWidthClassName,
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
  onInvestigateClick,
  onToggleSelected,
  onToggleSelectAllVisible,
  partiallySelected,
  selectedActivityIds,
}: ActivityDesktopLogsTableProps) {
  const gridClassName = useMemo(
    () => getActivityDesktopGridClassName(canModerateActivity),
    [canModerateActivity],
  );
  const tableWidthClassName = useMemo(
    () => getActivityDesktopTableWidthClassName(canModerateActivity),
    [canModerateActivity],
  );

  return (
    <HorizontalScrollHint
      ariaLabel="Activity log columns"
      hint="Scroll table"
      showScrollbar
      viewportClassName="overscroll-x-contain pb-2"
    >
      <div
        className={`w-full rounded-lg border border-border bg-card/60 text-sm ${tableWidthClassName}`}
      >
        <div className="max-h-[408px] overflow-y-auto [scrollbar-gutter:stable]">
          <ActivityDesktopLogsHeader
            allVisibleSelected={allVisibleSelected}
            canModerateActivity={canModerateActivity}
            gridClassName={gridClassName}
            onToggleSelectAllVisible={onToggleSelectAllVisible}
            partiallySelected={partiallySelected}
          />
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
              onInvestigateClick={onInvestigateClick}
              onToggleSelected={onToggleSelected}
            />
          ))}
        </div>
      </div>
    </HorizontalScrollHint>
  );
}
