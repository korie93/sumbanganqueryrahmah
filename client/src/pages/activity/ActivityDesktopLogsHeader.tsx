import { Checkbox } from "@/components/ui/checkbox";
import { ACTIVITY_COLUMN_DEFINITIONS } from "@/pages/activity/activity-column-preferences";
import type { ActivityDesktopLogsHeaderProps } from "@/pages/activity/activity-desktop-logs-shared";

export function ActivityDesktopLogsHeader({
  allVisibleSelected,
  canModerateActivity,
  columns,
  density,
  gridTemplateColumns,
  onToggleSelectAllVisible,
  partiallySelected,
}: ActivityDesktopLogsHeaderProps) {
  return (
    <div
      role="row"
      className={`sticky top-0 z-[var(--z-sticky-header)] grid items-center gap-3 border-b border-border bg-muted/95 px-3 text-left text-sm font-medium text-muted-foreground sqr-backdrop-blur-sm ${
        density === "compact" ? "py-2" : "py-3"
      }`}
      style={{ gridTemplateColumns }}
    >
      {canModerateActivity ? (
        <div role="columnheader" className="flex items-center">
          <Checkbox
            checked={allVisibleSelected || (partiallySelected ? "indeterminate" : false)}
            onCheckedChange={(checked) => onToggleSelectAllVisible(Boolean(checked))}
            aria-label="Select all visible activity logs"
          />
        </div>
      ) : null}
      {columns.map((column) => (
        <div key={column} role="columnheader">
          {ACTIVITY_COLUMN_DEFINITIONS.find((definition) => definition.id === column)?.label}
        </div>
      ))}
      {canModerateActivity ? (
        <div role="columnheader" className="text-right">Actions</div>
      ) : null}
    </div>
  );
}
