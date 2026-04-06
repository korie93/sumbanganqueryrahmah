import { Trash2 } from "lucide-react";
import { ActivityConfirmationDialog } from "@/pages/activity/ActivityConfirmationDialog";
import { getDeleteDialogDescription } from "@/pages/activity/activity-action-dialog-utils";
import type { ActivitySelectedActivityDialogProps } from "@/pages/activity/activity-action-dialog-shared";

export function ActivityDeleteDialog({
  onConfirm,
  onOpenChange,
  open,
  selectedActivity,
}: ActivitySelectedActivityDialogProps) {
  return (
    <ActivityConfirmationDialog
      confirmClassName="bg-destructive text-destructive-foreground"
      confirmLabel="Delete"
      description={getDeleteDialogDescription(selectedActivity?.username)}
      icon={<Trash2 className="w-5 h-5 text-destructive" />}
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      open={open}
      testId="button-confirm-delete"
      title="Delete Activity Log?"
    />
  );
}
