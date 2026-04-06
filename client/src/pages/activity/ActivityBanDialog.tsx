import { Shield } from "lucide-react";
import { ActivityConfirmationDialog } from "@/pages/activity/ActivityConfirmationDialog";
import { getBanDialogDescription } from "@/pages/activity/activity-action-dialog-utils";
import type { ActivitySelectedActivityDialogProps } from "@/pages/activity/activity-action-dialog-shared";

export function ActivityBanDialog({
  onConfirm,
  onOpenChange,
  open,
  selectedActivity,
}: ActivitySelectedActivityDialogProps) {
  return (
    <ActivityConfirmationDialog
      confirmClassName="bg-destructive text-destructive-foreground"
      confirmLabel="Ban"
      description={getBanDialogDescription(selectedActivity?.username)}
      icon={<Shield className="w-5 h-5 text-destructive" />}
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      open={open}
      testId="button-confirm-ban"
      title="Ban User?"
    />
  );
}
