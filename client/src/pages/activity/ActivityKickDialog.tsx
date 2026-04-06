import { AlertTriangle } from "lucide-react";
import { ActivityConfirmationDialog } from "@/pages/activity/ActivityConfirmationDialog";
import { getKickDialogDescription } from "@/pages/activity/activity-action-dialog-utils";
import type { ActivitySelectedActivityDialogProps } from "@/pages/activity/activity-action-dialog-shared";

export function ActivityKickDialog({
  onConfirm,
  onOpenChange,
  open,
  selectedActivity,
}: ActivitySelectedActivityDialogProps) {
  return (
    <ActivityConfirmationDialog
      confirmLabel="Kick"
      description={getKickDialogDescription(selectedActivity?.username)}
      icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      open={open}
      testId="button-confirm-kick"
      title="Kick User?"
    />
  );
}
