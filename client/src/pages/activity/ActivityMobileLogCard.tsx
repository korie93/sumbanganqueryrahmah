import { memo } from "react";
import { Shield, Trash2, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ActivityRecord } from "@/pages/activity/types";
import {
  formatActivityTime,
  getSessionDuration,
  getStatusBadge,
} from "@/pages/activity/utils";
import { buildActivityRowAriaLabel } from "@/pages/activity/activity-row-aria";

type ActivityMobileLogCardProps = {
  actionLoading: string | null;
  activity: ActivityRecord;
  browserLabel: string;
  canModerateActivity: boolean;
  onBanClick: (activity: ActivityRecord) => void;
  onDeleteClick: (activity: ActivityRecord) => void;
  onKickClick: (activity: ActivityRecord) => void;
  onToggleSelected: (activityId: string, checked: boolean) => void;
  position?: {
    index: number;
    total: number;
  } | undefined;
  selected: boolean;
};

export const ActivityMobileLogCard = memo(function ActivityMobileLogCard({
  actionLoading,
  activity,
  browserLabel,
  canModerateActivity,
  onBanClick,
  onDeleteClick,
  onKickClick,
  onToggleSelected,
  position,
  selected,
}: ActivityMobileLogCardProps) {
  const sessionDuration = getSessionDuration(activity.loginTime, activity.logoutTime);
  const actionPending = actionLoading === activity.id;

  return (
    <div
      role="group"
      aria-label={buildActivityRowAriaLabel(activity, browserLabel, position)}
      className="flex h-full flex-col space-y-3 rounded-2xl border border-border/70 bg-card/80 p-3.5 shadow-xs"
      data-testid={`activity-row-${activity.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex items-start gap-2">
            {canModerateActivity ? (
              <Checkbox
                checked={selected}
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
          {sessionDuration}
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
          <p className="text-foreground/90">{sessionDuration}</p>
        </div>
      </div>

      {canModerateActivity ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {activity.isActive ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onKickClick(activity)}
                disabled={actionPending}
                aria-label={`Force logout ${activity.username}`}
                className="w-full"
                data-testid={`button-kick-${activity.id}`}
              >
                <UserX className="mr-2 h-4 w-4" />
                Force Logout
              </Button>
              {activity.role !== "superuser" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onBanClick(activity)}
                  disabled={actionPending}
                  aria-label={`Ban ${activity.username}`}
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
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDeleteClick(activity)}
            disabled={actionPending}
            aria-label={`Delete activity log for ${activity.username}`}
            className="w-full text-destructive"
            data-testid={`button-delete-${activity.id}`}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
});
