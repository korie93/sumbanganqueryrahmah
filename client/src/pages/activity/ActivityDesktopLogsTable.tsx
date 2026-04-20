import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { ListChildComponentProps } from "react-window";
import { FixedSizeList } from "react-window";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { ActivityDesktopLogsHeader } from "@/pages/activity/ActivityDesktopLogsHeader";
import { ActivityDesktopLogRow } from "@/pages/activity/ActivityDesktopLogRow";
import {
  ACTIVITY_DESKTOP_LIST_MAX_HEIGHT_PX,
  ACTIVITY_DESKTOP_ROW_HEIGHT_PX,
  applyActivityVirtualRowStyle,
  getActivityDesktopGridClassName,
  getVirtualizedListHeight,
  shouldVirtualizeActivityDesktopLogs,
} from "@/pages/activity/activity-virtualization";
import type { ActivityDesktopLogsTableProps } from "@/pages/activity/activity-desktop-logs-shared";

type ActivityDesktopVirtualListData = ActivityDesktopLogsTableProps & {
  gridClassName: string;
};

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const ActivityPositionedRowShell = memo(function ActivityPositionedRowShell({
  positionStyle,
  className,
  children,
}: {
  positionStyle: CSSProperties;
  className: string;
  children: ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);

  useClientLayoutEffect(() => {
    const node = shellRef.current;
    if (!node) {
      return;
    }

    applyActivityVirtualRowStyle(node.style, positionStyle);
  }, [positionStyle]);

  return <div ref={shellRef} className={className}>{children}</div>;
});

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
    <ActivityPositionedRowShell positionStyle={style} className="box-border">
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
        position={{ index: index + 1, total: data.activities.length }}
      />
    </ActivityPositionedRowShell>
  );
}

export const ActivityDesktopLogsTable = memo(function ActivityDesktopLogsTable({
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
  const shouldVirtualize = shouldVirtualizeActivityDesktopLogs(activities.length);
  const listHeight = getVirtualizedListHeight(
    activities.length,
    ACTIVITY_DESKTOP_ROW_HEIGHT_PX,
    ACTIVITY_DESKTOP_LIST_MAX_HEIGHT_PX,
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
        <div className={shouldVirtualize ? "overflow-hidden" : "max-h-[360px] overflow-y-auto"}>
          {shouldVirtualize ? (
            <FixedSizeList
              className="rounded-b-lg"
              height={listHeight}
              itemCount={activities.length}
              itemData={itemData}
              itemSize={ACTIVITY_DESKTOP_ROW_HEIGHT_PX}
              overscanCount={5}
              width="100%"
            >
              {ActivityDesktopVirtualRow}
            </FixedSizeList>
          ) : (
            activities.map((activity, index) => (
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
                position={{ index: index + 1, total: activities.length }}
              />
            ))
          )}
        </div>
      </div>
    </HorizontalScrollHint>
  );
});
