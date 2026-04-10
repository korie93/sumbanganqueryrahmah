import { useMemo } from "react";
import type { ListChildComponentProps } from "react-window";
import { FixedSizeList } from "react-window";
import { Shield, Trash2, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ACTIVITY_MOBILE_LIST_MAX_HEIGHT_PX,
  ACTIVITY_MOBILE_ROW_HEIGHT_PX,
  getVirtualizedListHeight,
} from "@/pages/activity/activity-virtualization";
import type { ActivityLogsTableProps } from "@/pages/activity/types";
import {
  formatActivityTime,
  getSessionDuration,
  getStatusBadge,
  parseActivityUserAgent,
} from "@/pages/activity/utils";
import { getActivitySelectionCountLabel } from "@/pages/activity/activity-logs-table-utils";

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
    <div style={style} className="box-border pb-3">
      <div
        className="flex h-full flex-col space-y-3 rounded-2xl border border-border/70 bg-card/80 p-3.5 shadow-xs"
        data-testid={`activity-row-${activity.id}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex items-start gap-2">
              {canModerateActivity ? (
                <Checkbox
                  checked={selectedActivityIds.has(activity.id)}
                  onCheckedChange={(checked) => onToggleSelected(activity.id, Boolean(checked))}
                  aria-label={`Select activity log ${activity.id}`}
                  className="mt-0.5"
                />
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{activity.username}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-[11px]">
                    {activity.role}
                  </Badge>
                  {getStatusBadge(activity.status)}
                </div>
              </div>
            </div>
          </div>
          <div className="shrink-0 rounded-full border border-border/60 bg-background/75 px-2.5 py-1 text-[11px] text-muted-foreground">
            {getSessionDuration(activity.loginTime, activity.logoutTime)}
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">IP Address</p>
            <p className="truncate text-foreground/90" title={activity.ipAddress || "-"}>
              {activity.ipAddress || "-"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Browser</p>
            <p className="truncate text-foreground/90" title={browserLabel}>
              {browserLabel}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Login</p>
            <p className="text-foreground/90">{formatActivityTime(activity.loginTime)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Logout</p>
            <p className="text-foreground/90">
              {activity.logoutTime ? formatActivityTime(activity.logoutTime) : "-"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Session Duration</p>
            <p className="text-foreground/90">{getSessionDuration(activity.loginTime, activity.logoutTime)}</p>
          </div>
        </div>

        {canModerateActivity ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {activity.isActive ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onKickClick(activity)}
                  disabled={actionLoading === activity.id}
                  className="w-full"
                  data-testid={`button-kick-${activity.id}`}
                >
                  <UserX className="mr-2 h-4 w-4" />
                  Force Logout
                </Button>
                {activity.role !== "superuser" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onBanClick(activity)}
                    disabled={actionLoading === activity.id}
                    className="w-full text-destructive"
                    data-testid={`button-ban-${activity.id}`}
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Ban
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDeleteClick(activity)}
              disabled={actionLoading === activity.id}
              className="w-full text-destructive"
              data-testid={`button-delete-${activity.id}`}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </div>
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
        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Select visible logs</p>
            <p className="text-xs text-muted-foreground">
              {getActivitySelectionCountLabel(selectedActivityIds.size)}
            </p>
          </div>
          <Checkbox
            checked={allVisibleSelected || (partiallySelected ? "indeterminate" : false)}
            onCheckedChange={(checked) => onToggleSelectAllVisible(Boolean(checked))}
            aria-label="Select all visible activity logs"
          />
        </div>
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
