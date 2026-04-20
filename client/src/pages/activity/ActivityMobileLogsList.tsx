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
import {
  ACTIVITY_MOBILE_LIST_MAX_HEIGHT_PX,
  ACTIVITY_MOBILE_ROW_HEIGHT_PX,
  applyActivityVirtualRowStyle,
  getVirtualizedListHeight,
} from "@/pages/activity/activity-virtualization";
import { ActivityMobileLogCard } from "@/pages/activity/ActivityMobileLogCard";
import { ActivityMobileSelectionSummary } from "@/pages/activity/ActivityMobileSelectionSummary";
import type { ActivityLogsTableProps } from "@/pages/activity/types";
import {
  parseActivityUserAgent,
} from "@/pages/activity/utils";

type ActivityMobileLogsListProps = Pick<
  ActivityLogsTableProps,
  | "actionLoading"
  | "activities"
  | "allVisibleSelected"
  | "canModerateActivity"
  | "onBanClick"
  | "onDeleteClick"
  | "onKickClick"
  | "onToggleSelected"
  | "onToggleSelectAllVisible"
  | "partiallySelected"
  | "selectedActivityIds"
>;

type ActivityMobileVirtualListData = ActivityMobileLogsListProps;

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

function ActivityMobileVirtualRow({
  data,
  index,
  style,
}: ListChildComponentProps<ActivityMobileVirtualListData>) {
  const {
    actionLoading,
    activities,
    canModerateActivity,
    onBanClick,
    onDeleteClick,
    onKickClick,
    onToggleSelected,
    selectedActivityIds,
  } = data;
  const activity = activities[index];

  if (!activity) {
    return null;
  }

  const { browser, version } = parseActivityUserAgent(activity.browser);
  const browserLabel = `${browser}${version ? ` ${version}` : ""}`;

  return (
    <ActivityPositionedRowShell positionStyle={style} className="box-border pb-3">
      <ActivityMobileLogCard
        actionLoading={actionLoading}
        activity={activity}
        browserLabel={browserLabel}
        canModerateActivity={canModerateActivity}
        onBanClick={onBanClick}
        onDeleteClick={onDeleteClick}
        onKickClick={onKickClick}
        onToggleSelected={onToggleSelected}
        position={{ index: index + 1, total: activities.length }}
        selected={selectedActivityIds.has(activity.id)}
      />
    </ActivityPositionedRowShell>
  );
}

export function ActivityMobileLogsList({
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
}: ActivityMobileLogsListProps) {
  const itemData = useMemo<ActivityMobileVirtualListData>(
    () => ({
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
    }),
    [
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
    ],
  );
  const listHeight = getVirtualizedListHeight(
    activities.length,
    ACTIVITY_MOBILE_ROW_HEIGHT_PX,
    ACTIVITY_MOBILE_LIST_MAX_HEIGHT_PX,
  );

  return (
    <div className="space-y-3">
      {canModerateActivity ? (
        <ActivityMobileSelectionSummary
          allVisibleSelected={allVisibleSelected}
          onToggleSelectAllVisible={onToggleSelectAllVisible}
          partiallySelected={partiallySelected}
          selectedCount={selectedActivityIds.size}
        />
      ) : null}
      <FixedSizeList
        className="rounded-2xl"
        height={listHeight}
        itemCount={activities.length}
        itemData={itemData}
        itemSize={ACTIVITY_MOBILE_ROW_HEIGHT_PX}
        overscanCount={4}
        width="100%"
      >
        {ActivityMobileVirtualRow}
      </FixedSizeList>
    </div>
  );
}
