import { memo } from "react";
import { Shield, Trash2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canBanActivity,
  canKickActivity,
} from "@/pages/activity/activity-desktop-logs-utils";
import type { ActivityDesktopLogActionsProps } from "@/pages/activity/activity-desktop-logs-shared";

export const ActivityDesktopLogActions = memo(function ActivityDesktopLogActions({
  actionLoading,
  activity,
  onBanClick,
  onDeleteClick,
  onKickClick,
}: ActivityDesktopLogActionsProps) {
  const isActionDisabled = actionLoading === activity.id;

  return (
    <div className="flex gap-1 justify-end">
      {canKickActivity(activity) ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onKickClick(activity)}
          disabled={isActionDisabled}
          data-testid={`button-kick-${activity.id}`}
          aria-label={`Kick activity session for ${activity.username}`}
        >
          <UserX className="w-4 h-4" />
        </Button>
      ) : null}
      {canBanActivity(activity) ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onBanClick(activity)}
          disabled={isActionDisabled}
          className="text-destructive"
          data-testid={`button-ban-${activity.id}`}
          aria-label={`Ban account access for ${activity.username}`}
        >
          <Shield className="w-4 h-4" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDeleteClick(activity)}
        disabled={isActionDisabled}
        className="text-destructive"
        data-testid={`button-delete-${activity.id}`}
        aria-label={`Delete activity log for ${activity.username}`}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
});
