import { Trash2 } from "lucide-react";
import { ActivityConfirmationDialog } from "@/pages/activity/ActivityConfirmationDialog";
import { getBulkDeleteDialogDescription } from "@/pages/activity/activity-action-dialog-utils";
import type { ActivityBulkDeleteDialogProps } from "@/pages/activity/activity-action-dialog-shared";

export function ActivityBulkDeleteDialog({
  onConfirm,
  onOpenChange,
  open,
  selectedBulkCount,
}: ActivityBulkDeleteDialogProps) {
  return (
    <ActivityConfirmationDialog
      confirmClassName="bg-destructive text-destructive-foreground"
      confirmLabel="Delete Selected"
      description={getBulkDeleteDialogDescription(selectedBulkCount)}
      icon={<Trash2 className="w-5 h-5 text-destructive" />}
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      open={open}
      testId="button-confirm-bulk-delete"
      title="Delete Selected Logs?"
    />
  );
}
