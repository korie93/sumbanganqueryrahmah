import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ActivityLogsTableProps } from "@/pages/activity/types";
import {
  formatActivityTime,
  getSessionDuration,
  getStatusBadge,
  parseActivityUserAgent,
} from "@/pages/activity/utils";
import { Shield, Trash2, UserX } from "lucide-react";

type ActivityDesktopLogsTableProps = Pick<
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
  return (
    <div className="max-h-[400px] overflow-y-auto">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              {canModerateActivity ? (
                <th className="text-left p-3 font-medium text-muted-foreground w-[50px]">
                  <Checkbox
                    checked={allVisibleSelected || (partiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => onToggleSelectAllVisible(Boolean(checked))}
                    aria-label="Select all visible activity logs"
                  />
                </th>
              ) : null}
              <th className="text-left p-3 font-medium text-muted-foreground">User</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left p-3 font-medium text-muted-foreground">IP</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Browser</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Login</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Logout</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Duration</th>
              {canModerateActivity ? (
                <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {activities.map((activity) => {
              const { browser, version } = parseActivityUserAgent(activity.browser);
              return (
                <tr
                  key={activity.id}
                  className="border-t border-border hover:bg-muted/50"
                  data-testid={`activity-row-${activity.id}`}
                >
                  {canModerateActivity ? (
                    <td className="p-3 align-top">
                      <Checkbox
                        checked={selectedActivityIds.has(activity.id)}
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
                  <td className="p-3 text-muted-foreground text-xs">{browser}{version ? ` ${version}` : ""}</td>
                  <td className="p-3 text-muted-foreground text-xs">{formatActivityTime(activity.loginTime)}</td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {activity.logoutTime ? formatActivityTime(activity.logoutTime) : "-"}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {getSessionDuration(activity.loginTime, activity.logoutTime)}
                  </td>
                  {canModerateActivity ? (
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        {activity.isActive ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onKickClick(activity)}
                              disabled={actionLoading === activity.id}
                              data-testid={`button-kick-${activity.id}`}
                            >
                              <UserX className="w-4 h-4" />
                            </Button>
                            {activity.role !== "superuser" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onBanClick(activity)}
                                disabled={actionLoading === activity.id}
                                className="text-destructive"
                                data-testid={`button-ban-${activity.id}`}
                              >
                                <Shield className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteClick(activity)}
                          disabled={actionLoading === activity.id}
                          className="text-destructive"
                          data-testid={`button-delete-${activity.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
