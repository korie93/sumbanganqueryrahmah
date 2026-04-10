import { Checkbox } from "@/components/ui/checkbox";
import type { ActivityDesktopLogsHeaderProps } from "@/pages/activity/activity-desktop-logs-shared";

export function ActivityDesktopLogsHeader({
  allVisibleSelected,
  canModerateActivity,
  gridTemplateColumns,
  onToggleSelectAllVisible,
  partiallySelected,
}: ActivityDesktopLogsHeaderProps) {
  return (
    <div role="rowgroup">
      <div
        className="sticky top-0 z-[var(--z-sticky-header)] grid items-center gap-3 border-b border-border bg-muted/95 px-3 py-3 text-left text-sm font-medium text-muted-foreground backdrop-blur-sm"
        role="row"
        style={{ gridTemplateColumns }}
      >
        {canModerateActivity ? (
          <div className="flex items-center" role="columnheader" aria-label="Selection">
            <Checkbox
              checked={allVisibleSelected || (partiallySelected ? "indeterminate" : false)}
              onCheckedChange={(checked) => onToggleSelectAllVisible(Boolean(checked))}
              aria-label="Select all visible activity logs"
            />
          </div>
        ) : null}
        <div role="columnheader">User</div>
        <div role="columnheader">Status</div>
        <div role="columnheader">IP</div>
        <div role="columnheader">Browser</div>
        <div role="columnheader">Login</div>
        <div role="columnheader">Logout</div>
        <div role="columnheader">Duration</div>
        {canModerateActivity ? (
          <div className="text-right" role="columnheader">
            Actions
          </div>
        ) : null}
      </div>
    </div>
  );
}
