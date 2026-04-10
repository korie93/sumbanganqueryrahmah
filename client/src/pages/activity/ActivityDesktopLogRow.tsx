import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ActivityDesktopLogActions } from "@/pages/activity/ActivityDesktopLogActions";
import { getActivityBrowserText } from "@/pages/activity/activity-desktop-logs-utils";
import type { ActivityDesktopLogRowProps } from "@/pages/activity/activity-desktop-logs-shared";
import {
  formatActivityTime,
  getSessionDuration,
  getStatusBadge,
  parseActivityUserAgent,
} from "@/pages/activity/utils";

export function ActivityDesktopLogRow({
  actionLoading,
  activity,
  canModerateActivity,
  gridTemplateColumns,
  isSelected,
  onBanClick,
  onDeleteClick,
  onKickClick,
  onToggleSelected,
  style,
}: ActivityDesktopLogRowProps) {
  const browserInfo = parseActivityUserAgent(activity.browser);

  return (
    <div
      className="grid items-center gap-3 border-b border-border/70 px-3 py-3 hover:bg-muted/50"
      data-testid={`activity-row-${activity.id}`}
      role="row"
      style={{ ...style, gridTemplateColumns }}
    >
      {canModerateActivity ? (
        <div className="flex items-center" role="cell">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggleSelected(activity.id, Boolean(checked))}
            aria-label={`Select activity log ${activity.id}`}
          />
        </div>
      ) : null}
      <div className="min-w-0" role="cell">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">{activity.username}</span>
          <Badge variant="outline" className="text-xs">
            {activity.role}
          </Badge>
        </div>
      </div>
      <div role="cell">{getStatusBadge(activity.status)}</div>
      <div className="truncate text-xs text-muted-foreground" role="cell" title={activity.ipAddress || "-"}>
        {activity.ipAddress || "-"}
      </div>
      <div
        className="truncate text-xs text-muted-foreground"
        role="cell"
        title={getActivityBrowserText(browserInfo)}
      >
        {getActivityBrowserText(browserInfo)}
      </div>
      <div className="text-xs text-muted-foreground" role="cell">
        {formatActivityTime(activity.loginTime)}
      </div>
      <div className="text-xs text-muted-foreground" role="cell">
        {activity.logoutTime ? formatActivityTime(activity.logoutTime) : "-"}
      </div>
      <div className="text-xs text-muted-foreground" role="cell">
        {getSessionDuration(activity.loginTime, activity.logoutTime)}
      </div>
      {canModerateActivity ? (
        <div role="cell">
          <ActivityDesktopLogActions
            actionLoading={actionLoading}
            activity={activity}
            onBanClick={onBanClick}
            onDeleteClick={onDeleteClick}
            onKickClick={onKickClick}
          />
        </div>
      ) : null}
    </div>
  );
}
