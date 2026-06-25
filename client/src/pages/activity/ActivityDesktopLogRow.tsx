import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ActivityDesktopLogActions } from "@/pages/activity/ActivityDesktopLogActions";
import type { ActivityColumnId } from "@/pages/activity/activity-column-preferences";
import { buildActivityRowAriaLabel } from "@/pages/activity/activity-row-aria";
import { getActivityBrowserText } from "@/pages/activity/activity-desktop-logs-utils";
import { getActivityDeviceLabel } from "@/pages/activity/activity-device-utils";
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
  columns,
  density,
  gridTemplateColumns,
  isSelected,
  onBanClick,
  onDeleteClick,
  onKickClick,
  onInvestigateClick,
  onToggleSelected,
}: ActivityDesktopLogRowProps) {
  const browserInfo = parseActivityUserAgent(activity.browser);
  const browserLabel = getActivityBrowserText(browserInfo);
  const deviceLabel = getActivityDeviceLabel(activity);
  const renderColumn = (column: ActivityColumnId) => {
    switch (column) {
      case "user":
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="truncate font-medium text-foreground"
                title={activity.username}
                aria-label={activity.username}
              >
                {activity.username}
              </span>
              <Badge variant="outline" className="text-xs">
                {activity.role}
              </Badge>
            </div>
          </div>
        );
      case "status":
        return <div>{getStatusBadge(activity.status)}</div>;
      case "ip":
        return (
          <div className="truncate text-xs text-muted-foreground" title={activity.ipAddress || "-"}>
            {activity.ipAddress || "-"}
          </div>
        );
      case "device":
        return (
          <div className="truncate text-xs text-muted-foreground" title={deviceLabel}>
            {deviceLabel}
          </div>
        );
      case "browser":
        return (
          <div className="truncate text-xs text-muted-foreground" title={browserLabel}>
            {browserLabel}
          </div>
        );
      case "login":
        return <div className="text-xs text-muted-foreground">{formatActivityTime(activity.loginTime)}</div>;
      case "logout":
        return (
          <div className="text-xs text-muted-foreground">
            {activity.logoutTime ? formatActivityTime(activity.logoutTime) : "-"}
          </div>
        );
      case "duration":
        return (
          <div className="text-xs text-muted-foreground">
            {getSessionDuration(activity.loginTime, activity.logoutTime)}
          </div>
        );
    }
  };

  return (
    <div
      role="row"
      aria-label={buildActivityRowAriaLabel(activity, browserLabel)}
      className={`grid h-full items-center gap-3 border-b border-border/70 px-3 hover:bg-muted/50 ${
        density === "compact" ? "py-2" : "py-3"
      }`}
      style={{ gridTemplateColumns }}
      data-density={density}
      data-testid={`activity-row-${activity.id}`}
    >
      {canModerateActivity ? (
        <div role="cell" className="flex items-center">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggleSelected(activity.id, Boolean(checked))}
            aria-label={`Select activity log ${activity.id}`}
          />
        </div>
      ) : null}
      {columns.map((column) => (
        <div key={column} role="cell" className="min-w-0">
          {renderColumn(column)}
        </div>
      ))}
      {canModerateActivity ? (
        <div role="cell">
          <ActivityDesktopLogActions
            actionLoading={actionLoading}
            activity={activity}
            onBanClick={onBanClick}
            onDeleteClick={onDeleteClick}
            onKickClick={onKickClick}
            onInvestigateClick={onInvestigateClick}
          />
        </div>
      ) : null}
    </div>
  );
}
