import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ActivityDesktopLogsHeaderProps } from "@/pages/activity/activity-desktop-logs-shared";

export function ActivityDesktopLogsHeader({
  allVisibleSelected,
  canModerateActivity,
  gridClassName,
  onToggleSelectAllVisible,
  partiallySelected,
}: ActivityDesktopLogsHeaderProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-[var(--z-sticky-header)] grid items-center gap-3 border-b border-border bg-muted/95 px-3 py-3 text-left text-sm font-medium text-muted-foreground backdrop-blur-sm",
        gridClassName,
      )}
    >
      {canModerateActivity ? (
        <div className="flex items-center">
          <Checkbox
            checked={allVisibleSelected || (partiallySelected ? "indeterminate" : false)}
            onCheckedChange={(checked) => onToggleSelectAllVisible(Boolean(checked))}
            aria-label="Select all visible activity logs"
          />
        </div>
      ) : null}
      <div>User</div>
      <div>Status</div>
      <div>IP</div>
      <div>Browser</div>
      <div>Login</div>
      <div>Logout</div>
      <div>Duration</div>
      {canModerateActivity ? <div className="text-right">Actions</div> : null}
    </div>
  );
}
