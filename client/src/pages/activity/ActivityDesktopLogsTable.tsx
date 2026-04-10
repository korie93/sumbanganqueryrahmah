import { useMemo } from "react";
import type { ListChildComponentProps } from "react-window";
import { FixedSizeList } from "react-window";
import { ActivityDesktopLogsHeader } from "@/pages/activity/ActivityDesktopLogsHeader";
import { ActivityDesktopLogRow } from "@/pages/activity/ActivityDesktopLogRow";
import {
  getActivityDesktopGridClassName,
  ACTIVITY_DESKTOP_LIST_MAX_HEIGHT_PX,
  ACTIVITY_DESKTOP_ROW_HEIGHT_PX,
  getVirtualizedListHeight,
} from "@/pages/activity/activity-virtualization";
import type { ActivityDesktopLogsTableProps } from "@/pages/activity/activity-desktop-logs-shared";

type ActivityDesktopVirtualListData = ActivityDesktopLogsTableProps & {
  gridClassName: string;
};

function ActivityDesktopVirtualRow({
  data,
  index,
  style,
}: ListChildComponentProps<ActivityDesktopVirtualListData>) {
  const activity = data.activities[index];

  if (!activity) {
    return null;
  }

  return (
    <div style={style}>
      <ActivityDesktopLogRow
        actionLoading={data.actionLoading}
        activity={activity}
        canModerateActivity={data.canModerateActivity}
        gridClassName={data.gridClassName}
        isSelected={data.selectedActivityIds.has(activity.id)}
        onBanClick={data.onBanClick}
        onDeleteClick={data.onDeleteClick}
        onKickClick={data.onKickClick}
        onToggleSelected={data.onToggleSelected}
      />
    </div>
  );
}

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
  const itemData = useMemo<ActivityDesktopVirtualListData>(
    () => ({
      actionLoading,
      activities,
      allVisibleSelected,
      canModerateActivity,
      gridClassName,
      onBanClick,
      onDeleteClick,
      onKickClick,
      onToggleSelected,
      onToggleSelectAllVisible,
      partiallySelected,
      selectedActivityIds,
    }),
    [
      actionLoading,
      activities,
      allVisibleSelected,
      canModerateActivity,
      gridClassName,
      onBanClick,
      onDeleteClick,
      onKickClick,
      onToggleSelected,
      onToggleSelectAllVisible,
      partiallySelected,
      selectedActivityIds,
    ],
  );
  const listHeight = getVirtualizedListHeight(
    activities.length,
    ACTIVITY_DESKTOP_ROW_HEIGHT_PX,
    ACTIVITY_DESKTOP_LIST_MAX_HEIGHT_PX,
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[58rem] overflow-hidden rounded-lg border border-border bg-card/60 text-sm">
        <ActivityDesktopLogsHeader
          allVisibleSelected={allVisibleSelected}
          canModerateActivity={canModerateActivity}
          gridClassName={gridClassName}
          onToggleSelectAllVisible={onToggleSelectAllVisible}
          partiallySelected={partiallySelected}
        />
        <FixedSizeList
          height={listHeight}
          itemCount={activities.length}
          itemData={itemData}
          itemSize={ACTIVITY_DESKTOP_ROW_HEIGHT_PX}
          overscanCount={8}
          width="100%"
        >
          {ActivityDesktopVirtualRow}
        </FixedSizeList>
      </div>
    </div>
  );
}
