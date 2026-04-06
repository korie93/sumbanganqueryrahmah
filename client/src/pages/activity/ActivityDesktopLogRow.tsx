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
  isSelected,
  onBanClick,
  onDeleteClick,
  onKickClick,
  onToggleSelected,
}: ActivityDesktopLogRowProps) {
  const browserInfo = parseActivityUserAgent(activity.browser);

  return (
    <tr
      className="border-t border-border hover:bg-muted/50"
      data-testid={`activity-row-${activity.id}`}
    >
      {canModerateActivity ? (
        <td className="p-3 align-top">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggleSelected(activity.id, Boolean(checked))}
            aria-label={`Select activity log ${activity.id}`}
          />
        </td>
      ) : null}
      <td className="p-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{activity.username}</span>
          <Badge variant="outline" className="text-xs">
            {activity.role}
          </Badge>
        </div>
      </td>
      <td className="p-3">{getStatusBadge(activity.status)}</td>
      <td className="p-3 text-muted-foreground text-xs">{activity.ipAddress || "-"}</td>
      <td className="p-3 text-muted-foreground text-xs">{getActivityBrowserText(browserInfo)}</td>
      <td className="p-3 text-muted-foreground text-xs">{formatActivityTime(activity.loginTime)}</td>
      <td className="p-3 text-muted-foreground text-xs">
        {activity.logoutTime ? formatActivityTime(activity.logoutTime) : "-"}
      </td>
      <td className="p-3 text-muted-foreground text-xs">
        {getSessionDuration(activity.loginTime, activity.logoutTime)}
      </td>
      {canModerateActivity ? (
        <td className="p-3">
          <ActivityDesktopLogActions
            actionLoading={actionLoading}
            activity={activity}
            onBanClick={onBanClick}
            onDeleteClick={onDeleteClick}
            onKickClick={onKickClick}
          />
        </td>
      ) : null}
    </tr>
  );
}
