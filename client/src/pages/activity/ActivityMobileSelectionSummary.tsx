import { memo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { getActivitySelectionCountLabel } from "@/pages/activity/activity-logs-table-utils";

type ActivityMobileSelectionSummaryProps = {
  allVisibleSelected: boolean;
  onToggleSelectAllVisible: (checked: boolean) => void;
  partiallySelected: boolean;
  selectedCount: number;
};

export const ActivityMobileSelectionSummary = memo(function ActivityMobileSelectionSummary({
  allVisibleSelected,
  onToggleSelectAllVisible,
  partiallySelected,
  selectedCount,
}: ActivityMobileSelectionSummaryProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Select visible logs</p>
        <p className="text-xs text-muted-foreground">
          {getActivitySelectionCountLabel(selectedCount)}
        </p>
      </div>
      <Checkbox
        checked={allVisibleSelected || (partiallySelected ? "indeterminate" : false)}
        onCheckedChange={(checked) => onToggleSelectAllVisible(Boolean(checked))}
        aria-label="Select all visible activity logs"
      />
    </div>
  );
});
