import { useRef } from "react";
import { MoreHorizontal, Search, Shield, Trash2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canBanActivity, canKickActivity } from "./activity-desktop-logs-utils";
import type { ActivityDesktopLogActionsProps } from "./activity-desktop-logs-shared";
import { useActivityOverlayFocus } from "./ActivityOverlayFocusContext";
import type { ActivityOverlay } from "./activity-overlay-focus";

export function ActivityRowActions({
  actionLoading,
  activity,
  onBanClick,
  onDeleteClick,
  onKickClick,
  onInvestigateClick,
  mobile = false,
}: ActivityDesktopLogActionsProps & { mobile?: boolean }) {
  const overlayFocus = useActivityOverlayFocus();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const handingOffFocus = useRef(false);
  const isActionDisabled = actionLoading === activity.id;
  const openAction = (overlay: ActivityOverlay, action: ActivityDesktopLogActionsProps["onBanClick"]) => {
    overlayFocus?.remember(overlay, triggerRef.current);
    handingOffFocus.current = true;
    action(activity);
  };

  return (
    <div className={mobile ? "grid grid-cols-[minmax(0,1fr)_auto] gap-2" : "flex justify-end gap-1"}>
      <Button
        type="button"
        variant={mobile ? "outline" : "ghost"}
        size={mobile ? "default" : "icon"}
        title="Investigate session"
        onClick={(event) => {
          overlayFocus?.remember("investigate", event.currentTarget);
          onInvestigateClick(activity);
        }}
        aria-label={`Investigate session for ${activity.username}`}
        data-testid={`button-investigate-${activity.id}`}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        {mobile ? <span className="ml-2">Investigate</span> : null}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant={mobile ? "outline" : "ghost"}
            size="icon"
            disabled={isActionDisabled}
            aria-label={`More actions for ${activity.username}`}
            data-testid={`button-activity-actions-${activity.id}`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48 max-w-[calc(100vw-1.5rem)]"
          onCloseAutoFocus={(event) => {
            if (handingOffFocus.current) event.preventDefault();
            handingOffFocus.current = false;
          }}
        >
          {canKickActivity(activity) ? (
            <DropdownMenuItem
              className="min-h-11 sm:min-h-9"
              disabled={isActionDisabled}
              onSelect={() => openAction("kick", onKickClick)}
              aria-label={`Force logout ${activity.username}`}
              data-testid={`button-kick-${activity.id}`}
            >
              <UserX aria-hidden="true" />Force logout
            </DropdownMenuItem>
          ) : null}
          {canBanActivity(activity) ? (
            <DropdownMenuItem
              className="min-h-11 text-destructive focus:text-destructive sm:min-h-9"
              disabled={isActionDisabled}
              onSelect={() => openAction("ban", onBanClick)}
              aria-label={`Ban ${activity.username}`}
              data-testid={`button-ban-${activity.id}`}
            >
              <Shield aria-hidden="true" />Ban session
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            className="min-h-11 text-destructive focus:text-destructive sm:min-h-9"
            disabled={isActionDisabled}
            onSelect={() => openAction("delete", onDeleteClick)}
            aria-label={`Delete activity log for ${activity.username}`}
            data-testid={`button-delete-${activity.id}`}
          >
            <Trash2 aria-hidden="true" />Delete log
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
