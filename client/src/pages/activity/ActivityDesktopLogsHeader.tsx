import { Checkbox } from "@/components/ui/checkbox";

type ActivityDesktopLogsHeaderProps = {
  allVisibleSelected: boolean;
  canModerateActivity: boolean;
  onToggleSelectAllVisible: (checked: boolean) => void;
  partiallySelected: boolean;
};

export function ActivityDesktopLogsHeader({
  allVisibleSelected,
  canModerateActivity,
  onToggleSelectAllVisible,
  partiallySelected,
}: ActivityDesktopLogsHeaderProps) {
  return (
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
  );
}
