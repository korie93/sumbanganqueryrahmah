import { Search, Shield, Trash2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  canBanActivity,
  canKickActivity,
} from "@/pages/activity/activity-desktop-logs-utils";
import type { ActivityDesktopLogActionsProps } from "@/pages/activity/activity-desktop-logs-shared";

export function ActivityDesktopLogActions({
  actionLoading,
  activity,
  onBanClick,
  onDeleteClick,
  onKickClick,
  onInvestigateClick,
}: ActivityDesktopLogActionsProps) {
  const isActionDisabled = actionLoading === activity.id;

  return (
    <div className="flex gap-1 justify-end">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onInvestigateClick(activity)}
            aria-label={`Investigate session for ${activity.username}`}
            data-testid={`button-investigate-${activity.id}`}
          >
            <Search className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Investigate session</TooltipContent>
      </Tooltip>
      {canKickActivity(activity) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onKickClick(activity)}
              disabled={isActionDisabled}
              aria-label={`Force logout ${activity.username}`}
              data-testid={`button-kick-${activity.id}`}
            >
              <UserX className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Force logout</TooltipContent>
        </Tooltip>
      ) : null}
      {canBanActivity(activity) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onBanClick(activity)}
              disabled={isActionDisabled}
              className="text-destructive"
              aria-label={`Ban ${activity.username}`}
              data-testid={`button-ban-${activity.id}`}
            >
              <Shield className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ban session</TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDeleteClick(activity)}
            disabled={isActionDisabled}
            className="text-destructive"
            aria-label={`Delete activity log for ${activity.username}`}
            data-testid={`button-delete-${activity.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete log</TooltipContent>
      </Tooltip>
    </div>
  );
}
