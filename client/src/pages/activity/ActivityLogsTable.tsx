import { Activity as ActivityIcon, ChevronDown, Shield, Trash2, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ActivityRecord } from "@/pages/activity/types";
import { formatActivityTime, getSessionDuration, getStatusBadge, parseActivityUserAgent } from "@/pages/activity/utils";

interface ActivityLogsTableProps {
  actionLoading: string | null;
  activities: ActivityRecord[];
  canModerateActivity: boolean;
  loading: boolean;
  logsOpen: boolean;
  onBanClick: (activity: ActivityRecord) => void;
  onDeleteClick: (activity: ActivityRecord) => void;
  onKickClick: (activity: ActivityRecord) => void;
  onLogsOpenChange: (open: boolean) => void;
  onToggleSelected: (activityId: string, checked: boolean) => void;
  onToggleSelectAllVisible: (checked: boolean) => void;
  selectedActivityIds: Set<string>;
  allVisibleSelected: boolean;
  partiallySelected: boolean;
}

export function ActivityLogsTable({
  actionLoading,
  activities,
  canModerateActivity,
  loading,
  logsOpen,
  onBanClick,
  onDeleteClick,
  onKickClick,
  onLogsOpenChange,
  onToggleSelected,
  onToggleSelectAllVisible,
  selectedActivityIds,
  allVisibleSelected,
  partiallySelected,
}: ActivityLogsTableProps) {
  const isMobile = useIsMobile();

  return (
    <Collapsible open={logsOpen} onOpenChange={onLogsOpenChange}>
      <div className="glass-wrapper p-6" data-floating-ai-avoid="true">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex items-center justify-between gap-2 p-0 h-auto mb-4" data-testid="button-toggle-logs">
            <div className="flex items-center gap-2">
              <ActivityIcon className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">Activity Logs</span>
              <Badge variant="secondary">{activities.length} records</Badge>
            </div>
            <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${logsOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {loading ? (
            <div className="py-8 text-center">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="py-8 text-center">
              <ActivityIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No activity records</p>
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {canModerateActivity ? (
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Select visible logs</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedActivityIds.size} selected
                    </p>
                  </div>
                  <Checkbox
                    checked={allVisibleSelected || (partiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => onToggleSelectAllVisible(Boolean(checked))}
                    aria-label="Select all visible activity logs"
                  />
                </div>
              ) : null}

              {activities.map((activity) => {
                const { browser, version } = parseActivityUserAgent(activity.browser);

                return (
                  <div
                    key={activity.id}
                    className="space-y-3 rounded-xl border border-border/70 bg-card/80 p-4 shadow-xs"
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
                    </div>

                    <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">IP Address</p>
                        <p className="break-all text-foreground/90">{activity.ipAddress || "-"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Browser</p>
                        <p className="break-words text-foreground/90">{browser}{version ? ` ${version}` : ""}</p>
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
                      <div className="space-y-1 sm:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Session Duration</p>
                        <p className="text-foreground/90">{getSessionDuration(activity.loginTime, activity.logoutTime)}</p>
                      </div>
                    </div>

                    {canModerateActivity ? (
                      <div className="flex flex-wrap gap-2">
                        {activity.isActive ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onKickClick(activity)}
                              disabled={actionLoading === activity.id}
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
                                className="text-destructive"
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
                          className="text-destructive"
                          data-testid={`button-delete-${activity.id}`}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
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
                        <tr key={activity.id} className="border-t border-border hover:bg-muted/50" data-testid={`activity-row-${activity.id}`}>
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
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
