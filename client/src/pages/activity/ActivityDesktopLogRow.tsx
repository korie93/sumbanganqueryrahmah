import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
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
  gridClassName,
  isSelected,
  onBanClick,
  onDeleteClick,
  onKickClick,
  onToggleSelected,
}: ActivityDesktopLogRowProps) {
  const browserInfo = parseActivityUserAgent(activity.browser);

  return (
    <div
      className={cn(
        "grid h-full items-center gap-3 border-b border-border/70 px-3 py-3 hover:bg-muted/50",
        gridClassName,
      )}
      data-testid={`activity-row-${activity.id}`}
    >
      {canModerateActivity ? (
        <div className="flex items-center">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggleSelected(activity.id, Boolean(checked))}
            aria-label={`Select activity log ${activity.id}`}
          />
        </div>
      ) : null}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">{activity.username}</span>
          <Badge variant="outline" className="text-xs">
            {activity.role}
          </Badge>
        </div>
      </div>
      <div>{getStatusBadge(activity.status)}</div>
      <div className="truncate text-xs text-muted-foreground" title={activity.ipAddress || "-"}>
        {activity.ipAddress || "-"}
      </div>
      <div className="truncate text-xs text-muted-foreground" title={getActivityBrowserText(browserInfo)}>
        {getActivityBrowserText(browserInfo)}
      </div>
      <div className="text-xs text-muted-foreground">{formatActivityTime(activity.loginTime)}</div>
      <div className="text-xs text-muted-foreground">
        {activity.logoutTime ? formatActivityTime(activity.logoutTime) : "-"}
      </div>
      <div className="text-xs text-muted-foreground">{getSessionDuration(activity.loginTime, activity.logoutTime)}</div>
      {canModerateActivity ? (
        <div>
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
