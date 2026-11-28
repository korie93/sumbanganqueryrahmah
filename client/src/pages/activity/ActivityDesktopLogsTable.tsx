import { useMemo } from "react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { ActivityDesktopLogsHeader } from "@/pages/activity/ActivityDesktopLogsHeader";
import { ActivityDesktopLogRow } from "@/pages/activity/ActivityDesktopLogRow";
import {
  getActivityGridTemplateColumns,
  getActivityTableMinWidth,
  getVisibleActivityColumns,
} from "@/pages/activity/activity-column-preferences";
import type { ActivityDesktopLogsTableProps } from "@/pages/activity/activity-desktop-logs-shared";
import "./ActivityDesktopLogsTable.css";

export function ActivityDesktopLogsTable({
  actionLoading,
  activities,
  allVisibleSelected,
  canModerateActivity,
  columnPreferences,
  density,
  onBanClick,
  onDeleteClick,
  onKickClick,
  onInvestigateClick,
  onToggleSelected,
  onToggleSelectAllVisible,
  partiallySelected,
  selectedActivityIds,
}: ActivityDesktopLogsTableProps) {
  const columns = useMemo(
    () => getVisibleActivityColumns(columnPreferences),
    [columnPreferences],
  );
  const gridTemplateColumns = useMemo(
    () => getActivityGridTemplateColumns(columns, canModerateActivity),
    [canModerateActivity, columns],
  );
  const tableMinWidth = useMemo(
    () => getActivityTableMinWidth(columns, canModerateActivity),
    [canModerateActivity, columns],
  );

  return (
    <HorizontalScrollHint
      ariaLabel="Activity log columns"
      navigationLabel="Activity table column navigation"
      showNavigationControls
      framedTable
      viewportClassName="activity-log-viewport overscroll-x-contain"
    >
      <div
        role="table"
        aria-colcount={columns.length + (canModerateActivity ? 2 : 0)}
        aria-rowcount={activities.length + 1}
        className="w-full text-sm"
        data-density={density}
        style={{ minWidth: `${tableMinWidth}px` }}
      >
        <ActivityDesktopLogsHeader
          allVisibleSelected={allVisibleSelected}
          canModerateActivity={canModerateActivity}
          columns={columns}
          gridTemplateColumns={gridTemplateColumns}
          onToggleSelectAllVisible={onToggleSelectAllVisible}
          partiallySelected={partiallySelected}
        />
        {activities.map((activity) => (
          <ActivityDesktopLogRow
            key={activity.id}
            actionLoading={actionLoading}
            activity={activity}
            canModerateActivity={canModerateActivity}
            columns={columns}
            density={density}
            gridTemplateColumns={gridTemplateColumns}
            isSelected={selectedActivityIds.has(activity.id)}
            onBanClick={onBanClick}
            onDeleteClick={onDeleteClick}
            onKickClick={onKickClick}
            onInvestigateClick={onInvestigateClick}
            onToggleSelected={onToggleSelected}
          />
        ))}
      </div>
    </HorizontalScrollHint>
  );
}
